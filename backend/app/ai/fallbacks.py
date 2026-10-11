"""Deterministic, non-AI implementations used when no API key exists or a model call fails."""
import re
import statistics
from .vocab import (TOOLS, CATEGORIES, CATEGORY_SYNONYMS, STYLES, MOODS, USE_CASES, MEDIUM_WORDS,
                    BANNED_WORDS, SCAM_PHRASES, BRAND_RISK, LIVING_ARTIST_RE)

UNIT = {"k": 1_000, "thousand": 1_000, "l": 100_000, "lakh": 100_000, "lac": 100_000, "lakhs": 100_000,
        "lacs": 100_000, "m": 1_000_000}
TIME_WORDS = ("sec", "second", "s ", "min", "day", "week", "hour", "month", "x", "fps", "px", "word", "slide")


def _inr(num: str, unit: str | None) -> int:
    return int(round(float(num) * UNIT.get((unit or "").lower(), 1)))


def parse_budget(text: str) -> tuple[int | None, int | None]:
    t = (text or "").lower().replace(",", "")
    t = t.replace("₹", " rs ").replace("rupees", " rs ")
    m = re.search(r"(\d+(?:\.\d+)?)\s*(k|l|lakh|lac|lakhs)?\s*(?:-|–|to)\s*(?:rs\.?\s*|inr\s*)?(\d+(?:\.\d+)?)\s*(k|l|lakh|lac|lakhs|thousand)\b", t)
    if m:
        u = m.group(4)
        lo, hi = _inr(m.group(1), m.group(2) or u), _inr(m.group(3), u)
        return (min(lo, hi), max(lo, hi))
    for m in re.finditer(r"(rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(k|l|lakh|lac|lakhs|thousand)?\b([^\d]{0,12})", t):
        cur, num, unit, tail = m.group(1), m.group(2), m.group(3), m.group(4) or ""
        nxt = (tail.strip() + " ")[:8]
        if unit or cur:
            return (None, _inr(num, unit))
        if float(num) >= 1000 and not nxt.startswith(TIME_WORDS):
            return (None, _inr(num, None))
    return (None, None)


def parse_deadline(text: str) -> int | None:
    t = (text or "").lower()
    m = re.search(r"(\d+)\s*[- ]?\s*(day|days|d|week|weeks|wk|month|months)\b", t)
    if m:
        n, u = int(m.group(1)), m.group(2)
        return n * (7 if u.startswith(("w",)) else 30 if u.startswith("month") else 1)
    if "tomorrow" in t:
        return 1
    if re.search(r"\b(a|one|next|this)\s+week\b", t):
        return 7
    if re.search(r"\b(a|one|next)\s+month\b", t):
        return 30
    return None


def parse_duration(text: str) -> str | None:
    m = re.search(r"(\d+)\s*[- ]?\s*(seconds?|secs?|minutes?|mins?)\b", (text or "").lower())
    if m:
        return f"{m.group(1)} {'seconds' if m.group(2).startswith('sec') else 'minutes'}"
    m = re.search(r"\b(\d{3,4})\s*x\s*(\d{3,4})\b", (text or "").lower())
    return f"{m.group(1)}x{m.group(2)}" if m else None


def find_tools(text: str) -> list[str]:
    t = (text or "").lower()
    return [x for x in TOOLS if re.search(r"\b" + re.escape(x.lower()) + r"\b", t)]


def find_categories(text: str) -> list[str]:
    t = (text or "").lower()
    out: list[str] = []
    for c in CATEGORIES:
        if re.search(r"\b" + re.escape(c) + r"\b", t) and c not in out:
            out.append(c)
    for syn, c in CATEGORY_SYNONYMS.items():
        if re.search(r"\b" + re.escape(syn) + r"\b", t) and c not in out:
            out.append(c)
    return out


def find_medium(text: str) -> str | None:
    t = (text or "").lower()
    scores = {m: sum(1 for w in ws if w in t) for m, ws in MEDIUM_WORDS.items()}
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] else None


def find_words(text: str, vocab: list[str]) -> list[str]:
    t = (text or "").lower()
    return [w for w in vocab if re.search(r"\b" + re.escape(w) + r"\b", t)]


