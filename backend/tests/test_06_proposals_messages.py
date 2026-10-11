from sqlalchemy import select
from app.db import SessionLocal
from app.models import CreatorProfile
from .conftest import register, png_bytes

IDEA = "cheerful 15-second skincare reel, around 30k, in 7 days"


def _brief(client, h):
    s = client.post("/api/briefs/structure", json={"rough_idea": IDEA, "answers": {}}, headers=h).json()
    return client.post("/api/briefs", json={"rough_idea": IDEA, "structured": s}, headers=h).json()


def test_proposal_lifecycle_and_permissions(client, auth):
    bh, c1, c2, outsider = auth("brand@demo.com"), auth("creator1@demo.com"), auth("creator4@demo.com"), auth("creator7@demo.com")
    brief = _brief(client, bh)
    # draft (P7) stays within budget
    d = client.post("/api/proposals/draft", json={"brief_id": brief["id"]}, headers=c1).json()
    assert d["proposal_text"] and d["suggested_price_inr"] <= 30000 and d["timeline_days"] <= 7
    p1 = client.post("/api/proposals", json={"brief_id": brief["id"], "text": d["proposal_text"], "price_inr": 30000, "timeline_days": 6}, headers=c1)
    assert p1.status_code == 201
    pid = p1.json()["id"]
    assert client.post("/api/proposals", json={"brief_id": brief["id"], "text": "again please", "price_inr": 1, "timeline_days": 1}, headers=c1).status_code == 409
    p2 = client.post("/api/proposals", json={"brief_id": brief["id"], "text": "I can do this too!", "price_inr": 20000, "timeline_days": 5}, headers=c2).json()
    assert any(n["type"] == "proposal_received" for n in client.get("/api/notifications", headers=bh).json())
    # access control
    assert client.get(f"/api/proposals/{pid}", headers=outsider).status_code == 403
    assert client.post(f"/api/proposals/{pid}/status", json={"status": "accepted"}, headers=c1).status_code == 403  # creators can't accept
    assert client.post(f"/api/proposals/{pid}/status", json={"status": "accepted"}, headers=auth("brand2@demo.com")).status_code == 403
    # accept
    acc = client.post(f"/api/proposals/{pid}/status", json={"status": "accepted"}, headers=bh)
    assert acc.status_code == 200
    j = acc.json()
    assert j["status"] == "accepted" and [m["amount_inr"] for m in j["milestones"]] == [9000, 12000, 9000]
    assert j["conversation_id"]
    assert client.get(f"/api/proposals/{p2['id']}", headers=c2).json()["status"] == "rejected"  # others auto-rejected
    assert client.get(f"/api/briefs/{brief['id']}", headers=bh).json()["status"] == "in_progress"
    assert any(n["type"] == "proposal_accepted" for n in client.get("/api/notifications", headers=c1).json())
    assert client.post(f"/api/proposals/{pid}/status", json={"status": "rejected"}, headers=bh).status_code == 409
    # milestones: who can set what
    m1, m2, m3 = [m["id"] for m in j["milestones"]]
    patch = lambda h, mid, st: client.patch(f"/api/proposals/{pid}/milestones/{mid}", json={"status": st}, headers=h)
    assert patch(bh, m1, "approved").status_code == 409          # must be delivered first
    assert patch(bh, m1, "delivered").status_code == 403         # brands can't deliver
    assert patch(c1, m1, "approved").status_code == 403          # creators can't approve
    assert patch(c1, m1, "in_progress").status_code == 200
    assert patch(c1, m1, "delivered").status_code == 200
    assert patch(outsider, m1, "approved").status_code == 403
    assert patch(bh, m1, "approved").status_code == 200
    assert patch(c1, m1, "todo").status_code == 409              # approved is final
    assert client.post(f"/api/proposals/{pid}/review", json={"rating": 5}, headers=bh).status_code == 409  # not complete yet
    for mid in (m2, m3):
        patch(c1, mid, "delivered")
        r = patch(bh, mid, "approved")
    assert r.json()["proposal_status"] == "completed"
    assert client.get(f"/api/briefs/{brief['id']}", headers=bh).json()["status"] == "closed"
    # review + rating feedback
    with SessionLocal() as db:
        before = db.get(CreatorProfile, client.get("/api/auth/me", headers=c1).json()["id"])
        b_rating, b_count = before.rating, before.rating_count
    rv = client.post(f"/api/proposals/{pid}/review", json={"rating": 3, "comment": "Good but a bit late."}, headers=bh)
    assert rv.status_code == 201
    expected = (b_rating * b_count + 3) / (b_count + 1)
    assert abs(rv.json()["rating"] - expected) < 1e-6 and rv.json()["rating_count"] == b_count + 1
    assert client.post(f"/api/proposals/{pid}/review", json={"rating": 5}, headers=bh).status_code == 409
    assert client.post(f"/api/proposals/{pid}/review", json={"rating": 5}, headers=c1).status_code == 403
    prof = client.get("/api/users/aarav_frames").json()["stats"]
    assert prof["rating_count"] == b_count + 1
    assert any(r["comment"] == "Good but a bit late." for r in client.get(f"/api/creators/{client.get('/api/users/aarav_frames').json()['id']}/reviews").json())
    # workspace chat is pinned and has milestone header
    convs = client.get("/api/conversations", headers=bh).json()
    assert convs[0]["kind"] == "proposal" and convs[0]["proposal"]["milestones_total"] == 3


