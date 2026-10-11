"""P13 feed ranking, computed in code (no LLM)."""
import base64
import json
import math
import random
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import Post, User, PostLike, Save, Comment, Follow, CreatorProfile, Brief
from ..ai.embeddings import cosine, weighted_average

POOL = 400


def enc(d: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(d, separators=(",", ":")).encode()).decode()


def dec(c: str | None) -> dict:
    if not c:
        return {}
    try:
        return json.loads(base64.urlsafe_b64decode(c.encode()))
    except Exception:  # noqa: BLE001
        return {}


def viewer_interest(db: Session, viewer: User) -> list[float] | None:
    vecs: list[tuple[list[float], float]] = []
    liked = db.scalars(select(Post.embedding).join(PostLike, PostLike.post_id == Post.id)
                       .where(PostLike.user_id == viewer.id).limit(50)).all()
    saved = db.scalars(select(Post.embedding).join(Save, Save.post_id == Post.id)
                       .where(Save.user_id == viewer.id).limit(50)).all()
    commented = db.scalars(select(Post.embedding).join(Comment, Comment.post_id == Post.id)
                           .where(Comment.author_id == viewer.id).limit(50)).all()
    vecs += [(v, 1.0) for v in liked] + [(v, 1.5) for v in saved] + [(v, 1.2) for v in commented]
    if viewer.role == "brand":
        for e in db.scalars(select(Brief.embedding).where(Brief.brand_id == viewer.id).limit(20)).all():
            vecs.append((e, 2.0))
    else:
        p = db.get(CreatorProfile, viewer.id)
        if p and p.embedding:
            vecs.append((p.embedding, 2.0))
    return weighted_average(vecs)


def affinity_sets(db: Session, viewer: User) -> tuple[set[int], set[int]]:
    follows = set(db.scalars(select(Follow.followee_id).where(Follow.follower_id == viewer.id)).all())
    inter = set(db.scalars(select(Post.author_id).join(PostLike, PostLike.post_id == Post.id)
                           .where(PostLike.user_id == viewer.id)).all())
    inter |= set(db.scalars(select(Post.author_id).join(Save, Save.post_id == Post.id)
                            .where(Save.user_id == viewer.id)).all())
    inter |= set(db.scalars(select(Post.author_id).join(Comment, Comment.post_id == Post.id)
                            .where(Comment.author_id == viewer.id)).all())
    return follows, inter


def score_post(p: Post, interest, sim_max: float, follows: set[int], inter: set[int], ratings: dict[int, float],
               now: datetime) -> float:
    sim = max(0.0, cosine(interest, p.embedding)) / sim_max if interest and sim_max > 0 else 0.0
    age_h = max(0.0, (now - p.created_at).total_seconds() / 3600)
    recency = 0.5 ** (age_h / 24)
    engagement = min(1.0, math.log1p(p.like_count + 2 * p.comment_count + 3 * p.save_count) / math.log1p(200))
    aff = 1.0 if p.author_id in follows else (0.5 if p.author_id in inter else 0.0)
    rating = (ratings.get(p.author_id) or 0.0) / 5
    return 0.40 * sim + 0.25 * recency + 0.20 * engagement + 0.10 * aff + 0.05 * rating


def ranked_page(db: Session, viewer: User | None, cursor: str | None, limit: int, kind: str | None = None,
                only_open_briefs: bool = False) -> tuple[list[Post], str | None]:
    """Ranked, session-stable page. The cursor carries the seed, as_of time and already-seen ids so no post
    is ever shown twice in a session even while scores change underneath."""
    c = dec(cursor)
    now = datetime.now(timezone.utc)
    as_of = datetime.fromisoformat(c["as_of"]) if c.get("as_of") else now
    seed = c.get("seed") or random.randint(1, 10**9)
    seen: list[int] = c.get("seen", [])
    q = select(Post).where(Post.created_at <= as_of)
    if kind:
        q = q.where(Post.kind == kind)
    if viewer:
        q = q.where(Post.author_id != viewer.id) if kind != "brief" else q
    q = q.order_by(Post.created_at.desc()).limit(POOL + len(seen))
    pool = [p for p in db.scalars(q).all() if p.id not in set(seen)]
    if only_open_briefs:
        open_ids = set(db.scalars(select(Brief.id).where(Brief.status == "open")).all())
        pool = [p for p in pool if p.brief_id in open_ids]
    if not pool:
        return [], None
    interest, follows, inter = (None, set(), set())
    if viewer:
        interest = viewer_interest(db, viewer)
        follows, inter = affinity_sets(db, viewer)
    ratings = {r.user_id: r.rating for r in db.scalars(select(CreatorProfile)).all()}
    sims = [max(0.0, cosine(interest, p.embedding)) for p in pool] if interest else [0]
    sim_max = max(sims) or 0
    scored = sorted(pool, key=lambda p: -score_post(p, interest, sim_max, follows, inter, ratings, as_of))
    n_explore = max(1, round(limit * 0.10)) if limit >= 10 and len(scored) > limit else 0
    main = scored[: limit - n_explore]
    rest = [p for p in scored[limit - n_explore:]]
    rng = random.Random(seed + len(seen))
    recent_rest = sorted(rest, key=lambda p: p.created_at, reverse=True)[:50]
    explore = rng.sample(recent_rest, min(n_explore, len(recent_rest)))
    page = list(main)
    for e in explore:
        page.insert(rng.randint(1, max(1, len(page))), e)
    new_seen = (seen + [p.id for p in page])[-1500:]
    more = len(pool) > len(page)
    return page, (enc({"seed": seed, "as_of": as_of.isoformat(), "seen": new_seen}) if more else None)


def chronological_page(db: Session, viewer: User, cursor: str | None, limit: int) -> tuple[list[Post], str | None]:
    c = dec(cursor)
    ids = list(db.scalars(select(Follow.followee_id).where(Follow.follower_id == viewer.id)).all())
    q = select(Post).where(Post.author_id.in_(ids), Post.kind == "work") if ids else None
    if q is None:
        return [], None
    if c.get("t"):
        t, i = datetime.fromisoformat(c["t"]), c["i"]
        q = q.where((Post.created_at < t) | ((Post.created_at == t) & (Post.id < i)))
    rows = db.scalars(q.order_by(Post.created_at.desc(), Post.id.desc()).limit(limit + 1)).all()
    more = len(rows) > limit
    rows = rows[:limit]
    return rows, (enc({"t": rows[-1].created_at.isoformat(), "i": rows[-1].id}) if more and rows else None)
