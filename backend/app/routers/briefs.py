from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import User, Brief, Post, Shortlist, CreatorProfile, Proposal
from ..schemas import ClarifyIn, StructureIn, BriefIn
from ..security import get_current_user, require_brand
from ..serializers import user_brief, profile_out
from ..ratelimit import ai_limit
from ..ai import service as ai, fallbacks as fb
from ..ai.embeddings import embed, cosine
from ..services import matching
from ..services.moderation import moderate_text
from ..services.notify import notify
from ..services.texts import brief_text, clean_text

router = APIRouter(prefix="/briefs", tags=["briefs"])


def _clean_structured(s: dict) -> dict:
    """Validate/sanitize a (user-edited) structured brief. Unknown stays null."""
    def txt(k, n=300):
        v = s.get(k)
        return clean_text(v, n) or None if isinstance(v, str) else None

    def lst(k, n=8):
        v = s.get(k)
        return [clean_text(str(x), 80) for x in v][:n] if isinstance(v, list) else []

    def num(x):
        try:
            return None if x in (None, "") else max(0, int(float(x)))
        except (TypeError, ValueError):
            return None
    b = s.get("budget_range_inr") if isinstance(s.get("budget_range_inr"), dict) else {}
    lo, hi = num(b.get("min")), num(b.get("max"))
    if lo is not None and hi is not None and lo > hi:
        lo, hi = hi, lo
    dels = [{"type": clean_text(str(d.get("type", "")), 60), "quantity": num(d.get("quantity")) or 1}
            for d in (s.get("deliverables") or []) if isinstance(d, dict) and d.get("type")][:8]
    fmt = s.get("format") if s.get("format") in ("video", "image", "audio", "mixed") else None
    out = {"title": txt("title", 200) or "Untitled brief", "goal": txt("goal"), "target_audience": txt("target_audience"),
           "format": fmt, "platform": txt("platform", 80), "duration_or_size": txt("duration_or_size", 80),
           "tone_and_style": lst("tone_and_style"), "deliverables": dels, "budget_range_inr": {"min": lo, "max": hi},
           "deadline_days": num(s.get("deadline_days")), "preferred_tools": lst("preferred_tools"),
           "must_have": lst("must_have"), "avoid": lst("avoid"), "categories": [c.lower() for c in lst("categories", 5)]}
    out["search_summary"] = txt("search_summary", 600) or fb.build_summary(out)
    return out


def _brief_out(db: Session, b: Brief, extra: dict | None = None) -> dict:
    d = {"id": b.id, "title": b.title, "raw_idea": b.raw_idea, "structured": b.structured, "status": b.status,
         "created_at": b.created_at.isoformat(), "brand": user_brief(b.brand),
         "proposal_count": db.scalar(select(func.count()).select_from(Proposal).where(Proposal.brief_id == b.id)) or 0}
    if extra:
        d.update(extra)
    return d


def _own_brief(db: Session, brief_id: int, user: User) -> Brief:
    b = db.get(Brief, brief_id)
    if not b:
        raise HTTPException(404, "Brief not found.")
    if b.brand_id != user.id:
        raise HTTPException(403, "This is not your brief.")
    return b


@router.post("/clarify", dependencies=[Depends(ai_limit)])
def clarify(data: ClarifyIn, user: User = Depends(require_brand)):
    return ai.clarify(clean_text(data.rough_idea, 2000))


@router.post("/structure", dependencies=[Depends(ai_limit)])
def structure(data: StructureIn, user: User = Depends(require_brand)):
    return ai.structure(clean_text(data.rough_idea, 2000), data.answers)


@router.post("", status_code=201)
def create_brief(data: BriefIn, user: User = Depends(require_brand), db: Session = Depends(get_db)):
    idea = clean_text(data.rough_idea, 2000)
    s = _clean_structured(data.structured)
    mod = moderate_text(f"{idea} {s['title']}")
    if not mod["allowed"]:
        raise HTTPException(422, mod["reason"] or "This brief cannot be published.")
    if not s["categories"]:
        s["categories"] = fb.find_categories(f"{idea} {s['search_summary']}")
    emb = embed(brief_text(s, idea))
    b = Brief(brand_id=user.id, title=s["title"], raw_idea=idea, structured=s, embedding=emb, status="open")
    db.add(b)
    db.flush()
    bud = s["budget_range_inr"]
    caption = s.get("goal") or idea
    db.add(Post(author_id=user.id, kind="brief", caption=clean_text(caption, 400), media=[], brief_id=b.id,
                declared_tools=s["preferred_tools"], hashtags=[], tags={"style_tags": s["tone_and_style"],
                "industry_fit": s["categories"], "medium": s["format"] or ""}, embedding=emb))
    db.commit()
    db.refresh(b)
    return _brief_out(db, b)


