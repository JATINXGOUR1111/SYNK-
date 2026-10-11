from sqlalchemy import select
from app.db import SessionLocal
from app.models import User
from .conftest import register


def test_register_login_me(client):
    u, h = register(client, "newcreator1")
    assert u["role"] == "creator"
    me = client.get("/api/auth/me", headers=h).json()
    assert me["handle"] == "newcreator1"
    r = client.post("/api/auth/login", json={"email": "newcreator1@t.com", "password": "password1"})
    assert r.status_code == 200 and r.json()["token"]


def test_password_is_hashed(client):
    register(client, "hashcheck1")
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.handle == "hashcheck1"))
        assert u.password_hash != "password1" and u.password_hash.startswith("$2")


def test_duplicate_and_bad_input(client):
    register(client, "dupuser1")
    r = client.post("/api/auth/register", json={"email": "dupuser1@t.com", "password": "password1", "name": "X", "handle": "other_h", "role": "creator"})
    assert r.status_code == 409
    r = client.post("/api/auth/register", json={"email": "z@t.com", "password": "password1", "name": "X", "handle": "dupuser1", "role": "creator"})
    assert r.status_code == 409
    assert client.post("/api/auth/register", json={"email": "q@t.com", "password": "short", "name": "X", "handle": "okhandle", "role": "creator"}).status_code == 422
    assert client.post("/api/auth/register", json={"email": "q@t.com", "password": "password1", "name": "X", "handle": "bad handle!", "role": "creator"}).status_code == 422
    assert client.post("/api/auth/register", json={"email": "q@t.com", "password": "password1", "name": "X", "handle": "okhandle", "role": "admin"}).status_code == 422


def test_wrong_password_and_missing_token(client):
    assert client.post("/api/auth/login", json={"email": "brand@demo.com", "password": "nope-nope"}).status_code == 401
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_role_protection(client, auth):
    assert client.post("/api/briefs/clarify", json={"rough_idea": "a reel"}, headers=auth("creator1@demo.com")).status_code == 403
    assert client.post("/api/posts", data={"caption": "hi"}, headers=auth("brand@demo.com")).status_code == 403
    assert client.post("/api/proposals/draft", json={"brief_id": 1}, headers=auth("brand@demo.com")).status_code == 403
    assert client.get("/api/creators/me/profile", headers=auth("brand@demo.com")).status_code == 403


def test_update_me_and_handle_conflict(client):
    _, h = register(client, "editme1")
    assert client.put("/api/auth/me", json={"name": "Edited", "handle": "editme_2"}, headers=h).json()["handle"] == "editme_2"
    assert client.put("/api/auth/me", json={"handle": "aarav_frames"}, headers=h).status_code == 409
    assert client.put("/api/auth/me", json={"avatar_url": "javascript:alert(1)"}, headers=h).status_code == 422


def test_cors_restricted(client):
    r = client.options("/api/health", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in r.headers
    r = client.options("/api/health", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_health(client):
    j = client.get("/api/health").json()
    assert j["status"] == "ok" and j["ai"] == "fallback" and j["embeddings"] == "hash"


def test_demo_accounts_work(client):
    for e in ("brand@demo.com", "brand2@demo.com", "creator1@demo.com", "creator12@demo.com"):
        assert client.post("/api/auth/login", json={"email": e, "password": "demo1234"}).status_code == 200
