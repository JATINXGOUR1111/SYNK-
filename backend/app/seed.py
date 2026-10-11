"""Seed demo data:  python -m app.seed [--reset] [--reembed]
Demo password for every account: demo1234  (brand@demo.com, brand2@demo.com, creator1@demo.com ... creator12@demo.com)"""
import random
import sys
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func, update
from sqlalchemy.orm import Session
from .db import Base, SessionLocal, engine
from .models import (User, CreatorProfile, Post, PostLike, Save, Comment, Follow, Brief, Proposal, Milestone,
                     Review, Conversation, ConversationMember, Message, Shortlist)
from .security import hash_password
from .ai import fallbacks as fb
from .ai.embeddings import embed
from .services.texts import post_text, brief_text, refresh_profile_embedding
from .services.notify import notify

PW = "demo1234"
IMG = "https://picsum.photos/seed/{k}/900/1100"
VID = ["https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
       "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
       "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"]
AUD = ["https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"]
AV = "https://api.dicebear.com/7.x/thumbs/svg?seed={s}"

from .seed_data import CREATORS, BRANDS, PALETTE_FOR, VIDEO_FOR

COMMENTS = ["Love the colours here!", "This is so clean, great work.", "How long did the render take?",
            "The motion feels really natural.", "Saving this for reference.", "Would love to see a behind-the-scenes!",
            "That lighting is perfect.", "Super useful workflow, thanks for sharing."]


def _media(kind: str, ci: int, wi: int, pal: str) -> list[dict]:
    from .seed_data import VIDEO_FOR
    if kind == "video":
        return [{"url": f"/static/demo/clip_{VIDEO_FOR.get(pal, 0)}.mp4", "type": "video"}]
    if kind == "audio":
        return [{"url": f"/static/demo/track_{(ci + wi) % 3}.mp3", "type": "audio"}]
    out = [{"url": f"/static/demo/work_{ci}_{wi}.jpg", "type": "image"}]
    if wi == 0 and ci in (1, 5, 8, 11):  # a few carousels
        out.append({"url": f"/static/demo/work_{ci}_{(wi + 1) % 4}.jpg", "type": "image"})
    return out