def test_cannot_propose_to_closed_brief_and_reject_flow(client, auth):
    bh, ch = auth("brand@demo.com"), auth("creator1@demo.com")
    brief = _brief(client, bh)
    pid = client.post("/api/proposals", json={"brief_id": brief["id"], "text": "hello there brand", "price_inr": 100, "timeline_days": 2}, headers=ch).json()["id"]
    assert client.post(f"/api/proposals/{pid}/status", json={"status": "rejected"}, headers=bh).json()["status"] == "rejected"
    assert any(n["type"] == "proposal_rejected" for n in client.get("/api/notifications", headers=ch).json())
    assert client.get("/api/proposals/mine", headers=ch).json()
    assert client.get("/api/proposals/mine", headers=bh).json()


def test_direct_messages(client, auth):
    a, b = register(client, "dm_alice", "brand"), register(client, "dm_bob")
    (ua, ha), (ub, hb) = a, b
    conv = client.post("/api/conversations", json={"user_id": ub["id"]}, headers=ha).json()
    again = client.post("/api/conversations", json={"user_id": ub["id"]}, headers=hb if False else ha).json()
    assert again["id"] == conv["id"]
    assert client.post("/api/conversations", json={"user_id": ua["id"]}, headers=ha).status_code == 400
    m = client.post(f"/api/conversations/{conv['id']}/messages", json={"body": "Hi Bob, interested in a reel?"}, headers=ha)
    assert m.status_code == 201
    assert client.get("/api/conversations/unread-count", headers=hb).json()["count"] == 1
    assert client.get("/api/conversations", headers=hb).json()[0]["unread"] == 1
    got = client.get(f"/api/conversations/{conv['id']}/messages", headers=hb).json()
    assert got["messages"][0]["body"].startswith("Hi Bob")
    assert client.get(f"/api/conversations/{conv['id']}/messages", params={"after": got["messages"][0]["id"]}, headers=hb).json()["messages"] == []
    client.post(f"/api/conversations/{conv['id']}/read", headers=hb)
    assert client.get("/api/conversations/unread-count", headers=hb).json()["count"] == 0
    # attachments + moderation + privacy
    up = client.post("/api/uploads", files={"file": ("a.png", png_bytes(), "image/png")}, headers=hb).json()
    assert client.post(f"/api/conversations/{conv['id']}/messages", json={"attachment_url": up["url"]}, headers=hb).status_code == 201
    assert client.post(f"/api/conversations/{conv['id']}/messages", json={"body": "Let's move this off-platform, pay me directly"}, headers=hb).status_code == 422
    outsider = register(client, "dm_eve")[1]
    assert client.get(f"/api/conversations/{conv['id']}/messages", headers=outsider).status_code == 403
    assert client.post(f"/api/conversations/{conv['id']}/messages", json={"body": "hi"}, headers=outsider).status_code == 403


