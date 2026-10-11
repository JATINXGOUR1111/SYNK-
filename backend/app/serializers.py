from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .models import (User, Post, PostLike, Save, Follow, CreatorProfile, Comment, CommentLike)


def user_brief(u: User) -> dict:
    p = u.profile
    return {"id": u.id, "name": u.name, "handle": u.handle, "role": u.role, "company": u.company,
            "avatar_url": u.avatar_url, "verified": bool(p.verified) if p else False,
            "headline": p.headline if p else None}


def user_me(u: User) -> dict:
    d = user_brief(u)
    d.update({"email": u.email, "banner_url": u.banner_url})
    return d


def profile_out(p: CreatorProfile) -> dict:
    return {"headline": p.headline, "bio": p.bio, "ideal_client": p.ideal_client, "location": p.location,
            "links": p.links or [], "specialties": p.specialties or [], "tools": p.tools or [],
            "categories": p.categories or [], "mediums": p.mediums or [], "price_min": p.price_min,
            "price_max": p.price_max, "turnaround_days": p.turnaround_days, "rating": round(p.rating or 0, 2),
            "rating_count": p.rating_count, "verified": p.verified}


def user_full(db: Session, u: User, viewer: User | None) -> dict:
    d = user_brief(u)
    d.update({"banner_url": u.banner_url, "created_at": u.created_at.isoformat()})
    d["stats"] = {
        "posts": db.scalar(select(func.count(Post.id)).where(Post.author_id == u.id, Post.kind == "work")) or 0,
        "followers": db.scalar(select(func.count()).select_from(Follow).where(Follow.followee_id == u.id)) or 0,
        "following": db.scalar(select(func.count()).select_from(Follow).where(Follow.follower_id == u.id)) or 0,
        "rating": round(u.profile.rating, 2) if u.profile else 0,
        "rating_count": u.profile.rating_count if u.profile else 0,
        "avg_turnaround": u.profile.turnaround_days if u.profile else None,
    }
    d["profile"] = profile_out(u.profile) if u.profile else None
    d["is_following"] = bool(viewer and db.get(Follow, (viewer.id, u.id)))
    d["is_me"] = bool(viewer and viewer.id == u.id)
    return d


def posts_out(db: Session, posts: list[Post], viewer: User | None, extra: dict | None = None) -> list[dict]:
    if not posts:
        return []
    ids = [p.id for p in posts]
    liked: set[int] = set()
    saved: set[int] = set()
    following: set[int] = set()
    if viewer:
        liked = set(db.scalars(select(PostLike.post_id).where(PostLike.user_id == viewer.id, PostLike.post_id.in_(ids))))
        saved = set(db.scalars(select(Save.post_id).where(Save.user_id == viewer.id, Save.post_id.in_(ids))))
        following = set(db.scalars(select(Follow.followee_id).where(Follow.follower_id == viewer.id)))
    out = []
    for p in posts:
        d = {"id": p.id, "kind": p.kind, "caption": p.caption, "media": p.media or [],
             "declared_tools": p.declared_tools or [], "hashtags": p.hashtags or [], "tags": p.tags or {},
             "like_count": p.like_count, "comment_count": p.comment_count, "save_count": p.save_count,
             "created_at": p.created_at.isoformat(), "brief_id": p.brief_id,
             "author": user_brief(p.author), "liked": p.id in liked, "saved": p.id in saved,
             "author_followed": p.author_id in following,
             "trust_risk": (p.trust or {}).get("risk_level")}
        if p.kind == "brief" and p.brief_id:
            from .models import Brief
            b = db.get(Brief, p.brief_id)
            if b:
                s = b.structured or {}
                d["brief"] = {"id": b.id, "title": b.title, "status": b.status, "goal": s.get("goal"),
                              "format": s.get("format"), "budget_range_inr": s.get("budget_range_inr"),
                              "deadline_days": s.get("deadline_days")}
        if extra and p.id in extra:
            d.update(extra[p.id])
        out.append(d)
    return out


def comments_out(db: Session, comments: list[Comment], viewer: User | None) -> list[dict]:
    ids = [c.id for c in comments]
    liked = set()
    if viewer and ids:
        liked = set(db.scalars(select(CommentLike.comment_id).where(
            CommentLike.user_id == viewer.id, CommentLike.comment_id.in_(ids))))
    return [{"id": c.id, "post_id": c.post_id, "parent_id": c.parent_id, "body": c.body,
             "like_count": c.like_count, "liked": c.id in liked, "created_at": c.created_at.isoformat(),
             "author": user_brief(c.author)} for c in comments]
