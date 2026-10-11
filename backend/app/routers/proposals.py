from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import (User, Brief, Proposal, Milestone, Review, Conversation, ConversationMember, CreatorProfile)
from ..schemas import ProposalDraftIn, ProposalIn, StatusIn, MilestoneIn, MilestonePatch, ReviewIn
from ..security import get_current_user, require_creator, require_brand
from ..serializers import user_brief
from ..ratelimit import ai_limit
from ..ai import service as ai
from ..services import matching
from ..services.moderation import moderate_text
from ..services.notify import notify
from ..services.texts import clean_text

router = APIRouter(tags=["proposals"])


def _ms(m: Milestone) -> dict:
    return {"id": m.id, "title": m.title, "amount_inr": m.amount_inr, "status": m.status, "due_in_days": m.due_in_days}


def _proposal_out(db: Session, p: Proposal, detail: bool = False) -> dict:
    conv = db.scalar(select(Conversation.id).where(Conversation.proposal_id == p.id))
    d = {"id": p.id, "brief_id": p.brief_id, "brief_title": p.brief.title, "brief_status": p.brief.status,
         "creator": user_brief(p.creator), "brand": user_brief(p.brief.brand), "text": p.text, "price_inr": p.price_inr,
         "timeline_days": p.timeline_days, "status": p.status, "created_at": p.created_at.isoformat(),
         "conversation_id": conv, "milestones": [_ms(m) for m in p.milestones]}
    if detail:
        r = db.scalar(select(Review).where(Review.proposal_id == p.id))
        d["review"] = {"rating": r.rating, "comment": r.comment} if r else None
    return d


def _participant(db: Session, pid: int, user: User) -> Proposal:
    p = db.get(Proposal, pid)
    if not p:
        raise HTTPException(404, "Proposal not found.")
    if user.id not in (p.creator_id, p.brief.brand_id):
        raise HTTPException(403, "You are not part of this proposal.")
    return p


@router.post("/proposals/draft", dependencies=[Depends(ai_limit)])
def draft(data: ProposalDraftIn, user: User = Depends(require_creator), db: Session = Depends(get_db)):
    b = db.get(Brief, data.brief_id)
    if not b:
        raise HTTPException(404, "Brief not found.")
    prof = db.get(CreatorProfile, user.id)
    s = {**(b.structured or {}), "categories": matching.brief_categories(b)}
    return ai.draft_proposal(s, matching.creator_summary(db, prof))


@router.post("/proposals", status_code=201)
def send_proposal(data: ProposalIn, user: User = Depends(require_creator), db: Session = Depends(get_db)):
    b = db.get(Brief, data.brief_id)
    if not b:
        raise HTTPException(404, "Brief not found.")
    if b.status != "open":
        raise HTTPException(409, "This brief is no longer open.")
    text = clean_text(data.text, 3000)
    mod = moderate_text(text)
    if not mod["allowed"]:
        raise HTTPException(422, mod["reason"] or "This proposal cannot be sent.")
    p = Proposal(brief_id=b.id, creator_id=user.id, text=text, price_inr=data.price_inr, timeline_days=data.timeline_days)
    db.add(p)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "You have already sent a proposal for this brief.")
    notify(db, b.brand_id, "proposal_received", user, proposal_id=p.id, brief_id=b.id)
    db.commit()
    return _proposal_out(db, p)


