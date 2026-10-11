from .conftest import png_bytes, register
from app.config import settings


def _post(client, h, caption="Cinematic skincare reel #skincare", tools="Runway", **extra):
    return client.post("/api/posts", data={"caption": caption, "tools": tools, **extra},
                       files=[("files", ("a.png", png_bytes(), "image/png"))], headers=h)


def test_creator_post_pipeline(client):
    u, h = register(client, "poster_one")
    r = _post(client, h)
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["media"][0]["type"] == "image" and j["media"][0]["url"].endswith(".png")
    assert j["tags"]["style_tags"] and "cinematic" in j["tags"]["style_tags"]  # P1
    assert j["trust"]["risk_level"] in ("low", "medium", "high")  # P8
    assert "#skincare" in j["hashtags"]
    assert client.get(f"/api/posts/{j['id']}").json()["author"]["handle"] == "poster_one"


def test_followers_notified_on_new_post(client, auth):
    u, h = register(client, "poster_two")
    fh = auth("creator2@demo.com")
    fid = client.get("/api/auth/me", headers=fh).json()["id"]
    client.post(f"/api/users/{u['id']}/follow", headers=fh)
    before = client.get("/api/notifications/unread-count", headers=h).json()["count"]
    _post(client, h)
    ns = client.get("/api/notifications", headers=fh).json()
    assert any(n["type"] == "new_post" and n["actor"]["handle"] == "poster_two" for n in ns)
    assert before >= 1  # the follow itself notified the creator


def test_upload_validation(client):
    _, h = register(client, "poster_three")
    r = client.post("/api/posts", data={"caption": "x"}, files=[("files", ("evil.exe", b"MZ...", "application/x-msdownload"))], headers=h)
    assert r.status_code == 415
    r = client.post("/api/posts", data={"caption": "x"}, files=[("files", ("fake.png", b"not an image", "image/png"))], headers=h)
    assert r.status_code == 422
    r = client.post("/api/posts", data={"caption": "x", "media_urls": "javascript:alert(1)"}, headers=h)
    assert r.status_code == 422
    r = client.post("/api/posts", data={"caption": "x", "media_urls": "https://example.com/a.mp4"}, headers=h)
    assert r.status_code == 201 and r.json()["media"][0]["type"] == "video"


def test_upload_size_limit(client, monkeypatch):
    _, h = register(client, "poster_four")
    monkeypatch.setattr(settings, "MAX_UPLOAD_MB", 0)
    r = _post(client, h)
    assert r.status_code == 413


def test_moderation_blocks_scam_and_xss_is_stripped(client):
    _, h = register(client, "poster_five")
    assert _post(client, h, caption="DM me, pay outside the platform on UPI").status_code == 422
    r = _post(client, h, caption="Nice <script>alert(1)</script>work")
    assert r.status_code == 201 and "<script>" not in r.json()["caption"]


def test_trust_flag_surfaces(client):
    _, h = register(client, "poster_six")
    r = _post(client, h, caption="Mickey and Disney mashup in the style of Banksy", tools="")
    assert r.json()["trust"]["risk_level"] == "high" and r.json()["trust"]["flags"]


def test_delete_only_by_author(client, auth):
    _, h = register(client, "poster_seven")
    pid = _post(client, h).json()["id"]
    assert client.delete(f"/api/posts/{pid}", headers=auth("creator1@demo.com")).status_code == 403
    assert client.delete(f"/api/posts/{pid}", headers=h).status_code == 200
    assert client.get(f"/api/posts/{pid}").status_code == 404


def test_like_save_idempotent_and_counts(client, auth):
    _, h = register(client, "poster_eight")
    pid = _post(client, h).json()["id"]
    b = auth("brand@demo.com")
    assert client.post(f"/api/posts/{pid}/like", headers=b).json()["like_count"] == 1
    assert client.post(f"/api/posts/{pid}/like", headers=b).json()["like_count"] == 1
    assert client.post(f"/api/posts/{pid}/save", headers=b).json()["save_count"] == 1
    assert client.post(f"/api/posts/{pid}/save", headers=b).json()["save_count"] == 1
    p = client.get(f"/api/posts/{pid}", headers=b).json()
    assert p["liked"] and p["saved"]
    assert any(x["id"] == pid for x in client.get("/api/me/saved", headers=b).json()["posts"])
    assert client.delete(f"/api/posts/{pid}/like", headers=b).json()["like_count"] == 0
    assert client.delete(f"/api/posts/{pid}/like", headers=b).json()["like_count"] == 0
    assert client.delete(f"/api/posts/{pid}/save", headers=b).json()["save_count"] == 0
    assert client.post(f"/api/posts/{pid}/like").status_code == 401  # visitors must sign up


def test_follow_idempotent_and_lists(client, auth):
    u, _ = register(client, "poster_nine")
    h = auth("brand2@demo.com")
    assert client.post(f"/api/users/{u['id']}/follow", headers=h).json()["followers"] == 1
    assert client.post(f"/api/users/{u['id']}/follow", headers=h).json()["followers"] == 1
    assert client.get(f"/api/users/{u['id']}/followers").json()[0]["handle"] == "luminacreative"
    prof = client.get("/api/users/poster_nine", headers=h).json()
    assert prof["is_following"] and prof["stats"]["followers"] == 1
    assert client.post(f"/api/users/{prof['id']}/follow", headers=register(client, "second_f")[1]).status_code == 200
    assert client.delete(f"/api/users/{u['id']}/follow", headers=h).json()["followers"] == 1  # second_f remains
    me = client.get("/api/auth/me", headers=h).json()
    assert client.post(f"/api/users/{me['id']}/follow", headers=h).status_code == 400


