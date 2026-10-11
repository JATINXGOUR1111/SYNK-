from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import (User, Conversation, ConversationMember, Message, Proposal, Notification)
from ..schemas import DirectConvIn, MessageIn
from ..security import get_current_user
from ..serializers import user_brief
from ..services.moderation import moderate_text
from ..services.notify import notify
from ..services.texts import clean_text

router = APIRouter(prefix="/conversations", tags=["messages"])


def _member_conv(db: Session, cid: int, user: User) -> Conversation:
    c = db.get(Conversation, cid)
    if not c:
        raise HTTPException(404, "Conversation not found.")
    if user.id not in [m.user_id for m in c.members]:
        raise HTTPException(403, "You are not part of this conversation.")
    return c


def _msg(m: Message) -> dict:
    return {"id": m.id, "conversation_id": m.conversation_id, "sender_id": m.sender_id, "body": m.body,
            "attachment_url": m.attachment_url, "created_at": m.created_at.isoformat(),
            "read_at": m.read_at.isoformat() if m.read_at else None}


def _header(db: Session, c: Conversation) -> dict | None:
    if c.kind != "proposal" or not c.proposal_id:
        return None
    p = db.get(Proposal, c.proposal_id)
    done = sum(1 for m in p.milestones if m.status == "approved")
    return {"proposal_id": p.id, "brief_title": p.brief.title, "status": p.status, "price_inr": p.price_inr,
            "milestones_total": len(p.milestones), "milestones_approved": done}


def _conv_out(db: Session, c: Conversation, me: User) -> dict:
    other_ids = [m.user_id for m in c.members if m.user_id != me.id]
    others = [user_brief(db.get(User, i)) for i in other_ids]
    last = db.scalar(select(Message).where(Message.conversation_id == c.id).order_by(Message.id.desc()).limit(1))
    unread = db.scalar(select(func.count()).select_from(Message).where(
        Message.conversation_id == c.id, Message.sender_id != me.id, Message.read_at.is_(None))) or 0
    return {"id": c.id, "kind": c.kind, "others": others, "unread": unread, "last_message": _msg(last) if last else None,
            "proposal": _header(db, c), "updated_at": (last.created_at if last else c.created_at).isoformat()}


@router.get("")
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ids = db.scalars(select(ConversationMember.conversation_id).where(ConversationMember.user_id == user.id)).all()
    convs = db.scalars(select(Conversation).where(Conversation.id.in_(ids or [0]))).all()
    out = [_conv_out(db, c, user) for c in convs]
    out.sort(key=lambda d: (d["kind"] != "proposal", d["updated_at"]), reverse=False)
    pinned = sorted([d for d in out if d["kind"] == "proposal"], key=lambda d: d["updated_at"], reverse=True)
    direct = sorted([d for d in out if d["kind"] != "proposal"], key=lambda d: d["updated_at"], reverse=True)
    return pinned + direct


@router.get("/unread-count")
def unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ids = db.scalars(select(ConversationMember.conversation_id).where(ConversationMember.user_id == user.id)).all()
    n = db.scalar(select(func.count()).select_from(Message).where(
        Message.conversation_id.in_(ids or [0]), Message.sender_id != user.id, Message.read_at.is_(None))) or 0
    return {"count": n}


@router.post("", status_code=201)
def start_direct(data: DirectConvIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    other = db.get(User, data.user_id)
    if not other:
        raise HTTPException(404, "User not found.")
    if other.id == user.id:
        raise HTTPException(400, "You cannot message yourself.")
    mine = select(ConversationMember.conversation_id).where(ConversationMember.user_id == user.id)
    theirs = select(ConversationMember.conversation_id).where(ConversationMember.user_id == other.id)
    existing = db.scalar(select(Conversation).where(Conversation.kind == "direct", Conversation.id.in_(mine),
                                                    Conversation.id.in_(theirs)))
    if existing:
        return _conv_out(db, existing, user)
    c = Conversation(kind="direct")
    c.members = [ConversationMember(user_id=user.id), ConversationMember(user_id=other.id)]
    db.add(c)
    db.commit()
    return _conv_out(db, c, user)


@router.get("/{cid}/messages")
def get_messages(cid: int, after: int = Query(0, ge=0), user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    c = _member_conv(db, cid, user)
    rows = db.scalars(select(Message).where(Message.conversation_id == cid, Message.id > after)
                      .order_by(Message.id.asc()).limit(200)).all()
    return {"conversation": _conv_out(db, c, user), "messages": [_msg(m) for m in rows]}


@router.post("/{cid}/messages", status_code=201)
def send_message(cid: int, data: MessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _member_conv(db, cid, user)
    body = clean_text(data.body, 3000)
    if not body and not data.attachment_url:
        raise HTTPException(422, "Write a message or attach an image.")
    mod = moderate_text(body)
    if not mod["allowed"]:
        raise HTTPException(422, mod["reason"] or "This message cannot be sent.")
    m = Message(conversation_id=cid, sender_id=user.id, body=body, attachment_url=data.attachment_url)
    db.add(m)
    for mem in c.members:
        if mem.user_id == user.id:
            continue
        pending = db.scalar(select(Notification.id).where(
            Notification.user_id == mem.user_id, Notification.type == "message",
            Notification.conversation_id == cid, Notification.read_at.is_(None)))
        if not pending:
            notify(db, mem.user_id, "message", user, conversation_id=cid)
    db.commit()
    return _msg(m)


@router.post("/{cid}/read")
def mark_read(cid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _member_conv(db, cid, user)
    t = datetime.now(timezone.utc)
    db.execute(update(Message).where(Message.conversation_id == cid, Message.sender_id != user.id,
                                      Message.read_at.is_(None)).values(read_at=t))
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.type == "message",
                                           Notification.conversation_id == cid, Notification.read_at.is_(None)).values(read_at=t))
    db.commit()
    return {"ok": True}