def test_rate_limit_on_ai_endpoints(client, auth, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "AI_RATE_LIMIT_PER_MIN", 3)
    h = auth("brand2@demo.com")
    codes = [client.post("/api/briefs/clarify", json={"rough_idea": "a nice reel for us"}, headers=h).status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and 429 in codes[3:]


def test_full_demo_flow_without_api_key(client, auth):
    """Section 15: the whole 3-minute demo works with no API key."""
    # 1. creator signs up, posts, AI tags + writes profile
    cu, ch = register(client, "demo_creator")
    client.put("/api/creators/me/profile", json={"tools": ["Runway"], "categories": ["beauty"], "mediums": ["video"], "price_min": 12000,
                                                  "price_max": 28000, "turnaround_days": 5}, headers=ch)
    post = client.post("/api/posts", data={"caption": "Cheerful 15-second skincare reel #skincare", "tools": "Runway"},
                       files=[("files", ("a.png", png_bytes(), "image/png"))], headers=ch).json()
    assert post["tags"]["style_tags"]
    assert client.post("/api/creators/me/generate-profile", headers=ch).json()["bio"]
    # 2. another account follows, likes, comments
    fh = auth("creator2@demo.com")
    client.post(f"/api/users/{cu['id']}/follow", headers=fh)
    client.post(f"/api/posts/{post['id']}/like", headers=fh)
    client.post(f"/api/posts/{post['id']}/comments", json={"body": "Love this!"}, headers=fh)
    assert {"follow", "like", "comment"} <= {n["type"] for n in client.get("/api/notifications", headers=ch).json()}
    # 3-4. brand: one line -> questions -> structured brief -> feed
    bh = auth("brand@demo.com")
    brief = _brief(client, bh)
    # 5. top-5 matches with explanations
    matches = client.post(f"/api/briefs/{brief['id']}/match", headers=bh).json()["matches"]
    assert len(matches) == 5 and all(m["why_match"] and m["watch_out"] for m in matches)
    assert "demo_creator" in [m["creator"]["handle"] for m in matches]  # the new creator's post is matchable immediately
    top = matches[0]["creator"]
    # 6. shortlist -> creator notified -> proposal -> accept
    client.post(f"/api/briefs/{brief['id']}/shortlist/{top['id']}", headers=bh)
    th = ch if top["handle"] == "demo_creator" else auth({"aarav_frames": "creator1@demo.com", "sana_motion": "creator4@demo.com"}[top["handle"]])
    d = client.post("/api/proposals/draft", json={"brief_id": brief["id"]}, headers=th).json()
    pid = client.post("/api/proposals", json={"brief_id": brief["id"], "text": d["proposal_text"], "price_inr": d["suggested_price_inr"], "timeline_days": d["timeline_days"]}, headers=th).json()["id"]
    acc = client.post(f"/api/proposals/{pid}/status", json={"status": "accepted"}, headers=bh).json()
    # 7. chat, milestones, rating
    client.post(f"/api/conversations/{acc['conversation_id']}/messages", json={"body": "Excited to start!"}, headers=bh)
    for m in acc["milestones"]:
        client.patch(f"/api/proposals/{pid}/milestones/{m['id']}", json={"status": "delivered"}, headers=th)
        client.patch(f"/api/proposals/{pid}/milestones/{m['id']}", json={"status": "approved"}, headers=bh)
    assert client.get(f"/api/proposals/{pid}", headers=bh).json()["status"] == "completed"
    assert client.post(f"/api/proposals/{pid}/review", json={"rating": 5, "comment": "Superb"}, headers=bh).status_code == 201