def seed(db: Session, reembed: bool = False) -> None:
    rng = random.Random(42)
    now = datetime.now(timezone.utc)
    users: list[User] = []
    for i, (name, handle, city, tools, cats, meds, pmin, pmax, days, ver, headline, bio, works) in enumerate(CREATORS, 1):
        u = User(email=f"creator{i}@demo.com", name=name, handle=handle, role="creator", password_hash=hash_password(PW),
                 avatar_url=f"/static/demo/avatar_{i - 1}.jpg", banner_url=f"/static/demo/banner_{i - 1}.jpg")
        u.profile = CreatorProfile(headline=headline, bio=bio, location=f"{city}, India", tools=tools, categories=cats,
                                   mediums=meds, price_min=pmin, price_max=pmax, turnaround_days=days, verified=ver,
                                   specialties=[f"{c.title()} content" for c in cats[:3]], links=[f"https://example.com/{handle}"],
                                   ideal_client=f"Brands in {', '.join(cats)} who value quick turnaround and clear briefs.")
        db.add(u)
        users.append(u)
    brands = []
    for bi, (name, handle, email, company) in enumerate(BRANDS):
        b = User(email=email, name=name, handle=handle, role="brand", company=company, password_hash=hash_password(PW),
                 avatar_url=f"/static/demo/brand_{bi}.jpg", banner_url=f"/static/demo/brand_banner_{bi}.jpg")
        db.add(b)
        brands.append(b)
    db.flush()

    # ---- posts (3 per creator; the newest per creator is recent for the stories row)
    all_posts: list[Post] = []
    for ci, (u, c) in enumerate(zip(users, CREATORS)):
        for wi, (caption, tools, tagstr, medium) in enumerate(c[-1]):
            hashtags = tagstr.split()
            tags = fb.tag_post(f"{caption} {tagstr}", tools, hashtags, medium)
            hours = (rng.randint(1, 40) if wi == 0 else rng.randint(3, 44) if wi == 1 and ci % 3 == 0 else rng.randint(60, 24 * 20))
            p = Post(author_id=u.id, kind="work", caption=f"{caption} {tagstr}", media=_media(medium, ci, wi, PALETTE_FOR[ci]),
                     declared_tools=tools, hashtags=hashtags, tags=tags, trust=fb.trust_check(tools, caption),
                     created_at=now - timedelta(hours=hours))
            p.embedding = embed(post_text(p.caption, tags, tools, hashtags))
            db.add(p)
            all_posts.append(p)
    db.flush()

    # ---- briefs (3 open + 1 completed historical job)
    brief_specs = [
        (brands[0], "Cheerful 15-second skincare reel for our new vitamin C serum for Instagram, around 30k, in 7 days, tools like Runway", "to launch a vitamin C serum for women 20-35"),
        (brands[1], "Upbeat 20-second jingle for a fintech savings app, budget 25k, within 10 days", "to build recall for a savings app"),
        (brands[1], "Luxury jewellery product shoot, 5 images, gold tones, budget 20-35k, in 10 days, Midjourney preferred", "to showcase a festive jewellery collection"),
        (brands[0], "Diwali offer teaser reel for Instagram, 12 seconds, around 25k, in 6 days", "to announce Diwali offers"),
    ]
    briefs = []
    for k, (brand, idea, goal) in enumerate(brief_specs):
        s = fb.structure_brief(idea, {})
        s["goal"] = goal
        s["search_summary"] = fb.build_summary(s, idea)
        if k == 1:
            s["format"] = "audio"
        if k == 2:
            s["format"] = "image"
        b = Brief(brand_id=brand.id, title=s["title"], raw_idea=idea, structured=s, status="open",
                  embedding=embed(brief_text(s, idea)), created_at=now - timedelta(hours=rng.randint(2, 30) if k < 3 else 24 * 25))
        db.add(b)
        db.flush()
        if k < 3:
            db.add(Post(author_id=brand.id, kind="brief", caption=goal, media=[], brief_id=b.id, declared_tools=s["preferred_tools"],
                        tags={"style_tags": s["tone_and_style"], "industry_fit": s["categories"], "medium": s["format"] or ""},
                        embedding=b.embedding, created_at=b.created_at))
        briefs.append(b)

    # ---- follows
    def follow(a: User, b: User):
        if a.id != b.id and not db.get(Follow, (a.id, b.id)):
            db.add(Follow(follower_id=a.id, followee_id=b.id))
            if b.handle in ("aarav_frames", "glownaturals", "luminacreative"):
                notify(db, b.id, "follow", a)
    for t in (0, 1, 3, 8):
        follow(brands[0], users[t])
    for t in (2, 7, 1, 11):
        follow(brands[1], users[t])
    for u in users:
        for v in rng.sample(users, 4):
            follow(u, v)
    follow(users[0], brands[0])
    follow(users[3], brands[0])
    db.flush()

    # ---- likes, saves, comments
    for p in all_posts:
        for liker in rng.sample(users + brands, rng.randint(2, 9)):
            if liker.id != p.author_id and not db.get(PostLike, (liker.id, p.id)):
                db.add(PostLike(user_id=liker.id, post_id=p.id))
                p.like_count += 1
                if p.author_id == users[0].id:
                    notify(db, p.author_id, "like", liker, post_id=p.id)
        for saver in rng.sample(brands + users[:4], rng.randint(0, 2)):
            if saver.id != p.author_id and not db.get(Save, (saver.id, p.id)):
                db.add(Save(user_id=saver.id, post_id=p.id))
                p.save_count += 1
        for _ in range(rng.randint(0, 3)):
            who = rng.choice(users + brands)
            if who.id != p.author_id:
                db.add(Comment(post_id=p.id, author_id=who.id, body=rng.choice(COMMENTS)))
                p.comment_count += 1
                if p.author_id == users[0].id:
                    notify(db, p.author_id, "comment", who, post_id=p.id)
    db.flush()

    # ---- completed job: Aarav x Glow Naturals (Diwali teaser) with a 5-star review
    hist = briefs[3]
    hist.status = "closed"
    pr = Proposal(brief_id=hist.id, creator_id=users[0].id, status="completed", price_inr=25000, timeline_days=6,
                  text="Hi! I'll create a bright, festive 12-second teaser with Runway and Midjourney. Concept board first, then draft, then final.",
                  created_at=now - timedelta(days=24))
    db.add(pr)
    db.flush()
    for title, amt, due in (("Concept", 7500, 2), ("Draft", 10000, 4), ("Final delivery", 7500, 6)):
        db.add(Milestone(proposal_id=pr.id, title=title, amount_inr=amt, due_in_days=due, status="approved"))
    conv = Conversation(kind="proposal", proposal_id=pr.id)
    conv.members = [ConversationMember(user_id=users[0].id), ConversationMember(user_id=brands[0].id)]
    db.add(conv)
    db.flush()
    for who, body in ((brands[0], "Loved the concept board, please go ahead!"), (users[0], "Great, sending the first draft tomorrow."),
                      (brands[0], "The final reel is perfect, thank you!")):
        db.add(Message(conversation_id=conv.id, sender_id=who.id, body=body, read_at=now))
    db.add(Review(proposal_id=pr.id, creator_id=users[0].id, reviewer_id=brands[0].id, rating=5,
                  comment="Fast, creative and easy to work with. The reel performed well for us."))
    users[0].profile.rating, users[0].profile.rating_count = 5.0, 1
    # a second review so ratings vary
    users[3].profile.rating, users[3].profile.rating_count = 4.5, 2
    users[1].profile.rating, users[1].profile.rating_count = 4.8, 3
    notify(db, users[0].id, "review", brands[0], proposal_id=pr.id)
    notify(db, users[0].id, "brief_match", None, brief_id=briefs[0].id)
    notify(db, brands[0].id, "like", users[3], post_id=None)
    db.flush()
    for u in users:
        refresh_profile_embedding(db, u.profile)
    db.commit()


def reembed(db: Session) -> None:
    for p in db.scalars(select(Post)).all():
        p.embedding = embed(post_text(p.caption, p.tags, p.declared_tools, p.hashtags)) if p.kind == "work" else p.embedding
    for b in db.scalars(select(Brief)).all():
        b.embedding = embed(brief_text(b.structured, b.raw_idea))
    for post in db.scalars(select(Post).where(Post.kind == "brief")).all():
        b = db.get(Brief, post.brief_id)
        if b:
            post.embedding = b.embedding
    for p in db.scalars(select(CreatorProfile)).all():
        refresh_profile_embedding(db, p)
    db.commit()


def main() -> None:
    Base.metadata.create_all(engine) if engine.dialect.name == "sqlite" else None
    with SessionLocal() as db:
        if "--reset" in sys.argv:
            for t in reversed(Base.metadata.sorted_tables):
                db.execute(t.delete())
            db.commit()
        if "--reembed" in sys.argv:
            reembed(db)
            print("Re-embedded all posts, briefs and profiles.")
            return
        if db.scalar(select(func.count(User.id))):
            print("Database already has users. Use --reset to wipe and reseed.")
            return
        seed(db)
        print(f"Seeded. Demo password: {PW}. Try brand@demo.com or creator1@demo.com")


if __name__ == "__main__":
    main()