PLATFORMS = ["instagram", "youtube", "tiktok", "linkedin", "facebook", "website", "spotify", "tv", "whatsapp", "twitter"]


def structure_brief(idea: str, answers: dict | list | None) -> dict:
    ans_text = " ".join(str(v) for v in (answers.values() if isinstance(answers, dict) else answers or []))
    text = f"{idea}. {ans_text}"
    lo, hi = parse_budget(text)
    fmt_scores = {m: sum(1 for w in ws if w in text.lower()) for m, ws in MEDIUM_WORDS.items()}
    present = [m for m, s in fmt_scores.items() if s]
    fmt = "mixed" if len(present) > 2 else (present[0] if len(present) == 1 else
                                            (max(fmt_scores, key=lambda k: fmt_scores[k]) if present else None))
    if fmt == "design":
        fmt = "image"
    plat = next((p for p in PLATFORMS if p in text.lower()), None)
    tone = find_words(text, STYLES + MOODS)
    deliverables = []
    for m in re.finditer(r"(\d+)\s*(reels?|videos?|images?|posts?|jingles?|photos?|shoots?|designs?|songs?|ads?)", text.lower()):
        deliverables.append({"type": m.group(2).rstrip("s"), "quantity": int(m.group(1))})
    if not deliverables:
        nouns = [w for w in ["reel", "video", "jingle", "shoot", "photo", "poster", "logo", "ad", "song"] if w in text.lower()]
        if nouns:
            deliverables.append({"type": nouns[0], "quantity": 1})
    cats = find_categories(text)
    words = re.findall(r"[A-Za-z0-9₹'-]+", idea)
    title = " ".join(words[:9]).strip()
    title = (title[:1].upper() + title[1:]) if title else "Untitled brief"
    goal_m = re.search(r"\b(to|so that)\s+([^.,;]{8,80})", idea)
    goal = (goal_m.group(2).strip()[:1].upper() + goal_m.group(2).strip()[1:] if goal_m else None)
    aud_m = re.search(r"\b(?:for|targeting|aimed at)\s+((?:gen z|millennials|women|men|kids|students|parents|"
                      r"professionals|young [a-z]+|first[- ]time [a-z]+)[^.,;]{0,40})", text.lower())
    deadline = parse_deadline(text)
    s = {"title": title, "goal": goal, "target_audience": aud_m.group(1).strip() if aud_m else None,
         "format": fmt, "platform": plat, "duration_or_size": parse_duration(text), "tone_and_style": tone[:5],
         "deliverables": deliverables, "budget_range_inr": {"min": lo, "max": hi}, "deadline_days": deadline,
         "preferred_tools": find_tools(text), "must_have": [], "avoid": [], "categories": cats}
    s["search_summary"] = build_summary(s, idea)
    return s


def build_summary(s: dict, idea: str = "") -> str:
    parts = [s.get("title") or idea]
    for k in ("goal", "target_audience", "platform", "duration_or_size"):
        if s.get(k):
            parts.append(f"{k.replace('_', ' ')}: {s[k]}")
    if s.get("format"):
        parts.append(f"format {s['format']}")
    if s.get("tone_and_style"):
        parts.append("tone " + ", ".join(s["tone_and_style"]))
    if s.get("categories"):
        parts.append("industry " + ", ".join(s["categories"]))
    if s.get("preferred_tools"):
        parts.append("tools " + ", ".join(s["preferred_tools"]))
    return ". ".join(parts)[:500]