@router.get("")
def list_briefs(status: str | None = Query(None, pattern="^(open|in_progress|closed)$"),
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(Brief)
    if user.role == "brand":
        q = q.where(Brief.brand_id == user.id)
    else:
        q = q.where(Brief.status == (status or "open"))
    if status and user.role == "brand":
        q = q.where(Brief.status == status)
    rows = db.scalars(q.order_by(Brief.created_at.desc()).limit(100)).all()
    if user.role == "creator":
        prof = db.get(CreatorProfile, user.id)
        mine = {p.brief_id: p for p in db.scalars(select(Proposal).where(Proposal.creator_id == user.id)).all()}
        out = [_brief_out(db, b, {"fit": matching.fit_percent(db, b, prof) if prof else None,
                                  "my_proposal_id": mine[b.id].id if b.id in mine else None}) for b in rows]
        out.sort(key=lambda d: -(d["fit"] or 0))
        return out
    return [_brief_out(db, b) for b in rows]


@router.get("/{brief_id}")
def get_brief(brief_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = db.get(Brief, brief_id)
    if not b:
        raise HTTPException(404, "Brief not found.")
    extra = {"is_owner": b.brand_id == user.id}
    if user.role == "creator":
        prof = db.get(CreatorProfile, user.id)
        mine = db.scalar(select(Proposal).where(Proposal.brief_id == b.id, Proposal.creator_id == user.id))
        extra.update({"fit": matching.fit_percent(db, b, prof) if prof else None,
                      "my_proposal_id": mine.id if mine else None})
    return _brief_out(db, b, extra)


@router.put("/{brief_id}")
def update_brief(brief_id: int, data: BriefIn, user: User = Depends(require_brand), db: Session = Depends(get_db)):
    b = _own_brief(db, brief_id, user)
    s = _clean_structured(data.structured)
    b.structured, b.title = s, s["title"]
    b.raw_idea = clean_text(data.rough_idea, 2000)
    b.embedding = embed(brief_text(s, b.raw_idea))
    post = db.scalar(select(Post).where(Post.brief_id == b.id))
    if post:
        post.caption, post.embedding = clean_text(s.get("goal") or b.raw_idea, 400), b.embedding
    db.commit()
    return _brief_out(db, b)


@router.post("/{brief_id}/match")
def match(brief_id: int, user: User = Depends(require_brand), db: Session = Depends(get_db)):
    b = _own_brief(db, brief_id, user)
    return {"brief_id": b.id, "matches": matching.run_match(db, b)}


@router.get("/{brief_id}/shortlist")
def get_shortlist(brief_id: int, user: User = Depends(require_brand), db: Session = Depends(get_db)):
    b = _own_brief(db, brief_id, user)
    ids = db.scalars(select(Shortlist.creator_id).where(Shortlist.brief_id == b.id)).all()
    return [user_brief(u) for u in db.scalars(select(User).where(User.id.in_(ids or [0]))).all()]


@router.post("/{brief_id}/shortlist/{creator_id}")
def add_shortlist(brief_id: int, creator_id: int, user: User = Depends(require_brand), db: Session = Depends(get_db)):
    b = _own_brief(db, brief_id, user)
    c = db.get(User, creator_id)
    if not c or c.role != "creator":
        raise HTTPException(404, "Creator not found.")
    if not db.get(Shortlist, (b.id, creator_id)):
        db.add(Shortlist(brief_id=b.id, creator_id=creator_id))
        notify(db, creator_id, "shortlist", user, brief_id=b.id)
        db.commit()
    return {"shortlisted": True}


@router.delete("/{brief_id}/shortlist/{creator_id}")
def remove_shortlist(brief_id: int, creator_id: int, user: User = Depends(require_brand), db: Session = Depends(get_db)):
    b = _own_brief(db, brief_id, user)
    row = db.get(Shortlist, (b.id, creator_id))
    if row:
        db.delete(row)
        db.commit()
    return {"shortlisted": False}


@router.get("/{brief_id}/proposals")
def brief_proposals(brief_id: int, user: User = Depends(require_brand), db: Session = Depends(get_db)):
    b = _own_brief(db, brief_id, user)
    rows = db.scalars(select(Proposal).where(Proposal.brief_id == b.id).order_by(Proposal.created_at.desc())).all()
    return [{"id": p.id, "creator": user_brief(p.creator), "text": p.text, "price_inr": p.price_inr,
             "timeline_days": p.timeline_days, "status": p.status, "created_at": p.created_at.isoformat(),
             "rating": round(p.creator.profile.rating or 0, 2) if p.creator.profile else 0,
             "rating_count": p.creator.profile.rating_count if p.creator.profile else 0} for p in rows]


@router.post("/{brief_id}/pricing", dependencies=[Depends(ai_limit)])
def pricing(brief_id: int, user: User = Depends(require_brand), db: Session = Depends(get_db)):
    b = _own_brief(db, brief_id, user)
    s = b.structured or {}
    med = matching.required_medium(s)
    profs = [p for p in db.scalars(select(CreatorProfile)).all() if p.price_min and
             (not med or med in [m.lower() for m in p.mediums or []])]
    profs.sort(key=lambda p: -cosine(b.embedding, p.embedding))
    samples = [int((p.price_min + (p.price_max or p.price_min)) / 2) for p in profs[:10]]
    return {**ai.suggest_price(s, samples), "sample_size": len(samples)}


@router.post("/{brief_id}/concepts", dependencies=[Depends(ai_limit)])
def concepts(brief_id: int, user: User = Depends(require_brand), db: Session = Depends(get_db)):
    b = _own_brief(db, brief_id, user)
    return ai.concept_board(b.structured or {})
