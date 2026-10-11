import json
from datetime import datetime, timedelta, timezone
from collections import Counter
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select, update, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import (User, Post, PostLike, Save, Comment, CommentLike, Follow, CreatorProfile, Brief)
from ..schemas import CommentIn, CaptionIn
from ..security import get_current_user, get_optional_user, require_creator
from ..serializers import posts_out, comments_out, user_brief
from ..ratelimit import ai_limit
from ..ai import service as ai
from ..ai.embeddings import embed, cosine
from ..services import storage, feed as feedsvc, matching
from ..services.moderation import moderate_text
from ..services.notify import notify
from ..services.texts import (post_text, clean_text, extract_hashtags, extract_mentions,
                              refresh_profile_embedding, creator_categories)

router = APIRouter(tags=["posts"])


def _split(v: str | None) -> list[str]:
    if not v:
        return []
    v = v.strip()
    if v.startswith("["):
        try:
            return [str(x).strip() for x in json.loads(v) if str(x).strip()]
        except json.JSONDecodeError:
            pass
    return [x.strip() for x in v.split(",") if x.strip()]


@router.post("/posts", status_code=201)
def create_post(caption: str = Form(""), tools: str = Form(""), hashtags: str = Form(""),
                media_urls: str = Form(""), auto_caption: bool = Form(False),
                files: list[UploadFile] = File(default=[]),
                user: User = Depends(require_creator), db: Session = Depends(get_db)):
    caption = clean_text(caption, 2200)
    declared = [clean_text(t, 40) for t in _split(tools)][:10]
    media: list[dict] = []
    first_image: tuple[bytes, str] | None = None
    if len(files) + len(_split(media_urls)) > 10:
        raise HTTPException(422, "A post can have at most 10 media files.")
    for f in files:
        data, kind, ext, ctype = storage.read_upload(f)
        url = storage.save_bytes(data, ext, ctype)
        media.append({"url": url, "type": kind})
        if kind == "image" and first_image is None and len(data) < 4_500_000:
            first_image = (data, ctype)
    for u in _split(media_urls):
        u = storage.validate_media_url(u)
        media.append({"url": u, "type": storage.media_type_from_url(u)})
    if not media and not caption:
        raise HTTPException(422, "Add a photo, video, audio file or a caption.")
    # P12 moderation: blocked content is never published
    mod = moderate_text(caption, first_image)
    if not mod["allowed"]:
        raise HTTPException(422, mod["reason"] or "This post cannot be published.")
    medium = media[0]["type"] if media else None
    user_tags = extract_hashtags(caption) + [("#" + h.lstrip("#").lower()) for h in _split(hashtags)]
    tags = ai.tag_media(caption, declared, user_tags, medium, first_image)  # P1
    trust = ai.trust_check(declared, caption)  # P8
    if (not caption or not user_tags) and auto_caption:
        gen = ai.caption(caption[:60], caption, declared, tags.get("style_tags", []))  # P11
        caption = caption or gen["caption"]
        user_tags = user_tags or gen["hashtags"]
    tags_final = list(dict.fromkeys(user_tags))[:12]
    p = Post(author_id=user.id, kind="work", caption=caption, media=media, declared_tools=declared,
             hashtags=tags_final, tags=tags, trust=trust,
             embedding=embed(post_text(caption, tags, declared, tags_final)))
    db.add(p)
    db.flush()
    for fid in db.scalars(select(Follow.follower_id).where(Follow.followee_id == user.id)).all():
        notify(db, fid, "new_post", user, post_id=p.id)
    for h in extract_mentions(caption):
        t = db.scalar(select(User).where(User.handle == h))
        if t:
            notify(db, t.id, "mention", user, post_id=p.id)
    prof = db.get(CreatorProfile, user.id)
    if prof:
        refresh_profile_embedding(db, prof)
    db.commit()
    out = posts_out(db, [p], user)[0]
    out["trust"] = trust
    return out