QUESTION_BANK = [
    ("goal", "What should this piece achieve (e.g. launch, sales, awareness)?", ["Launch a new product", "Drive sales this month", "Build brand awareness"],
     r"\b(launch|promote|increase|awareness|sales|drive|announce|convert|goal|objective|grow|introduce)\b"),
    ("audience", "Who is it for?", ["Women 18-30 in metro cities", "Gen Z college students", "First-time home buyers"],
     r"\b(audience|gen z|millennial|women|men|kids|students|parents|professionals|customers|users|young)\b"),
    ("platform", "Where will it be posted?", ["Instagram Reels", "YouTube", "Website hero banner"],
     r"\b(instagram|youtube|tiktok|linkedin|facebook|website|spotify|tv|whatsapp|twitter|reels?|shorts)\b"),
    ("deliverables", "How many pieces do you need?", ["1 reel", "3 product images", "1 jingle + 2 cutdowns"],
     r"\b(\d+)\s*(reels?|videos?|images?|posts?|jingles?|photos?|shoots?|designs?|songs?|ads?)\b"),
    ("tone", "What tone or style do you want?", ["Cheerful and fresh", "Luxurious and minimal", "Bold and energetic"],
     r"\b(" + "|".join(STYLES + MOODS) + r")\b"),
    ("duration", "How long or what size should it be?", ["15 seconds", "30 seconds", "1080x1080"], None),
    ("budget", "What is your budget in INR?", ["Around 20k", "30k-50k", "Under 1 lakh"], None),
    ("deadline", "When do you need it?", ["In 7 days", "Within 2 weeks", "No rush"], None),
    ("reference", "Is there an example you like?", ["A link to a video you love", "A brand whose look you admire"],
     r"\b(like|similar|reference|inspired|example)\b"),
]


def clarifying_questions(idea: str) -> list[dict]:
    t = idea.lower()
    missing = []
    for key, q, ex, pat in QUESTION_BANK:
        if key == "duration":
            present = parse_duration(t) is not None
        elif key == "budget":
            present = parse_budget(t) != (None, None)
        elif key == "deadline":
            present = parse_deadline(t) is not None
        else:
            present = bool(re.search(pat, t))
        if not present:
            missing.append({"q": q, "examples": ex[:3], "key": key})
    if len(missing) <= 2 and len(idea.split()) >= 25:
        return []
    return missing[:4]


def tag_post(caption: str, tools: list[str], hashtags: list[str], medium_hint: str | None) -> dict:
    text = " ".join([caption or "", " ".join(hashtags or []), " ".join(tools or [])])
    styles = find_words(text, STYLES)[:5] or ([medium_hint] if medium_hint else [])
    moods = find_words(text, MOODS)[:3]
    cats = find_categories(text)[:3]
    uses = [v for k, v in USE_CASES.items() if k in text.lower()][:3]
    return {"medium": medium_hint or find_medium(text) or "image", "style_tags": styles, "mood_tags": moods,
            "likely_tools": [], "industry_fit": cats, "best_use_cases": uses,
            "quality_notes": "Tags inferred from the caption and declared tools; no visual analysis was available.",
            "confidence": 0.3}


def trust_check(tools: list[str], description: str) -> dict:
    d = description or ""
    low = d.lower()
    flags = []
    for b in BRAND_RISK:
        if b in low:
            flags.append(f"Mentions a possibly protected brand or character: {b}")
    if re.search(LIVING_ARTIST_RE, d):
        flags.append("Appears to imitate a named artist's style")
    if re.search(r"100\s*%\s*(original|unique)|completely original", low) and not tools:
        flags.append("Claims full originality without disclosing any tools")
    risk = "high" if any(f.startswith(("Mentions", "Appears")) for f in flags) else "medium" if flags else "low"
    rec = {"low": "No obvious issues found by the automatic screen.",
           "medium": "Add the tools you used so brands can trust the workflow.",
           "high": "Review for copyright or style-imitation issues before relying on this work commercially."}[risk]
    return {"risk_level": risk, "flags": flags, "recommendation": rec + " (Screening aid only, not a legal judgment.)"}


