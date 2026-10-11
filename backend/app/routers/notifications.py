from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, update
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import User, Notification
from ..security import get_current_user
from ..serializers import user_brief

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id)
                      .order_by(Notification.created_at.desc(), Notification.id.desc()).limit(100)).all()
    now = datetime.now(timezone.utc)
    out = []
    for n in rows:
        age = now - n.created_at
        group = "today" if age < timedelta(days=1) else "this_week" if age < timedelta(days=7) else "earlier"
        out.append({"id": n.id, "type": n.type, "text": n.text, "read": n.read_at is not None, "group": group,
                    "created_at": n.created_at.isoformat(), "actor": user_brief(n.actor) if n.actor else None,
                    "post_id": n.post_id, "proposal_id": n.proposal_id, "brief_id": n.brief_id,
                    "conversation_id": n.conversation_id})
    return out


@router.get("/unread-count")
def unread(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None), Notification.type != "message")) or 0
    return {"count": n}


@router.post("/read-all")
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
               .values(read_at=datetime.now(timezone.utc)))
    db.commit()
    return {"ok": True}


@router.post("/{nid}/read")
def read_one(nid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, nid)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found.")
    n.read_at = n.read_at or datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
