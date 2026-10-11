from sqlalchemy import select
from app.db import SessionLocal
from app.models import Brief, CreatorProfile, User
from app.services import matching
from .conftest import register

IDEA = "cheerful 15-second skincare reel, around 30k, in 7 days"


def _make_brief(client, h, idea=IDEA):
    q = client.post("/api/briefs/clarify", json={"rough_idea": idea}, headers=h).json()["questions"]
    assert 1 <= len(q) <= 4
    s = client.post("/api/briefs/structure", json={"rough_idea": idea, "answers": {x["q"]: x["examples"][0] for x in q}}, headers=h).json()
    r = client.post("/api/briefs", json={"rough_idea": idea, "structured": s}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_brief_flow_publishes_to_feed(client, auth):
    h = auth("brand@demo.com")
    b = _make_brief(client, h)
    assert b["structured"]["budget_range_inr"]["max"] == 30000 and b["structured"]["deadline_days"] == 7
    feed = client.get("/api/feed?tab=for_you&limit=30", headers=auth("creator1@demo.com")).json()["items"]
    assert any(p["kind"] == "brief" and p["brief_id"] == b["id"] for p in feed)


def test_unknown_fields_stay_null(client, auth):
    s = client.post("/api/briefs/structure", json={"rough_idea": "a poster for our shop", "answers": {}}, headers=auth("brand@demo.com")).json()
    assert s["budget_range_inr"] == {"min": None, "max": None} and s["deadline_days"] is None


def test_match_top5_explainable(client, auth):
    h = auth("brand@demo.com")
    b = _make_brief(client, h)
    r = client.post(f"/api/briefs/{b['id']}/match", headers=h).json()["matches"]
    assert 1 <= len(r) <= 5
    scores = [m["score"]["total"] for m in r]
    assert scores == sorted(scores, reverse=True)
    assert r[0]["creator"]["handle"] in ("aarav_frames", "sana_motion")
    for m in r:
        assert {"semantic", "tools", "budget", "quality", "total"} <= set(m["score"])
        assert m["why_match"] and m["watch_out"] and m["strengths"]
    # matched creators get notified, once
    ch = auth("creator1@demo.com")
    n1 = [n for n in client.get("/api/notifications", headers=ch).json() if n["type"] == "brief_match" and n["brief_id"] == b["id"]]
    client.post(f"/api/briefs/{b['id']}/match", headers=h)
    n2 = [n for n in client.get("/api/notifications", headers=ch).json() if n["type"] == "brief_match" and n["brief_id"] == b["id"]]
    assert len(n1) == 1 and len(n2) == 1


def test_only_owner_can_match(client, auth):
    h = auth("brand@demo.com")
    b = _make_brief(client, h)
    assert client.post(f"/api/briefs/{b['id']}/match", headers=auth("brand2@demo.com")).status_code == 403
    assert client.post(f"/api/briefs/{b['id']}/match", headers=auth("creator1@demo.com")).status_code == 403


def test_hard_filters():
    with SessionLocal() as db:
        profs = {db.get(User, p.user_id).handle: p for p in db.scalars(select(CreatorProfile)).all()}
        base = {"budget_range_inr": {"min": None, "max": 20000}, "deadline_days": 7, "format": "video", "must_have": []}
        assert matching.passes_filters(base, profs["aarav_frames"]) is False or profs["aarav_frames"].price_min <= 25000
        assert matching.passes_filters({"budget_range_inr": {"max": 10000}}, profs["vikram_vfx"]) is False  # 30k > 10k*1.25
        assert matching.passes_filters({"budget_range_inr": {"max": 24000}}, profs["aarav_frames"]) is True  # 15k <= 30k
        assert matching.passes_filters({"deadline_days": 5}, profs["vikram_vfx"]) is False  # 10d turnaround
        assert matching.passes_filters({"format": "audio"}, profs["aarav_frames"]) is False  # lacks medium
        assert matching.passes_filters({"format": "video"}, profs["aarav_frames"]) is True
        assert matching.passes_filters({"must_have": ["Must use Sora"]}, profs["aarav_frames"]) is False  # mandatory tool
        assert matching.passes_filters({"must_have": ["Must use Runway"]}, profs["aarav_frames"]) is True


def test_filters_applied_end_to_end(client, auth):
    h = auth("brand@demo.com")
    idea = "Cinematic launch film in video, budget 20k, in 4 days, Sora"
    s = client.post("/api/briefs/structure", json={"rough_idea": idea, "answers": {}}, headers=h).json()
    s["must_have"] = ["Must use Sora"]
    b = client.post("/api/briefs", json={"rough_idea": idea, "structured": s}, headers=h).json()
    assert client.post(f"/api/briefs/{b['id']}/match", headers=h).json()["matches"] == []  # Vikram is too slow/expensive


def test_shortlist_pricing_concepts(client, auth):
    h = auth("brand@demo.com")
    b = _make_brief(client, h)
    cid = client.get("/api/users/aarav_frames").json()["id"]
    assert client.post(f"/api/briefs/{b['id']}/shortlist/{cid}", headers=h).json()["shortlisted"]
    assert client.post(f"/api/briefs/{b['id']}/shortlist/{cid}", headers=h).status_code == 200  # idempotent
    assert [c["handle"] for c in client.get(f"/api/briefs/{b['id']}/shortlist", headers=h).json()] == ["aarav_frames"]
    assert any(n["type"] == "shortlist" for n in client.get("/api/notifications", headers=auth("creator1@demo.com")).json())
    m = client.post(f"/api/briefs/{b['id']}/match", headers=h).json()["matches"]
    assert any(x["shortlisted"] for x in m)
    assert client.delete(f"/api/briefs/{b['id']}/shortlist/{cid}", headers=h).json()["shortlisted"] is False
    p = client.post(f"/api/briefs/{b['id']}/pricing", headers=h).json()
    assert p["low"] <= p["mid"] <= p["high"] and p["sample_size"] > 0
    assert len(client.post(f"/api/briefs/{b['id']}/concepts", headers=h).json()["concepts"]) == 4


def test_creator_sees_open_briefs_ranked_by_fit(client, auth):
    items = client.get("/api/briefs", headers=auth("creator1@demo.com")).json()
    assert items and all(i["status"] == "open" for i in items)
    fits = [i["fit"] for i in items]
    assert fits == sorted(fits, reverse=True)


def test_update_brief_reembeds(client, auth):
    h = auth("brand@demo.com")
    b = _make_brief(client, h)
    s = b["structured"]
    s["title"] = "Updated title"
    r = client.put(f"/api/briefs/{b['id']}", json={"rough_idea": IDEA, "structured": s}, headers=h)
    assert r.status_code == 200 and r.json()["title"] == "Updated title"
    assert client.put(f"/api/briefs/{b['id']}", json={"rough_idea": IDEA, "structured": s}, headers=auth("brand2@demo.com")).status_code == 403
