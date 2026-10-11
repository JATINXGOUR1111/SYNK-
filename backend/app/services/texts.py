from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import Post, CreatorProfile, Brief
from ..ai.embeddings import embed


def post_text(caption: str, tags: dict, tools: list[str], hashtags: list[str]) -> str:
    tags = tags or {}
    parts = [caption or "", " ".join(tags.get("style_tags", [])), " ".join(tags.get("mood_tags", [])),
             " ".join(tags.get("industry_fit", [])), " ".join(tags.get("best_use_cases", [])),
             tags.get("medium", ""), " ".join(tools or []), " ".join(h.lstrip("#") for h in hashtags or [])]
    return " ".join(p for p in parts if p)


def profile_text(p: CreatorProfile, post_texts: list[str]) -> str:
    base = [p.headline, p.bio, " ".join(p.specialties or []), " ".join(p.tools or []),
            " ".join(p.categories or []), " ".join(p.categories or []), " ".join(p.mediums or [])]
    return " ".join(base + post_texts[:20])


def refresh_profile_embedding(db: Session, p: CreatorProfile) -> None:
    rows = db.scalars(select(Post).where(Post.author_id == p.user_id, Post.kind == "work")
                      .order_by(Post.created_at.desc()).limit(20)).all()
    texts = [post_text(r.caption, r.tags, r.declared_tools, r.hashtags) for r in rows]
    p.embedding = embed(profile_text(p, texts))


def brief_text(structured: dict, raw: str = "") -> str:
    s = structured or {}
    cats = s.get("categories") or []
    return " ".join([s.get("search_summary") or raw, " ".join(cats), " ".join(cats), s.get("goal") or "",
                     " ".join(s.get("tone_and_style") or []), " ".join(s.get("preferred_tools") or []),
                     s.get("format") or ""])


def creator_categories(db: Session, p: CreatorProfile) -> set[str]:
    cats = {c.lower() for c in (p.categories or [])}
    for t in db.scalars(select(Post.tags).where(Post.author_id == p.user_id, Post.kind == "work")).all():
        for c in (t or {}).get("industry_fit", []):
            cats.add(str(c).lower())
    return cats


import re as _re

_TAG = _re.compile(r"<[^>]*>")
_CTRL = _re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
HASHTAG = _re.compile(r"(?<![\w&])#([A-Za-z0-9_]{2,40})")
MENTION = _re.compile(r"(?<![\w@])@([a-z0-9_]{3,30})")


def clean_text(s: str | None, max_len: int = 3000) -> str:
    s = _CTRL.sub("", _TAG.sub("", s or "")).strip()
    return s[:max_len]


def extract_hashtags(s: str) -> list[str]:
    return list(dict.fromkeys("#" + h.lower() for h in HASHTAG.findall(s or "")))


def extract_mentions(s: str) -> list[str]:
    return list(dict.fromkeys(MENTION.findall((s or "").lower())))