def test_comments_replies_likes_and_notifications(client, auth):
    owner, oh = register(client, "poster_ten")
    pid = _post(client, oh).json()["id"]
    ch = auth("creator3@demo.com")
    c = client.post(f"/api/posts/{pid}/comments", json={"body": "Great work @poster_ten"}, headers=ch).json()
    r1 = client.post(f"/api/posts/{pid}/comments", json={"body": "thanks!", "parent_id": c["id"]}, headers=oh).json()
    r2 = client.post(f"/api/posts/{pid}/comments", json={"body": "reply to reply", "parent_id": r1["id"]}, headers=ch).json()
    assert r1["parent_id"] == c["id"] and r2["parent_id"] == c["id"]  # one level deep
    thread = client.get(f"/api/posts/{pid}/comments").json()
    assert len(thread) == 1 and len(thread[0]["replies"]) == 2
    assert client.get(f"/api/posts/{pid}").json()["comment_count"] == 3
    assert client.post(f"/api/comments/{c['id']}/like", headers=oh).json()["like_count"] == 1
    assert client.post(f"/api/comments/{c['id']}/like", headers=oh).json()["like_count"] == 1
    types = {n["type"] for n in client.get("/api/notifications", headers=oh).json()}
    assert {"comment", "mention"} <= types
    assert client.delete(f"/api/comments/{c['id']}", headers=oh).status_code == 200  # post owner can delete
    assert client.get(f"/api/posts/{pid}").json()["comment_count"] == 0
    assert client.post(f"/api/posts/{pid}/comments", json={"body": "pay me directly on gpay"}, headers=ch).status_code == 422


def test_notifications_read_flow(client):
    u, h = register(client, "notif_user")
    _, h2 = register(client, "notif_actor")
    client.post(f"/api/users/{u['id']}/follow", headers=h2)
    assert client.get("/api/notifications/unread-count", headers=h).json()["count"] == 1
    n = client.get("/api/notifications", headers=h).json()
    assert n[0]["group"] == "today" and not n[0]["read"]
    client.post("/api/notifications/read-all", headers=h)
    assert client.get("/api/notifications/unread-count", headers=h).json()["count"] == 0


def test_profile_edit_and_generate(client):
    u, h = register(client, "profile_user")
    r = client.put("/api/creators/me/profile", json={"tools": ["Midjourney"], "categories": ["fashion"], "mediums": ["image"],
                   "price_min": 5000, "price_max": 20000, "turnaround_days": 4}, headers=h)
    assert r.status_code == 200 and r.json()["tools"] == ["Midjourney"]
    assert client.put("/api/creators/me/profile", json={"price_min": 9000, "price_max": 1000}, headers=h).status_code == 422
    g = client.post("/api/creators/me/generate-profile", headers=h).json()
    assert g["bio"] and g["headline"] and g["specialties"]


def test_upload_urls_are_relative_and_extension_fallback(client):
    _, h = register(client, "uploader_one")
    # browser sent a generic type: fall back to the .png extension
    r = client.post("/api/uploads", files={"file": ("pic.png", png_bytes(), "application/octet-stream")}, headers=h)
    assert r.status_code == 201 and r.json()["url"].startswith("/uploads/") and r.json()["type"] == "image"
    assert client.get(r.json()["url"]).status_code == 200  # served by the API
    r2 = client.post("/api/uploads", files={"file": ("clip.mov", b"\x00\x00\x00\x14ftypqt  ", "")}, headers=h)
    assert r2.status_code == 201 and r2.json()["type"] == "video"


def test_profile_photo_and_banner_update(client):
    u, h = register(client, "avatar_user")
    a = client.post("/api/uploads", files={"file": ("a.png", png_bytes(), "image/png")}, headers=h).json()["url"]
    b = client.post("/api/uploads", files={"file": ("b.png", png_bytes((1, 2, 3)), "image/png")}, headers=h).json()["url"]
    me = client.put("/api/auth/me", json={"avatar_url": a, "banner_url": b}, headers=h).json()
    assert me["avatar_url"] == a and me["banner_url"] == b
    prof = client.get("/api/users/avatar_user").json()
    assert prof["banner_url"] == b and prof["avatar_url"] == a
    assert client.put("/api/auth/me", json={"banner_url": "javascript:x"}, headers=h).status_code == 422


def test_demo_media_is_served(client):
    assert client.get("/static/demo/work_0_0.jpg").status_code == 200
    assert client.get("/static/demo/clip_0.mp4").headers["content-type"].startswith("video")
    p = client.get("/api/users/aarav_frames").json()
    assert p["avatar_url"].startswith("/static/demo/") and client.get(p["avatar_url"]).status_code == 200


def test_clear_avatar_and_banner(client):
    _, h = register(client, "clear_user")
    url = client.post("/api/uploads", files={"file": ("a.png", png_bytes(), "image/png")}, headers=h).json()["url"]
    client.put("/api/auth/me", json={"avatar_url": url, "banner_url": url}, headers=h)
    me = client.put("/api/auth/me", json={"clear_avatar": True, "clear_banner": True}, headers=h).json()
    assert me["avatar_url"] is None and me["banner_url"] is None
