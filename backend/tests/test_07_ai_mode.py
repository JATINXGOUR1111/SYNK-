"""Pipelines with a (mocked) model attached: valid JSON is used, invalid/failed output falls back."""
import app.ai.service as svc
from .conftest import register

IDEA = "cheerful 15-second skincare reel, around 30k, in 7 days"


def _fake(system: str, user: str, image=None):
    if "matching assistant" in system:
        return {"why_match": "Model says: strong dewy macro reel in Runway.", "strengths": ["Runway workflow"], "watch_out": "Model risk: limited reviews."}
    if "Draft a short proposal" in system:
        return {"proposal_text": "Model proposal text", "suggested_price_inr": 999999, "timeline_days": 4}  # over budget -> must be clamped
    if "Classify this user-generated" in system:
        return {"allowed": False, "category": "spam", "reason": "Model flagged this."} if "BUYNOW" in user else {"allowed": True, "category": "", "reason": ""}
    return None  # everything else falls back


def test_model_outputs_used_and_guarded(client, auth, monkeypatch):
    monkeypatch.setattr(svc, "llm_json", _fake)
    bh = auth("brand@demo.com")
    s = client.post("/api/briefs/structure", json={"rough_idea": IDEA, "answers": {}}, headers=bh).json()
    b = client.post("/api/briefs", json={"rough_idea": IDEA, "structured": s}, headers=bh).json()
    m = client.post(f"/api/briefs/{b['id']}/match", headers=bh).json()["matches"]
    assert m and all(x["why_match"].startswith("Model says") and x["watch_out"].startswith("Model risk") for x in m)
    d = client.post("/api/proposals/draft", json={"brief_id": b["id"]}, headers=auth("creator1@demo.com")).json()
    assert d["proposal_text"] == "Model proposal text" and d["suggested_price_inr"] <= 30000  # never above the brand's budget
    _, ch = register(client, "mocked_creator")
    r = client.post("/api/posts", data={"caption": "BUYNOW cheap followers"}, headers=ch)
    assert r.status_code == 422 and "Model flagged" in r.json()["detail"]  # model moderation blocks publishing


def test_garbage_model_output_never_breaks_requests(client, auth, monkeypatch):
    monkeypatch.setattr(svc, "llm_json", lambda *a, **k: {"unexpected": "shape"})
    bh = auth("brand@demo.com")
    assert client.post("/api/briefs/clarify", json={"rough_idea": IDEA}, headers=bh).status_code == 200
    s = client.post("/api/briefs/structure", json={"rough_idea": IDEA, "answers": {}}, headers=bh)
    assert s.status_code == 200 and s.json()["budget_range_inr"]["max"] == 30000
    assert client.get("/api/explore", params={"q": "skincare reel under 20k"}).status_code == 200