@router.get("/posts/{post_id}")
def get_post(post_id: int, viewer: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    p = db.get(Post, post_id)
    if not p:
        raise HTTPException(404, "Post not found.")
    out = posts_out(db, [p], viewer)[0]
    if viewer and viewer.id == p.author_id:
        out["trust"] = p.trust
    return out


@router.delete("/posts/{post_id}")
def delete_post(post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.get(Post, post_id)
    if not p:
        raise HTTPException(404, "Post not found.")
    if p.author_id != user.id:
        raise HTTPException(403, "You can only delete your own posts.")
    db.delete(p)
    prof = db.get(CreatorProfile, user.id)
    db.flush()
    if prof and p.kind == "work":
        refresh_profile_embedding(db, prof)
    db.commit()
    return {"deleted": True}


# ---------------- feed / explore / tags / stories
@router.get("/feed")
def feed(tab: str = Query("for_you", pattern="^(for_you|following|briefs)$"), cursor: str | None = None,
         limit: int = Query(10, ge=1, le=30), viewer: User | None = Depends(get_optional_user),
         db: Session = Depends(get_db)):
    if tab != "for_you" and not viewer:
        raise HTTPException(401, "Please log in to see this tab.")
    extra: dict[int, dict] = {}
    if tab == "following":
        rows, nxt = feedsvc.chronological_page(db, viewer, cursor, limit)
    elif tab == "briefs":
        if viewer.role == "creator":
            rows, nxt = feedsvc.ranked_page(db, viewer, cursor, limit, kind="brief", only_open_briefs=True)
            prof = db.get(CreatorProfile, viewer.id)
            for r in rows:
                b = db.get(Brief, r.brief_id) if r.brief_id else None
                if b and prof:
                    extra[r.id] = {"fit": matching.fit_percent(db, b, prof)}
            rows.sort(key=lambda r: -(extra.get(r.id, {}).get("fit", 0)))
        else:
            rows, nxt = feedsvc.ranked_page(db, viewer, cursor, limit, kind="work")
    else:
        rows, nxt = feedsvc.ranked_page(db, viewer, cursor, limit)
        if viewer and viewer.role == "creator":
            prof = db.get(CreatorProfile, viewer.id)
            for r in rows:
                if r.kind == "brief" and r.brief_id and prof:
                    b = db.get(Brief, r.brief_id)
                    if b:
                        extra[r.id] = {"fit": matching.fit_percent(db, b, prof)}
    return {"items": posts_out(db, rows, viewer, extra), "next_cursor": nxt}


def _post_matches(db: Session, p: Post, medium, tool, category, max_budget, max_turn) -> bool:
    t = p.tags or {}
    if medium and not (t.get("medium") == medium or (p.media and p.media[0].get("type") == medium)):
        return False
    if tool and tool.lower() not in [x.lower() for x in p.declared_tools or []]:
        return False
    prof = p.author.profile
    if category and category.lower() not in ([c.lower() for c in t.get("industry_fit", [])] +
                                              ([c.lower() for c in prof.categories] if prof else [])):
        return False
    if max_budget is not None and prof and prof.price_min and prof.price_min > max_budget:
        return False
    if max_turn is not None and prof and prof.turnaround_days and prof.turnaround_days > max_turn:
        return False
    return True


@router.get("/explore")
def explore(q: str | None = None, medium: str | None = None, tool: str | None = None, category: str | None = None,
            max_budget: int | None = None, max_turnaround: int | None = None, cursor: str | None = None,
            limit: int = Query(24, ge=1, le=60), viewer: User | None = Depends(get_optional_user),
            db: Session = Depends(get_db)):
    offset = int(feedsvc.dec(cursor).get("o", 0))
    parsed = ai.parse_search(q.strip()[:300]) if q and q.strip() else None
    f = parsed["filters"] if parsed else {}
    medium = medium or f.get("medium")
    category = category or f.get("category")
    max_budget = max_budget if max_budget is not None else f.get("max_budget_inr")
    max_turnaround = max_turnaround if max_turnaround is not None else f.get("max_turnaround_days")
    tool = tool or ((f.get("tools") or [None])[0])
    pool = db.scalars(select(Post).where(Post.kind == "work").order_by(Post.created_at.desc()).limit(600)).all()
    pool = [p for p in pool if _post_matches(db, p, medium, tool, category, max_budget, max_turnaround)]
    now = datetime.now(timezone.utc)
    qvec = embed(parsed["semantic_query"]) if parsed else None

    def rank(p: Post) -> float:
        eng = (p.like_count + 2 * p.comment_count + 3 * p.save_count)
        rec = 0.5 ** (max(0.0, (now - p.created_at).total_seconds() / 3600) / (24 * 7))
        base = 0.02 * eng ** 0.5 + 0.2 * rec
        return (max(0.0, cosine(qvec, p.embedding)) * 2 + base) if qvec else base
    pool.sort(key=lambda p: -rank(p))
    page = pool[offset: offset + limit]
    nxt = feedsvc.enc({"o": offset + limit}) if offset + limit < len(pool) else None
    creators = []
    if offset == 0:
        creators = _creators_for(db, qvec, category, tool, medium, max_budget, max_turnaround)
    return {"posts": posts_out(db, page, viewer), "creators": creators, "next_cursor": nxt,
            "parsed": parsed, "total": len(pool)}


def _creators_for(db, qvec, category, tool, medium, max_budget, max_turn, n=8):
    rows = []
    for p in db.scalars(select(CreatorProfile)).all():
        if category and category.lower() not in creator_categories(db, p):
            continue
        if tool and tool.lower() not in [t.lower() for t in p.tools or []]:
            continue
        if medium and medium not in [m.lower() for m in p.mediums or []]:
            continue
        if max_budget is not None and p.price_min and p.price_min > max_budget:
            continue
        if max_turn is not None and p.turnaround_days and p.turnaround_days > max_turn:
            continue
        rows.append((p, max(0.0, cosine(qvec, p.embedding)) if qvec else 0.0))
    best = max((s for _, s in rows), default=0) or 1.0
    rows.sort(key=lambda x: (-x[1], -(x[0].rating or 0)))
    return [{"user": user_brief(db.get(User, p.user_id)), "match_pct": int(round(100 * s / best)) if qvec else None,
             "rating": round(p.rating or 0, 2), "tools": p.tools[:4]} for p, s in rows[:n]]


def _recent_work(db: Session, days: int = 14, cap: int = 800) -> list[Post]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    return db.scalars(select(Post).where(Post.kind == "work", Post.created_at >= since)
                      .order_by(Post.created_at.desc()).limit(cap)).all()


@router.get("/tags/trending")
def trending(db: Session = Depends(get_db)):
    posts = _recent_work(db, 30)
    tc, tl = Counter(), Counter()
    for p in posts:
        w = 1 + 0.2 * p.like_count
        for h in set(x.lower() for x in p.hashtags or []):
            tc[h] += w
        for t in set(p.declared_tools or []):
            tl[t] += w
    return {"tags": [{"tag": t.lstrip("#"), "count": int(c)} for t, c in tc.most_common(12)],
            "tools": [{"tool": t, "count": int(c)} for t, c in tl.most_common(8)]}


@router.get("/tags/{tag}")
def tag_page(tag: str, cursor: str | None = None, limit: int = Query(24, ge=1, le=60),
             viewer: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    h = "#" + tag.lower().lstrip("#")
    offset = int(feedsvc.dec(cursor).get("o", 0))
    posts = db.scalars(select(Post).where(Post.kind == "work").order_by(Post.created_at.desc()).limit(1500)).all()
    posts = [p for p in posts if h in [x.lower() for x in p.hashtags or []]
             or tag.lower() in [s.lower() for s in (p.tags or {}).get("style_tags", [])]]
    posts.sort(key=lambda p: (-(p.like_count + 2 * p.comment_count), -p.created_at.timestamp()))
    top = Counter(p.author_id for p in posts).most_common(6)
    creators = [{"user": user_brief(db.get(User, uid)), "posts": n} for uid, n in top]
    page = posts[offset: offset + limit]
    return {"tag": tag.lstrip("#"), "total": len(posts), "posts": posts_out(db, page, viewer),
            "creators": creators, "next_cursor": feedsvc.enc({"o": offset + limit}) if offset + limit < len(posts) else None}


@router.get("/stories")
def stories(viewer: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(hours=48)
    posts = db.scalars(select(Post).where(Post.kind == "work", Post.created_at >= since)
                       .order_by(Post.created_at.desc())).all()
    followed = set(db.scalars(select(Follow.followee_id).where(Follow.follower_id == viewer.id)).all()) if viewer else set()
    by_author: dict[int, list[Post]] = {}
    for p in posts:
        by_author.setdefault(p.author_id, []).append(p)
    ordered = sorted(by_author.items(), key=lambda kv: (kv[0] not in followed, -kv[1][0].created_at.timestamp()))[:20]
    items = [{"user": user_brief(db.get(User, uid)), "followed": uid in followed,
              "posts": posts_out(db, list(reversed(ps))[:6], viewer)} for uid, ps in ordered]
    open_briefs = []
    if viewer and viewer.role == "brand":
        bps = db.scalars(select(Post).join(Brief, Brief.id == Post.brief_id)
                         .where(Post.kind == "brief", Brief.status == "open", Brief.brand_id == viewer.id)
                         .order_by(Post.created_at.desc()).limit(10)).all()
        open_briefs = posts_out(db, bps, viewer)
    return {"stories": items, "open_briefs": open_briefs}


# ---------------- likes / saves
def _post_or_404(db: Session, post_id: int) -> Post:
    p = db.get(Post, post_id)
    if not p:
        raise HTTPException(404, "Post not found.")
    return p


@router.post("/posts/{post_id}/like")
def like(post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _post_or_404(db, post_id)
    if not db.get(PostLike, (user.id, post_id)):
        try:
            db.add(PostLike(user_id=user.id, post_id=post_id))
            db.flush()
            db.execute(update(Post).where(Post.id == post_id).values(like_count=Post.like_count + 1))
            notify(db, p.author_id, "like", user, post_id=post_id)
            db.commit()
        except IntegrityError:
            db.rollback()
    return {"liked": True, "like_count": db.scalar(select(Post.like_count).where(Post.id == post_id))}


@router.delete("/posts/{post_id}/like")
def unlike(post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _post_or_404(db, post_id)
    if db.get(PostLike, (user.id, post_id)):
        db.execute(delete(PostLike).where(PostLike.user_id == user.id, PostLike.post_id == post_id))
        db.execute(update(Post).where(Post.id == post_id, Post.like_count > 0).values(like_count=Post.like_count - 1))
        db.commit()
    return {"liked": False, "like_count": db.scalar(select(Post.like_count).where(Post.id == post_id))}


@router.post("/posts/{post_id}/save")
def save(post_id: int, collection: str = "All", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _post_or_404(db, post_id)
    row = db.get(Save, (user.id, post_id))
    if not row:
        try:
            db.add(Save(user_id=user.id, post_id=post_id, collection=clean_text(collection, 80) or "All"))
            db.flush()
            db.execute(update(Post).where(Post.id == post_id).values(save_count=Post.save_count + 1))
            db.commit()
        except IntegrityError:
            db.rollback()
    else:
        row.collection = clean_text(collection, 80) or row.collection
        db.commit()
    return {"saved": True, "save_count": db.scalar(select(Post.save_count).where(Post.id == post_id))}


@router.delete("/posts/{post_id}/save")
def unsave(post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _post_or_404(db, post_id)
    if db.get(Save, (user.id, post_id)):
        db.execute(delete(Save).where(Save.user_id == user.id, Save.post_id == post_id))
        db.execute(update(Post).where(Post.id == post_id, Post.save_count > 0).values(save_count=Post.save_count - 1))
        db.commit()
    return {"saved": False, "save_count": db.scalar(select(Post.save_count).where(Post.id == post_id))}


@router.get("/me/saved")
def my_saved(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ..models import SavedCreator
    rows = db.execute(select(Save, Post).join(Post, Post.id == Save.post_id).where(Save.user_id == user.id)
                      .order_by(Save.created_at.desc())).all()
    posts = posts_out(db, [r[1] for r in rows], user)
    for d, (s, _) in zip(posts, rows):
        d["collection"] = s.collection
    cr = db.execute(select(SavedCreator, User).join(User, User.id == SavedCreator.creator_id)
                    .where(SavedCreator.user_id == user.id)).all()
    creators = [{**user_brief(u), "collection": sc.collection} for sc, u in cr]
    cols = sorted({d["collection"] for d in posts} | {c["collection"] for c in creators})
    return {"posts": posts, "creators": creators, "collections": cols}


# ---------------- comments
@router.get("/posts/{post_id}/comments")
def list_comments(post_id: int, viewer: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    _post_or_404(db, post_id)
    rows = db.scalars(select(Comment).where(Comment.post_id == post_id).order_by(Comment.created_at.asc())).all()
    out = comments_out(db, rows, viewer)
    tops = [c for c in out if not c["parent_id"]]
    tops.sort(key=lambda c: (-c["like_count"], c["created_at"]))
    for t in tops:
        t["replies"] = [c for c in out if c["parent_id"] == t["id"]]
    return tops


@router.post("/posts/{post_id}/comments", status_code=201)
def add_comment(post_id: int, data: CommentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = _post_or_404(db, post_id)
    body = clean_text(data.body, 1000)
    if not body:
        raise HTTPException(422, "Comment cannot be empty.")
    mod = moderate_text(body)
    if not mod["allowed"]:
        raise HTTPException(422, mod["reason"] or "This comment cannot be posted.")
    parent_id = None
    parent = None
    if data.parent_id:
        parent = db.get(Comment, data.parent_id)
        if not parent or parent.post_id != post_id:
            raise HTTPException(404, "Comment to reply to was not found.")
        parent_id = parent.parent_id or parent.id  # replies are one level deep
    c = Comment(post_id=post_id, author_id=user.id, parent_id=parent_id, body=body)
    db.add(c)
    db.flush()
    db.execute(update(Post).where(Post.id == post_id).values(comment_count=Post.comment_count + 1))
    if parent:
        notify(db, parent.author_id, "reply", user, post_id=post_id)
    notify(db, post.author_id, "comment", user, post_id=post_id)
    for h in extract_mentions(body):
        t = db.scalar(select(User).where(User.handle == h))
        if t:
            notify(db, t.id, "mention", user, post_id=post_id)
    db.commit()
    db.refresh(c)
    return comments_out(db, [c], user)[0]


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.get(Comment, comment_id)
    if not c:
        raise HTTPException(404, "Comment not found.")
    post = db.get(Post, c.post_id)
    if c.author_id != user.id and post.author_id != user.id:
        raise HTTPException(403, "You cannot delete this comment.")
    n = 1 + len(db.scalars(select(Comment.id).where(Comment.parent_id == c.id)).all())
    db.delete(c)
    db.flush()
    db.execute(update(Post).where(Post.id == post.id).values(comment_count=Post.comment_count - n))
    db.commit()
    return {"deleted": True}


@router.post("/comments/{comment_id}/like")
def like_comment(comment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.get(Comment, comment_id)
    if not c:
        raise HTTPException(404, "Comment not found.")
    if not db.get(CommentLike, (user.id, comment_id)):
        try:
            db.add(CommentLike(user_id=user.id, comment_id=comment_id))
            db.flush()
            db.execute(update(Comment).where(Comment.id == comment_id).values(like_count=Comment.like_count + 1))
            notify(db, c.author_id, "comment_like", user, post_id=c.post_id)
            db.commit()
        except IntegrityError:
            db.rollback()
    return {"liked": True, "like_count": db.scalar(select(Comment.like_count).where(Comment.id == comment_id))}


@router.delete("/comments/{comment_id}/like")
def unlike_comment(comment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.get(CommentLike, (user.id, comment_id)):
        db.execute(delete(CommentLike).where(CommentLike.user_id == user.id, CommentLike.comment_id == comment_id))
        db.execute(update(Comment).where(Comment.id == comment_id, Comment.like_count > 0).values(like_count=Comment.like_count - 1))
        db.commit()
    return {"liked": False, "like_count": db.scalar(select(Comment.like_count).where(Comment.id == comment_id)) or 0}


@router.post("/ai/caption", dependencies=[Depends(ai_limit)])
def ai_caption(data: CaptionIn, user: User = Depends(require_creator)):
    return ai.caption(clean_text(data.title, 200), clean_text(data.description, 1000), data.tools[:10], data.tags[:10])