def moderate(text: str) -> dict:
    t = (text or "").lower()
    for w in BANNED_WORDS:
        if w in t:
            return {"allowed": False, "category": "harassment", "reason": "This contains language that is not allowed here."}
    for p in SCAM_PHRASES:
        if p in t:
            return {"allowed": False, "category": "scam", "reason": "Please keep payments and conversations on CreatorMatch."}
    links = len(re.findall(r"https?://|www\.", t))
    if links > 2:
        return {"allowed": False, "category": "spam", "reason": "Too many links."}
    if re.search(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b", t) or re.search(r"(?<!\d)(?:\+?91[- ]?)?[6-9]\d{9}(?!\d)", t):
        return {"allowed": False, "category": "personal_data", "reason": "Please do not share personal contact details in public content."}
    words = t.split()
    if len(words) >= 6 and max(words.count(w) for w in set(words)) >= 6 and len(set(words)) <= 3:
        return {"allowed": False, "category": "spam", "reason": "This looks like spam."}
    return {"allowed": True, "category": "", "reason": ""}


def profile_copy(name: str, tools: list[str], categories: list[str], tags: list[str]) -> dict:
    tl = ", ".join(tools[:4]) or "AI tools"
    cl = ", ".join(categories[:3]) or "creative projects"
    st = ", ".join(tags[:3])
    bio = (f"{name} creates AI-assisted work using {tl}. They focus on {cl}" +
           (f" with a {st} look." if st else "."))
    headline = f"AI creator for {categories[0]}" if categories else "AI creator"
    headline = (headline + (f" using {tools[0]}" if tools else ""))[:100]
    spec = [f"{c.title()} content" for c in categories[:3]] or ["AI-generated visuals"]
    ideal = (f"Brands and agencies in {cl} that need fast, AI-assisted creative" +
             (f" in a {st} style" if st else "") + " and value clear briefs and quick turnaround.")
    return {"bio": bio, "headline": headline, "specialties": spec, "ideal_client": ideal}


def parse_search(query: str) -> dict:
    t = query.lower().replace(",", "")
    cats = find_categories(t)
    _, hi = parse_budget(t)
    days = parse_deadline(t)
    medium = None
    if re.search(r"\b(reel|video|film|animation|commercial)\b", t):
        medium = "video"
    elif re.search(r"\b(jingle|music|song|voiceover|audio)\b", t):
        medium = "audio"
    elif re.search(r"\b(shoot|photo|image|render|illustration)\b", t):
        medium = "image"
    elif re.search(r"\b(logo|packaging|design)\b", t):
        medium = "design"
    return {"semantic_query": query.strip(), "filters": {"category": cats[0] if cats else None, "tools": find_tools(t),
            "max_budget_inr": hi, "max_turnaround_days": days, "medium": medium}}


def why_match(brief: dict, creator: dict, pieces: list[dict], breakdown: dict) -> dict:
    tools = creator.get("tools") or []
    wanted = [t for t in (brief.get("preferred_tools") or []) if t.lower() in [x.lower() for x in tools]]
    strengths = []
    if pieces:
        p = pieces[0]
        tags = ", ".join((p.get("tags") or [])[:3])
        strengths.append(f"Portfolio piece \"{(p.get('caption') or 'recent work')[:60]}\"" + (f" shows {tags} style" if tags else ""))
    if wanted:
        strengths.append("Works with " + ", ".join(wanted))
    elif tools:
        strengths.append("Workflow built on " + ", ".join(tools[:3]))
    cats = [c for c in (creator.get("categories") or []) if c in (brief.get("categories") or [])]
    if cats:
        strengths.append("Experience in " + ", ".join(cats))
    if creator.get("rating_count"):
        strengths.append(f"Rated {creator['rating']:.1f}/5 across {creator['rating_count']} job(s)")
    mx = (brief.get("budget_range_inr") or {}).get("max")
    pref = [t for t in (brief.get("preferred_tools") or []) if t.lower() not in [x.lower() for x in tools]]
    cats_brief = brief.get("categories") or []
    cats = [c for c in (creator.get("categories") or []) if c in cats_brief]
    if mx and creator.get("price_min") and creator["price_min"] > mx:
        watch = f"Starting price (₹{creator['price_min']:,}) is above the ₹{mx:,} budget."
    elif brief.get("deadline_days") and creator.get("turnaround_days", 0) >= brief["deadline_days"]:
        watch = f"Typical turnaround ({creator['turnaround_days']} days) leaves little room against the {brief['deadline_days']}-day deadline."
    elif mx and creator.get("price_max") and creator["price_max"] > mx:
        watch = f"Upper price range (₹{creator['price_max']:,}) exceeds the ₹{mx:,} budget, so scope may need trimming."
    elif pref:
        watch = f"Does not list {', '.join(pref[:2])}, which the brief prefers."
    elif not creator.get("rating_count"):
        watch = "No completed jobs on the platform yet, so there are no client reviews to check."
    elif creator.get("rating_count", 0) < 3:
        watch = f"Only {creator['rating_count']} client review(s) so far, so the track record is short."
    elif cats_brief and not cats:
        watch = "No portfolio work declared in this brief's industry."
    else:
        watch = f"Evidence is limited to {len(pieces)} relevant portfolio piece(s); ask for more samples before committing."
    strengths = strengths[:3] or ["Profile matches the brief on overall style"]
    why = (f"{creator.get('name', 'This creator')} scores {round(breakdown.get('total', 0) * 100)}% on fit. " +
           "; ".join(strengths[:2]) + ".")
    return {"why_match": why, "strengths": strengths, "watch_out": watch}


def draft_proposal(brief: dict, creator: dict) -> dict:
    b = brief.get("budget_range_inr") or {}
    lo, hi = b.get("min"), b.get("max")
    base = int((creator.get("price_min", 0) + (creator.get("price_max") or creator.get("price_min", 0))) / 2)
    price = base
    if hi is not None:
        price = min(price, hi)
    if lo is not None:
        price = max(price, lo)
    days = creator.get("turnaround_days") or 7
    if brief.get("deadline_days"):
        days = min(days, brief["deadline_days"])
    tools = creator.get("tools") or []
    goal = brief.get("goal") or brief.get("title") or "your brief"
    text = (f"Hi! I understand you want {goal}"
            f"{(' for ' + brief['platform']) if brief.get('platform') else ''}, and I'd love to make it.\n"
            f"- Concept board and tone check first ({', '.join(tools[:2]) or 'AI tools'})\n"
            f"- Draft generation and edit pass with your feedback\n"
            f"- Final export in the formats you need\n"
            f"Delivery in {days} days for ₹{price:,}. Happy to adjust scope.")
    return {"proposal_text": text, "suggested_price_inr": price, "timeline_days": days}


def price_suggestion(brief: dict, samples: list[int]) -> dict:
    s = sorted(x for x in samples if x and x > 0)
    if not s:
        return {"low": None, "mid": None, "high": None,
                "reasoning": "There are not enough similar creators with prices yet to suggest a range."}
    q = lambda p: int(s[min(len(s) - 1, int(p * (len(s) - 1) + 0.5))])
    return {"low": q(0.25), "mid": int(statistics.median(s)), "high": q(0.75),
            "reasoning": f"Based on {len(s)} similar creators' price ranges. This is an estimate, not a quote."}


PALETTES = [("Sunrise glow", ["#FF9A62", "#FFD1A9", "#FF5E78"]), ("Clean studio", ["#F5F7FA", "#CBD5E1", "#6366F1"]),
            ("Bold neon", ["#7C3AED", "#EC4899", "#22D3EE"]), ("Earthy natural", ["#A3B18A", "#DAD7CD", "#588157"])]
COMPOSITIONS = ["close-up hero shot, shallow depth of field", "wide symmetrical flat lay", "dynamic diagonal motion",
                "centered subject with generous negative space"]


def concepts(brief: dict) -> dict:
    subj = brief.get("title") or "the product"
    aud = brief.get("target_audience")
    out = []
    for (name, pal), comp in zip(PALETTES, COMPOSITIONS):
        out.append({"name": name, "palette": pal,
                    "image_prompt": f"{subj}{(' for ' + aud) if aud else ''}, {comp}, {name.lower()} colour palette, "
                                    f"{', '.join((brief.get('tone_and_style') or [])[:2]) or 'polished'} mood, high detail"})
    return {"concepts": out}


def caption(title: str, description: str, tools: list[str], tags: list[str]) -> dict:
    base = (description or title or "New work").strip().split()
    cap = " ".join(base[:30]) + ("…" if len(base) > 30 else "")
    if tools:
        cap += f" Made with {tools[0]}."
    cap = " ".join(cap.split()[:40])
    raw = [*(tags or []), *[t.lower().replace(" ", "") for t in tools or []], "aicreator", "madewithai"]
    seen, tagsout = set(), []
    for x in raw:
        h = "#" + re.sub(r"[^a-z0-9_]", "", str(x).lower().lstrip("#"))
        if len(h) > 1 and h not in seen:
            seen.add(h)
            tagsout.append(h)
    return {"caption": cap, "hashtags": tagsout[:8]}
