import math
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import Brief, CreatorProfile, Post, User, Notification
from ..ai.embeddings import cosine
from ..ai import fallbacks as fb, service as ai
from .texts import creator_categories
from ..serializers import user_brief

W_SEM, W_TOOL, W_BUDGET, W_QUALITY = 0.50, 0.20, 0.15, 0.15


def brief_categories(b: Brief) -> list[str]:
    s = b.structured or {}
    cats = [c.lower() for c in (s.get("categories") or [])]
    if not cats:
        cats = fb.find_categories(" ".join([b.raw_idea or "", s.get("search_summary") or "", s.get("title") or ""]))
    return cats


def required_medium(s: dict) -> str | None:
    f = s.get("format")
    return f if f in ("video", "image", "audio") else None


def mandatory_tools(s: dict) -> list[str]:
    return fb.find_tools(" ".join(s.get("must_have") or []))


def passes_filters(s: dict, p: CreatorProfile) -> bool:
    hi = (s.get("budget_range_inr") or {}).get("max")
    if hi and p.price_min and p.price_min > hi * 1.25:
        return False
    dl = s.get("deadline_days")
    if dl and p.turnaround_days and p.turnaround_days > dl:
        return False
    med = required_medium(s)
    if med and med not in [m.lower() for m in (p.mediums or [])]:
        return False
    have = {t.lower() for t in (p.tools or [])}
    for t in mandatory_tools(s):
        if t.lower() not in have:
            return False
    return True


def budget_fit(s: dict, p: CreatorProfile) -> float:
    hi = (s.get("budget_range_inr") or {}).get("max")
    if not hi:
        return 0.5
    if p.price_min <= hi:
        return 1.0
    return max(0.0, 1 - (p.price_min - hi) / (0.25 * hi))


def tool_match(s: dict, p: CreatorProfile) -> float:
    pref = [t.lower() for t in (s.get("preferred_tools") or [])]
    if not pref:
        return 0.5
    have = {t.lower() for t in (p.tools or [])}
    return sum(1 for t in pref if t in have) / len(pref)


def quality(s: dict, p: CreatorProfile) -> tuple[float, float, float]:
    shrunk = ((p.rating or 0) * (p.rating_count or 0) + 3.5 * 2) / ((p.rating_count or 0) + 2) / 5
    dl = s.get("deadline_days")
    ta = 0.5 if not dl else max(0.0, min(1.0, 1 - 0.5 * (p.turnaround_days / dl)))
    q = 0.6 * shrunk + 0.4 * ta + (0.05 if p.verified else 0)
    return min(1.0, q), shrunk, ta


def industry_overlap(bcats: list[str], ccats: set[str]) -> float | None:
    if not bcats:
        return None
    return len(set(bcats) & ccats) / len(set(bcats))


def raw_semantic(vec: float, ind: float | None) -> float:
    v = max(0.0, vec)
    return v if ind is None else 0.65 * v + 0.35 * ind


def match_creators(db: Session, brief: Brief, limit: int = 5, top_n: int = 20) -> list[dict]:
    s = brief.structured or {}
    bcats = brief_categories(brief)
    profiles = db.scalars(select(CreatorProfile)).all()
    cands = []
    for p in profiles:
        if not passes_filters(s, p):
            continue
        vec = cosine(brief.embedding, p.embedding)
        ind = industry_overlap(bcats, creator_categories(db, p))
        cands.append((p, vec, ind, raw_semantic(vec, ind)))
    if not cands:
        return []
    best = max(c[3] for c in cands) or 1.0
    scored = []
    for p, vec, ind, raw in cands:
        sem = raw / best  # normalised relative to the best candidate
        tm, bf = tool_match(s, p), budget_fit(s, p)
        q, rating_part, ta_part = quality(s, p)
        total = W_SEM * sem + W_TOOL * tm + W_BUDGET * bf + W_QUALITY * q
        scored.append({"profile": p, "total": total, "breakdown": {
            "semantic": round(sem, 3), "tools": round(tm, 3), "budget": round(bf, 3), "quality": round(q, 3),
            "total": round(total, 3), "vector_similarity": round(max(0.0, vec), 3),
            "industry_overlap": None if ind is None else round(ind, 3)}})
    scored.sort(key=lambda x: (-x["total"], x["profile"].user_id))
    return scored[:top_n][:limit]


def fit_percent(db: Session, brief: Brief, p: CreatorProfile) -> int:
    """Absolute (non-relative) fit used on feed brief cards; cheap and LLM-free."""
    s = brief.structured or {}
    if not passes_filters(s, p):
        return int(round(100 * 0.25 * budget_fit(s, p)))
    ind = industry_overlap(brief_categories(brief), creator_categories(db, p))
    sem = min(1.0, raw_semantic(cosine(brief.embedding, p.embedding), ind) / 0.5)
    q, _, _ = quality(s, p)
    return int(round(100 * (W_SEM * sem + W_TOOL * tool_match(s, p) + W_BUDGET * budget_fit(s, p) + W_QUALITY * q)))


def creator_summary(db: Session, p: CreatorProfile) -> dict:
    u = db.get(User, p.user_id)
    return {"name": u.name, "headline": p.headline, "bio": p.bio, "tools": p.tools, "categories": p.categories,
            "price_min": p.price_min, "price_max": p.price_max, "turnaround_days": p.turnaround_days,
            "rating": round(p.rating or 0, 2), "rating_count": p.rating_count, "verified": p.verified}


def top_pieces(db: Session, brief: Brief, p: CreatorProfile, n: int = 3) -> list[dict]:
    posts = db.scalars(select(Post).where(Post.author_id == p.user_id, Post.kind == "work")).all()
    posts.sort(key=lambda x: -cosine(brief.embedding, x.embedding))
    out = []
    for x in posts[:n]:
        t = x.tags or {}
        out.append({"post_id": x.id, "caption": x.caption[:140], "tools": x.declared_tools,
                    "tags": (t.get("style_tags") or []) + (t.get("industry_fit") or []),
                    "media": (x.media or [None])[0]})
    return out


def run_match(db: Session, brief: Brief, viewer_id: int | None = None, notify_creators: bool = True) -> list[dict]:
    from .notify import notify
    from ..models import Shortlist
    results = match_creators(db, brief)
    s = brief.structured or {}
    s_for_ai = {**s, "categories": brief_categories(brief)}
    items = []
    for r in results:
        p = r["profile"]
        items.append((s_for_ai, {**creator_summary(db, p)}, top_pieces(db, brief, p), r["breakdown"]))
    expl = ai.explain_many(items)
    shortlisted = set(db.scalars(select(Shortlist.creator_id).where(Shortlist.brief_id == brief.id)).all())
    out = []
    for r, e, it in zip(results, expl, items):
        p = r["profile"]
        u = db.get(User, p.user_id)
        out.append({"creator": user_brief(u), "rank_score": r["breakdown"]["total"], "score": r["breakdown"],
                    "why_match": e["why_match"], "strengths": e["strengths"], "watch_out": e["watch_out"],
                    "pieces": it[2], "price_min": p.price_min, "price_max": p.price_max,
                    "turnaround_days": p.turnaround_days, "tools": p.tools, "rating": round(p.rating or 0, 2),
                    "rating_count": p.rating_count, "shortlisted": u.id in shortlisted})
        if notify_creators:
            exists = db.scalar(select(Notification.id).where(
                Notification.user_id == u.id, Notification.type == "brief_match", Notification.brief_id == brief.id))
            if not exists:
                notify(db, u.id, "brief_match", None, brief_id=brief.id)
    db.commit()
    return out
