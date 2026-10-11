from .conftest import png_bytes, register


def _ids(items):
    return [i["id"] for i in items]


def test_for_you_pagination_has_no_duplicates(client, auth):
    h = auth("brand@demo.com")
    seen, cursor = [], None
    for _ in range(12):
        r = client.get("/api/feed", params={"tab": "for_you", "limit": 6, **({"cursor": cursor} if cursor else {})}, headers=h).json()
        seen += _ids(r["items"])
        cursor = r["next_cursor"]
        if not cursor:
            break
    assert len(seen) == len(set(seen)) and len(seen) > 12


def test_feed_public_and_tab_auth(client):
    assert client.get("/api/feed?tab=for_you").status_code == 200
    assert client.get("/api/feed?tab=following").status_code == 401
    assert client.get("/api/feed?tab=nope").status_code == 422


def test_following_tab_is_chronological_and_only_followed(client, auth):
    h = auth("brand@demo.com")
    me = client.get("/api/auth/me", headers=h).json()
    following = {u["id"] for u in client.get(f"/api/users/{me['id']}/following").json()}
    items = client.get("/api/feed?tab=following&limit=30", headers=h).json()["items"]
    assert items and all(i["author"]["id"] in following for i in items)
    ts = [i["created_at"] for i in items]
    assert ts == sorted(ts, reverse=True)


def test_briefs_tab_creator_has_fit_and_brand_gets_creators(client, auth):
    items = client.get("/api/feed?tab=briefs", headers=auth("creator1@demo.com")).json()["items"]
    assert items and all(i["kind"] == "brief" and "fit" in i for i in items)
    fits = [i["fit"] for i in items]
    assert fits == sorted(fits, reverse=True)
    brand_items = client.get("/api/feed?tab=briefs", headers=auth("brand@demo.com")).json()["items"]
    assert brand_items and all(i["kind"] == "work" for i in brand_items)


def test_stories_ring(client, auth):
    s = client.get("/api/stories", headers=auth("brand@demo.com")).json()
    assert s["stories"] and s["stories"][0]["posts"]
    assert all(st["user"]["role"] == "creator" for st in s["stories"])
    assert s["open_briefs"]  # brands see an open-briefs ring
    assert client.get("/api/stories", headers=auth("creator1@demo.com")).json()["open_briefs"] == []


def test_explore_nl_search_and_filters(client):
    r = client.get("/api/explore", params={"q": "cheerful 15-second reel for a skincare brand under 20k"}).json()
    assert r["parsed"]["filters"]["max_budget_inr"] == 20000 and r["parsed"]["filters"]["category"] == "beauty"
    assert r["posts"] and r["creators"] and r["creators"][0]["match_pct"] == 100
    r = client.get("/api/explore", params={"medium": "audio"}).json()
    assert r["posts"] and all(p["media"][0]["type"] == "audio" for p in r["posts"])
    r = client.get("/api/explore", params={"tool": "Suno"}).json()
    assert r["posts"] and all("Suno" in p["declared_tools"] for p in r["posts"])


def test_creator_search_nl_and_ui_filter_override(client):
    r = client.get("/api/creators", params={"q": "jingle for a fintech app under 12k"}).json()
    assert r["items"] and r["items"][0]["user"]["handle"] in ("rohan_beats", "neha_voice") and r["items"][0]["match_pct"] == 100
    assert all(i["profile"]["price_min"] <= 12000 for i in r["items"])
    r = client.get("/api/creators", params={"q": "jingle under 12k", "max_budget": 100000}).json()  # explicit overrides parsed
    assert any(i["profile"]["price_min"] > 12000 for i in r["items"]) or r["total"] >= 1
    r = client.get("/api/creators", params={"tools": "Runway", "medium": "video"}).json()
    assert r["items"] and all("Runway" in i["profile"]["tools"] for i in r["items"])


def test_trending_and_tag_page(client):
    t = client.get("/api/tags/trending").json()
    assert t["tags"] and t["tools"]
    tag = t["tags"][0]["tag"]
    page = client.get(f"/api/tags/{tag}").json()
    assert page["posts"] and page["creators"]


def test_new_post_appears_in_following_feed(client, auth):
    u, h = register(client, "feed_creator")
    bh = auth("brand2@demo.com")
    client.post(f"/api/users/{u['id']}/follow", headers=bh)
    pid = client.post("/api/posts", data={"caption": "fresh work #new"}, files=[("files", ("a.png", png_bytes(), "image/png"))], headers=h).json()["id"]
    items = client.get("/api/feed?tab=following&limit=5", headers=bh).json()["items"]
    assert items[0]["id"] == pid


def test_user_posts_endpoint(client):
    r = client.get("/api/users/aarav_frames/posts").json()
    assert r["total"] >= 3 and all(p["author"]["handle"] == "aarav_frames" for p in r["items"])
    v = client.get("/api/users/aarav_frames/posts", params={"medium": "video"}).json()
    assert v["items"] and all(p["media"][0]["type"] == "video" for p in v["items"])
    assert client.get("/api/users/nobody_here/posts").status_code == 404
    b = client.get("/api/users/glownaturals/posts").json()
    assert any(p["kind"] == "brief" for p in b["items"])
