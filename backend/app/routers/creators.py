from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import User, CreatorProfile, Post
from ..schemas import ProfileIn
from ..security import get_optional_user, require_creator
from ..serializers import user_brief, profile_out, user_full
from ..ai import service as ai
from ..ai.embeddings import embed, cosine
from ..ratelimit import ai_limit
from ..services.texts import refresh_profile_embedding, creator_categories, clean_text

router = APIRouter(prefix="/creators", tags=["creators"])


@router.get("")
def list_creators(q: str | None = None, tools: str | None = None, category: str | None = None,
                  medium: str | None = None, max_budget: int | None = None, max_turnaround: int | None = None,
                  offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=50),
                  viewer: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    parsed = {"semantic_query": "", "filters": {}}
    if q and q.strip():
        parsed = ai.parse_search(q.strip()[:300])
    f = parsed["filters"]
    # explicit UI filters override parsed ones
    cat = (category or f.get("category") or "").lower() or None
    tool_list = [t.strip().lower() for t in tools.split(",")] if tools else [t.lower() for t in f.get("tools") or []]
    med = (medium or f.get("medium") or "").lower() or None
    max_b = max_budget if max_budget is not None else f.get("max_budget_inr")
    max_t = max_turnaround if max_turnaround is not None else f.get("max_turnaround_days")
    qvec = embed(parsed["semantic_query"] or q) if q and q.strip() else None
    rows = []
    for p in db.scalars(select(CreatorProfile)).all():
        if cat and cat not in creator_categories(db, p):
            continue
        have = {t.lower() for t in p.tools or []}
        if tool_list and not all(t in have for t in tool_list):
            continue
        if med and med not in [m.lower() for m in p.mediums or []]:
            continue
        if max_b is not None and p.price_min and p.price_min > max_b:
            continue
        if max_t is not None and p.turnaround_days and p.turnaround_days > max_t:
            continue
        rows.append((p, max(0.0, cosine(qvec, p.embedding)) if qvec else 0.0))
    if qvec:
        best = max((s for _, s in rows), default=0) or 1.0
        rows.sort(key=lambda x: (-x[1], -(x[0].rating or 0), x[0].user_id))
    else:
        best = 1.0
        rows.sort(key=lambda x: (-(x[0].verified), -(x[0].rating or 0), x[0].user_id))
    total = len(rows)
    out = []
    for p, s in rows[offset: offset + limit]:
        u = db.get(User, p.user_id)
        d = {"user": user_brief(u), "profile": profile_out(p)}
        d["match_pct"] = int(round(100 * s / best)) if qvec else None
        out.append(d)
    return {"items": out, "total": total, "parsed": {"semantic_query": parsed["semantic_query"], "filters": f} if q else None,
            "next_offset": offset + limit if offset + limit < total else None}


@router.get("/me/profile")
def my_profile(user: User = Depends(require_creator), db: Session = Depends(get_db)):
    p = db.get(CreatorProfile, user.id)
    return profile_out(p)


@router.put("/me/profile")
def update_profile(data: ProfileIn, user: User = Depends(require_creator), db: Session = Depends(get_db)):
    p = db.get(CreatorProfile, user.id)
    for k, v in data.model_dump(exclude_none=True).items():
        if isinstance(v, str):
            v = clean_text(v, 2000)
        if isinstance(v, list):
            v = [clean_text(x, 200) if isinstance(x, str) else x for x in v][:30]
        setattr(p, k, v)
    if p.price_max and p.price_min > p.price_max:
        raise HTTPException(422, "Minimum price cannot be above the maximum price.")
    refresh_profile_embedding(db, p)
    db.commit()
    return profile_out(p)


@router.post("/me/generate-profile", dependencies=[Depends(ai_limit)])
def generate_profile(user: User = Depends(require_creator), db: Session = Depends(get_db)):
    p = db.get(CreatorProfile, user.id)
    tags: list[str] = []
    for t in db.scalars(select(Post.tags).where(Post.author_id == user.id, Post.kind == "work")).all():
        for k in ("style_tags", "mood_tags", "industry_fit"):
            tags += (t or {}).get(k, [])
    agg = [t for t, _ in sorted(((x, tags.count(x)) for x in set(tags)), key=lambda kv: -kv[1])][:12]
    out = ai.generate_profile_copy(user.name, p.tools or [], p.categories or [], agg)
    p.bio, p.headline, p.ideal_client = out["bio"], out["headline"][:200], out["ideal_client"]
    p.specialties = out["specialties"]
    refresh_profile_embedding(db, p)
    db.commit()
    return profile_out(p)


@router.get("/{creator_id}")
def get_creator(creator_id: int, viewer: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    u = db.get(User, creator_id)
    if not u or u.role != "creator":
        raise HTTPException(404, "Creator not found.")
    return user_full(db, u, viewer)
