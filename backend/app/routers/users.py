from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import User, Follow, SavedCreator, CreatorProfile, Post
from ..security import get_current_user, get_optional_user
from ..serializers import user_full, user_brief, posts_out
from ..services.notify import notify
from ..services.feed import viewer_interest
from ..ai.embeddings import cosine

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/suggested")
def suggested(user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    q = select(User)
    followed: set[int] = set()
    if user:
        followed = set(db.scalars(select(Follow.followee_id).where(Follow.follower_id == user.id)).all())
        q = q.where(User.id != user.id, User.id.notin_(followed or {0}))
    cands = db.scalars(q).all()
    interest = viewer_interest(db, user) if user else None

    def score(u: User) -> float:
        p = u.profile
        s = ((p.rating or 0) / 5 * 0.3 + (0.2 if p and p.verified else 0)) if p else 0.1
        if interest and p and p.embedding:
            s += max(0.0, cosine(interest, p.embedding))
        return s
    cands.sort(key=lambda u: (-score(u), u.id))
    return [user_brief(u) for u in cands[:6]]


@router.get("/{handle}")
def get_user(handle: str, viewer: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.handle == handle.lower().lstrip("@")))
    if not u:
        raise HTTPException(404, "User not found.")
    return user_full(db, u, viewer)


@router.get("/{handle}/posts")
def user_posts(handle: str, medium: str | None = None, offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=60),
               viewer: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.handle == handle.lower().lstrip("@")))
    if not u:
        raise HTTPException(404, "User not found.")
    rows = db.scalars(select(Post).where(Post.author_id == u.id).order_by(Post.created_at.desc())).all()
    if medium:
        rows = [p for p in rows if p.media and p.media[0].get("type") == medium]
    page = rows[offset: offset + limit]
    return {"items": posts_out(db, page, viewer), "total": len(rows),
            "next_offset": offset + limit if offset + limit < len(rows) else None}


@router.post("/{user_id}/follow")
def follow(user_id: int, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found.")
    if target.id == me.id:
        raise HTTPException(400, "You cannot follow yourself.")
    if not db.get(Follow, (me.id, target.id)):
        db.add(Follow(follower_id=me.id, followee_id=target.id))
        notify(db, target.id, "follow", me)
        db.commit()
    return {"following": True, "followers": db.scalar(select(func.count()).select_from(Follow).where(Follow.followee_id == target.id))}


@router.delete("/{user_id}/follow")
def unfollow(user_id: int, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(delete(Follow).where(Follow.follower_id == me.id, Follow.followee_id == user_id))
    db.commit()
    return {"following": False, "followers": db.scalar(select(func.count()).select_from(Follow).where(Follow.followee_id == user_id))}


@router.get("/{user_id}/followers")
def followers(user_id: int, db: Session = Depends(get_db)):
    ids = db.scalars(select(Follow.follower_id).where(Follow.followee_id == user_id).order_by(Follow.created_at.desc())).all()
    return [user_brief(u) for u in db.scalars(select(User).where(User.id.in_(ids or [0]))).all()]


@router.get("/{user_id}/following")
def following(user_id: int, db: Session = Depends(get_db)):
    ids = db.scalars(select(Follow.followee_id).where(Follow.follower_id == user_id).order_by(Follow.created_at.desc())).all()
    return [user_brief(u) for u in db.scalars(select(User).where(User.id.in_(ids or [0]))).all()]


@router.post("/{user_id}/save")
def save_creator(user_id: int, collection: str = "All", me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(User, user_id):
        raise HTTPException(404, "User not found.")
    row = db.get(SavedCreator, (me.id, user_id))
    if not row:
        db.add(SavedCreator(user_id=me.id, creator_id=user_id, collection=collection[:80]))
    else:
        row.collection = collection[:80]
    db.commit()
    return {"saved": True}


@router.delete("/{user_id}/save")
def unsave_creator(user_id: int, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(delete(SavedCreator).where(SavedCreator.user_id == me.id, SavedCreator.creator_id == user_id))
    db.commit()
    return {"saved": False}
