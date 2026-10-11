"""Public AI functions. Each tries the model (P1-P12) and validates the result, else uses a fallback."""
import json
from concurrent.futures import ThreadPoolExecutor
from . import fallbacks as fb
from . import prompts as P
from .client import llm_json, ai_enabled
from .embeddings import embedding_mode


def ai_status() -> dict:
    return {"ai": "claude" if ai_enabled() else "fallback", "embeddings": embedding_mode()}


def _list(x, n=10) -> list:
    return [str(i) for i in x][:n] if isinstance(x, list) else []


def _str(x, default="") -> str:
    return x.strip() if isinstance(x, str) else default


def _sys(prompt: str) -> str:
    return prompt + P.RULES


# ---------- P1
def tag_media(caption: str, tools: list[str], hashtags: list[str], medium: str | None,
              image: tuple[bytes, str] | None = None) -> dict:
    desc = "image" if image else f"{medium or 'work'} (described by caption: {caption[:300]})"
    user = f"Caption: {caption}\nDeclared tools: {tools}\nHashtags: {hashtags}"
    r = llm_json(_sys(P.fill(P.P1, media_description=desc)), user, image)
    if r and isinstance(r.get("style_tags"), list):
        return {"medium": _str(r.get("medium"), medium or "image") if _str(r.get("medium")) in
                {"image", "video", "audio", "design", "copy"} else (medium or "image"),
                "style_tags": _list(r.get("style_tags"), 5), "mood_tags": _list(r.get("mood_tags"), 3),
                "likely_tools": _list(r.get("likely_tools"), 5), "industry_fit": _list(r.get("industry_fit"), 3),
                "best_use_cases": _list(r.get("best_use_cases"), 4), "quality_notes": _str(r.get("quality_notes")),
                "confidence": max(0.0, min(1.0, float(r.get("confidence") or 0.5)))}
    return fb.tag_post(caption, tools, hashtags, medium)


# ---------- P2
def generate_profile_copy(name: str, tools: list[str], categories: list[str], tags: list[str]) -> dict:
    r = llm_json(_sys(P.fill(P.P2, name=name, tools=tools, categories=categories, aggregated_tags=tags)),
                 "Write the profile copy now.")
    if r and _str(r.get("bio")) and _str(r.get("headline")):
        return {"bio": _str(r["bio"]), "headline": _str(r["headline"])[:200],
                "specialties": _list(r.get("specialties"), 3), "ideal_client": _str(r.get("ideal_client"))}
    return fb.profile_copy(name, tools, categories, tags)


# ---------- P3
def clarify(rough_idea: str) -> dict:
    r = llm_json(_sys(P.fill(P.P3, rough_idea=rough_idea)), "Ask your clarifying questions now.")
    if r and isinstance(r.get("questions"), list):
        qs = [{"q": _str(q.get("q")), "examples": _list(q.get("examples"), 3), "key": f"q{i}"}
              for i, q in enumerate(r["questions"][:4]) if isinstance(q, dict) and _str(q.get("q"))]
        return {"questions": qs}
    return {"questions": fb.clarifying_questions(rough_idea)}


# ---------- P4
def _num(x):
    try:
        return None if x is None or x == "" else int(float(x))
    except (TypeError, ValueError):
        return None


def structure(rough_idea: str, answers) -> dict:
    ans_text = json.dumps(answers, ensure_ascii=False)
    r = llm_json(_sys(P.fill(P.P4, rough_idea=rough_idea, answers=answers)), "Build the structured brief now.")
    base = fb.structure_brief(rough_idea, answers)  # regex ground truth, used to veto invented numbers
    if r and _str(r.get("title")):
        b = r.get("budget_range_inr") if isinstance(r.get("budget_range_inr"), dict) else {}
        lo, hi = _num(b.get("min")), _num(b.get("max"))
        dl = _num(r.get("deadline_days"))
        src = f"{rough_idea} {ans_text}".lower()
        has_digits = any(c.isdigit() for c in src) or "lakh" in src
        if not has_digits or (base["budget_range_inr"]["max"] is None and base["budget_range_inr"]["min"] is None):
            lo = hi = None  # never invent a budget
        if not has_digits or base["deadline_days"] is None:
            dl = None  # never invent a deadline
        fmt = r.get("format") if r.get("format") in ("video", "image", "audio", "mixed") else base["format"]
        dels = [{"type": _str(d.get("type")), "quantity": _num(d.get("quantity")) or 1}
                for d in (r.get("deliverables") or []) if isinstance(d, dict) and _str(d.get("type"))]
        s = {"title": _str(r["title"])[:200], "goal": r.get("goal") or None,
             "target_audience": r.get("target_audience") or None, "format": fmt,
             "platform": r.get("platform") or None, "duration_or_size": r.get("duration_or_size") or None,
             "tone_and_style": _list(r.get("tone_and_style"), 6), "deliverables": dels,
             "budget_range_inr": {"min": lo, "max": hi}, "deadline_days": dl,
             "preferred_tools": _list(r.get("preferred_tools"), 6), "must_have": _list(r.get("must_have"), 6),
             "avoid": _list(r.get("avoid"), 6), "categories": base["categories"]}
        s["search_summary"] = _str(r.get("search_summary")) or fb.build_summary(s, rough_idea)
        return s
    return base


