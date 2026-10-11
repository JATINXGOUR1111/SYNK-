import json
from app.ai import fallbacks as fb, service as ai, client as aic
from app.ai.embeddings import hash_embed, cosine


def test_budget_deadline_parsing():
    assert fb.parse_budget("around 30k in 7 days") == (None, 30000)
    assert fb.parse_budget("budget 20-30k") == (20000, 30000)
    assert fb.parse_budget("1.5 lakh") == (None, 150000)
    assert fb.parse_budget("under ₹20,000") == (None, 20000)
    assert fb.parse_budget("15 second reel in 7 days") == (None, None)
    assert fb.parse_deadline("in 7 days") == 7 and fb.parse_deadline("within 2 weeks") == 14
    assert fb.parse_deadline("no rush") is None


def test_clarify_and_structure_no_key():
    idea = "cheerful 15-second skincare reel, around 30k, in 7 days"
    q = ai.clarify(idea)["questions"]
    assert 1 <= len(q) <= 4 and all(x["examples"] for x in q)
    s = ai.structure(idea, {})
    assert s["budget_range_inr"]["max"] == 30000 and s["deadline_days"] == 7 and s["format"] == "video"
    s2 = ai.structure("a poster for our shop", {})
    assert s2["budget_range_inr"] == {"min": None, "max": None} and s2["deadline_days"] is None  # never invent


def test_embedder_deterministic_and_semantic():
    a, b = hash_embed("cheerful skincare reel"), hash_embed("cheerful skincare reel")
    assert a == b and len(a) == 256
    assert cosine(a, hash_embed("skincare cheerful video")) > cosine(a, hash_embed("fintech jingle audio"))


def test_moderation_and_trust_fallbacks():
    assert not fb.moderate("pay outside the platform via UPI")["allowed"]
    assert not fb.moderate("call me 9876543210")["allowed"]
    assert not fb.moderate("see http://a.com http://b.com http://c.com")["allowed"]
    assert fb.moderate("Lovely soft lighting")["allowed"]
    t = fb.trust_check([], "100% original poster in the style of Banksy with Disney characters")
    assert t["risk_level"] == "high" and t["flags"]
    assert fb.trust_check(["Midjourney"], "serum bottle render")["risk_level"] == "low"


def test_llm_path_parses_fenced_json_and_vetoes_invented_numbers(monkeypatch):
    monkeypatch.setattr(aic, "ai_enabled", lambda: True)
    payload = {"title": "Reel", "goal": "g", "format": "video", "budget_range_inr": {"min": 1, "max": 99999}, "deadline_days": 3,
               "deliverables": [{"type": "reel", "quantity": 1}], "search_summary": "s"}
    monkeypatch.setattr(aic, "call_llm", lambda *a, **k: "```json\n" + json.dumps(payload) + "\n```")
    import app.ai.service as svc
    monkeypatch.setattr(svc, "llm_json", lambda *a, **k: aic.parse_json(aic.call_llm()))
    s = svc.structure("make me a reel", {})
    assert s["title"] == "Reel" and s["budget_range_inr"] == {"min": None, "max": None} and s["deadline_days"] is None


def test_llm_failure_falls_back(monkeypatch):
    import app.ai.service as svc
    monkeypatch.setattr(svc, "llm_json", lambda *a, **k: None)
    assert svc.generate_profile_copy("Sam", ["Runway"], ["beauty"], ["cinematic"])["bio"]
    assert svc.caption("t", "d", ["Runway"], ["x"])["hashtags"]
    assert svc.concept_board({"title": "x"})["concepts"]
    assert svc.suggest_price({}, [10000, 20000, 30000])["mid"] == 20000
    assert svc.suggest_price({}, [])["mid"] is None


def test_parse_json_edge_cases():
    assert aic.parse_json('noise {"a": 1} tail') == {"a": 1}
    assert aic.parse_json("not json") is None and aic.parse_json(None) is None