@router.get("/proposals/mine")
def mine(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == "creator":
        q = select(Proposal).where(Proposal.creator_id == user.id)
    else:
        q = select(Proposal).join(Brief, Brief.id == Proposal.brief_id).where(Brief.brand_id == user.id)
    return [_proposal_out(db, p) for p in db.scalars(q.order_by(Proposal.created_at.desc())).all()]


@router.get("/proposals/{pid}")
def get_proposal(pid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _proposal_out(db, _participant(db, pid, user), detail=True)


@router.post("/proposals/{pid}/status")
def set_status(pid: int, data: StatusIn, user: User = Depends(require_brand), db: Session = Depends(get_db)):
    p = _participant(db, pid, user)
    if p.status != "pending":
        raise HTTPException(409, f"This proposal is already {p.status}.")
    if p.brief.status != "open":
        raise HTTPException(409, "This brief is no longer open.")
    if data.status == "rejected":
        p.status = "rejected"
        notify(db, p.creator_id, "proposal_rejected", user, proposal_id=p.id, brief_id=p.brief_id)
        db.commit()
        return _proposal_out(db, p)
    p.status = "accepted"
    p.brief.status = "in_progress"
    for other in db.scalars(select(Proposal).where(Proposal.brief_id == p.brief_id, Proposal.id != p.id,
                                                     Proposal.status == "pending")).all():
        other.status = "rejected"
        notify(db, other.creator_id, "proposal_rejected", user, proposal_id=other.id, brief_id=p.brief_id)
    t, price = p.timeline_days, p.price_inr
    a, b_ = round(price * 0.30), round(price * 0.40)
    for title, amt, due in (("Concept", a, max(1, round(t * 0.3))), ("Draft", b_, max(1, round(t * 0.7))),
                            ("Final delivery", price - a - b_, t)):
        p.milestones.append(Milestone(title=title, amount_inr=amt, due_in_days=due, status="todo"))
    conv = Conversation(kind="proposal", proposal_id=p.id)
    conv.members = [ConversationMember(user_id=p.creator_id), ConversationMember(user_id=p.brief.brand_id)]
    db.add(conv)
    db.flush()
    notify(db, p.creator_id, "proposal_accepted", user, proposal_id=p.id, brief_id=p.brief_id, conversation_id=conv.id)
    db.commit()
    return _proposal_out(db, p)


@router.post("/proposals/{pid}/milestones", status_code=201)
def add_milestone(pid: int, data: MilestoneIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _participant(db, pid, user)
    if p.status != "accepted":
        raise HTTPException(409, "Milestones can only be added to an accepted proposal.")
    m = Milestone(proposal_id=p.id, title=clean_text(data.title, 160), amount_inr=data.amount_inr, due_in_days=data.due_in_days)
    db.add(m)
    db.commit()
    return _ms(m)


@router.patch("/proposals/{pid}/milestones/{mid}")
def patch_milestone(pid: int, mid: int, data: MilestonePatch, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    p = _participant(db, pid, user)
    m = db.get(Milestone, mid)
    if not m or m.proposal_id != p.id:
        raise HTTPException(404, "Milestone not found.")
    if p.status != "accepted":
        raise HTTPException(409, "This proposal is not in progress.")
    if data.status == "approved":
        if user.role != "brand":
            raise HTTPException(403, "Only the brand can approve a milestone.")
        if m.status != "delivered":
            raise HTTPException(409, "A milestone must be delivered before it can be approved.")
    else:
        if user.role != "creator":
            raise HTTPException(403, "Only the creator can update progress on a milestone.")
        if m.status == "approved":
            raise HTTPException(409, "This milestone is already approved.")
    m.status = data.status
    other = p.brief.brand_id if user.role == "creator" else p.creator_id
    notify(db, other, "milestone", user, proposal_id=p.id)
    db.flush()
    if all(x.status == "approved" for x in p.milestones) and p.milestones:
        p.status = "completed"
        p.brief.status = "closed"
    db.commit()
    return {"milestone": _ms(m), "proposal_status": p.status}


@router.post("/proposals/{pid}/review", status_code=201)
def review(pid: int, data: ReviewIn, user: User = Depends(require_brand), db: Session = Depends(get_db)):
    p = _participant(db, pid, user)
    if p.status != "completed":
        raise HTTPException(409, "You can review a creator once every milestone is approved.")
    if db.scalar(select(Review.id).where(Review.proposal_id == p.id)):
        raise HTTPException(409, "You have already reviewed this job.")
    comment = clean_text(data.comment, 2000)
    if comment and not moderate_text(comment)["allowed"]:
        raise HTTPException(422, "This review cannot be published.")
    db.add(Review(proposal_id=p.id, creator_id=p.creator_id, reviewer_id=user.id, rating=data.rating, comment=comment))
    db.flush()
    avg, cnt = db.execute(select(func.avg(Review.rating), func.count(Review.id)).where(Review.creator_id == p.creator_id)).one()
    prof = db.get(CreatorProfile, p.creator_id)
    prof.rating, prof.rating_count = float(avg), int(cnt)
    notify(db, p.creator_id, "review", user, proposal_id=p.id)
    db.commit()
    return {"rating": prof.rating, "rating_count": prof.rating_count}


@router.get("/creators/{creator_id}/reviews")
def creator_reviews(creator_id: int, db: Session = Depends(get_db)):
    rows = db.scalars(select(Review).where(Review.creator_id == creator_id).order_by(Review.created_at.desc())).all()
    return [{"id": r.id, "rating": r.rating, "comment": r.comment, "created_at": r.created_at.isoformat(),
             "reviewer": user_brief(r.reviewer)} for r in rows]