# ---------- P5
def parse_search(query: str) -> dict:
    r = llm_json(_sys(P.fill(P.P5, query=query)), "Parse the search now.")
    if r and isinstance(r.get("filters"), dict):
        f = r["filters"]
        local = fb.parse_search(query)["filters"]
        # only keep a model-set filter if the local parser can corroborate it (never over-filter)
        return {"semantic_query": _str(r.get("semantic_query"), query) or query,
                "filters": {"category": f.get("category") if f.get("category") and local["category"] else local["category"],
                            "tools": [t for t in _list(f.get("tools")) if t.lower() in query.lower()] or local["tools"],
                            "max_budget_inr": _num(f.get("max_budget_inr")) if local["max_budget_inr"] else None,
                            "max_turnaround_days": _num(f.get("max_turnaround_days")) if local["max_turnaround_days"] else None,
                            "medium": f.get("medium") if f.get("medium") in ("image", "video", "audio", "design") else local["medium"]}}
    return fb.parse_search(query)


# ---------- P6
def explain_match(brief: dict, creator: dict, pieces: list[dict], breakdown: dict) -> dict:
    r = llm_json(_sys(P.fill(P.P6, structured_brief_json=brief, creator_summary=creator,
                              top_3_pieces_with_tags=pieces, score_breakdown=breakdown)), "Explain the match now.")
    if r and _str(r.get("why_match")) and _str(r.get("watch_out")):
        return {"why_match": _str(r["why_match"]), "strengths": _list(r.get("strengths"), 4),
                "watch_out": _str(r["watch_out"])}
    return fb.why_match(brief, creator, pieces, breakdown)


def explain_many(items: list[tuple[dict, dict, list[dict], dict]]) -> list[dict]:
    if not items:
        return []
    with ThreadPoolExecutor(max_workers=min(5, len(items))) as ex:
        return list(ex.map(lambda a: explain_match(*a), items))


# ---------- P7
def draft_proposal(brief: dict, creator: dict) -> dict:
    r = llm_json(_sys(P.fill(P.P7, brief_json=brief, creator_profile=creator)), "Draft the proposal now.")
    fbk = fb.draft_proposal(brief, creator)
    if r and _str(r.get("proposal_text")):
        price, days = _num(r.get("suggested_price_inr")), _num(r.get("timeline_days"))
        hi = (brief.get("budget_range_inr") or {}).get("max")
        if price is None or (hi is not None and price > hi):
            price = fbk["suggested_price_inr"]
        return {"proposal_text": _str(r["proposal_text"]), "suggested_price_inr": price,
                "timeline_days": days or fbk["timeline_days"]}
    return fbk


# ---------- P8
def trust_check(tools: list[str], description: str) -> dict:
    r = llm_json(_sys(P.fill(P.P8, tools=tools, description=description)), "Review now.")
    local = fb.trust_check(tools, description)
    if r and r.get("risk_level") in ("low", "medium", "high"):
        order = {"low": 0, "medium": 1, "high": 2}
        level = r["risk_level"] if order[r["risk_level"]] >= order[local["risk_level"]] else local["risk_level"]
        flags = list(dict.fromkeys(_list(r.get("flags"), 6) + local["flags"]))
        return {"risk_level": level, "flags": flags, "recommendation": _str(r.get("recommendation")) or local["recommendation"]}
    return local


# ---------- P9
def suggest_price(brief: dict, samples: list[int]) -> dict:
    if samples:
        r = llm_json(_sys(P.fill(P.P9, brief_json=brief, price_samples=samples)), "Suggest the price now.")
        if r and all(_num(r.get(k)) is not None for k in ("low", "mid", "high")):
            lo, mid, hi = (_num(r[k]) for k in ("low", "mid", "high"))
            if min(samples) * 0.5 <= lo <= hi <= max(samples) * 2:  # keep within the provided samples' range
                return {"low": lo, "mid": mid, "high": hi, "reasoning": _str(r.get("reasoning"))}
    return fb.price_suggestion(brief, samples)


# ---------- P10
def concept_board(brief: dict) -> dict:
    r = llm_json(_sys(P.fill(P.P10, brief_json=brief)), "Write the concepts now.")
    if r and isinstance(r.get("concepts"), list) and r["concepts"]:
        cs = [{"name": _str(c.get("name")), "image_prompt": _str(c.get("image_prompt")),
               "palette": _list(c.get("palette"), 3)} for c in r["concepts"][:4] if isinstance(c, dict)]
        if cs:
            return {"concepts": cs}
    return fb.concepts(brief)


# ---------- P11
def caption(title: str, description: str, tools: list[str], tags: list[str]) -> dict:
    r = llm_json(_sys(P.fill(P.P11, title=title, description=description, tools=tools, tags=tags)), "Write now.")
    if r and _str(r.get("caption")):
        tags_out = [("#" + t.lstrip("#").replace(" ", "").lower()) for t in _list(r.get("hashtags"), 8)]
        return {"caption": " ".join(_str(r["caption"]).split()[:40]), "hashtags": tags_out}
    return fb.caption(title, description, tools, tags)


# ---------- P12
def moderate(text: str, image: tuple[bytes, str] | None = None) -> dict:
    local = fb.moderate(text)
    if not local["allowed"]:
        return local  # deterministic rules always win
    if not text.strip() and not image:
        return local
    r = llm_json(_sys(P.P12), f"Content:\n{text[:3000]}", image)
    if r and isinstance(r.get("allowed"), bool):
        return {"allowed": r["allowed"], "category": _str(r.get("category")), "reason": _str(r.get("reason"))}
    return local
