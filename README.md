# CreatorMatch

A social, AI-native marketplace for AI creators. It looks and feels like Instagram + X + LinkedIn, but it is a marketplace:
creators post AI-made work and get hired, brands post one-line briefs and get AI-matched with the best creators, and the
whole job (proposal, chat, milestones, rating) runs inside the platform.

## Architecture

```
                 ┌────────────────────────────┐
  Browser  ───►  │  Next.js 14 (App Router)   │   TypeScript strict · Tailwind · Inter
                 │  feed · profile · explore  │   polls notifications/messages every 5 s
                 └──────────────┬─────────────┘
                                │ REST + Bearer JWT   (NEXT_PUBLIC_API_URL)
                 ┌──────────────▼─────────────┐
                 │  FastAPI  /api/*           │   Pydantic v2 · SQLAlchemy 2 · bcrypt · rate limits
                 │  routers ─► services       │   feed ranking (P13) · matching engine · moderation
                 └───┬───────────┬────────────┘
                     │           │
        ┌────────────▼──┐   ┌────▼───────────────────────────┐   ┌───────────────────┐
        │ PostgreSQL 16 │   │ AI layer (app/ai)              │   │ Storage           │
        │ + pgvector    │   │ P1-P12 prompts → Claude API    │   │ local /uploads or │
        │ HNSW (cosine) │   │ every call has a fallback      │   │ S3-compatible     │
        │ (SQLite: dev) │   │ embeddings: Voyage | hash-256  │   └───────────────────┘
        └───────────────┘   └────────────────────────────────┘
```

Key design points
* **Every AI call has a non-AI fallback** (keyword tagging, regex budget/deadline parsing, templated text), so the app works with no API key and a failed model call never breaks a request. `/api/health` reports `ai: claude|fallback` and `embeddings: voyage|hash`.
* **Model output is validated, not trusted.** Budgets and deadlines returned by the model are discarded unless the user's own text contains them; proposal prices above the brand's budget are clamped; deterministic moderation rules always win over the model.
* **Embeddings are computed once on write** and stored (`vector(256)` on Postgres, JSON on SQLite). Voyage's 512-d vectors are folded to 256-d so both modes share one column. Switching embedding mode? run `python -m app.seed --reembed`.
* **Feed ranking (P13)** is pure code: 0.40 similarity + 0.25 recency (24 h half-life) + 0.20 engagement + 0.10 affinity + 0.05 rating, 10 % exploration, and a cursor carrying seen IDs so a post is never shown twice in a session.
* **Matching** = hard filters (budget +25 %, turnaround, medium, mandatory tool) → semantic (65 % vector / 35 % industry, normalised to the best candidate) → weighted score (0.50 / 0.20 / 0.15 / 0.15) → top 5 with a score breakdown, "why this match" and one watch-out.

## Quick start

### With Docker (everything, no manual steps)
```bash
docker compose up --build
# frontend http://localhost:3000   API docs http://localhost:8000/docs
```
Postgres (pgvector), the backend (runs `alembic upgrade head`, seeds demo data because `AUTO_SEED=true`) and the frontend start together.
Add `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` to your shell (or a `.env` next to `docker-compose.yml`) to switch AI on.

### Without Docker
```bash
# backend (SQLite, no external services)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # for SQLite quick runs set DATABASE_URL=sqlite:///./creatormatch.db
python -m app.seed            # demo data
uvicorn app.main:app --reload # http://localhost:8000

# frontend
cd ../frontend
cp .env.example .env.local
npm install && npm run dev    # http://localhost:3000
```
For PostgreSQL: start a `pgvector/pgvector:pg16` database, set `DATABASE_URL`, then `alembic upgrade head` (creates the `vector` extension and HNSW indexes).

## Demo content, uploads and photos
* The seed uses **generated media that ships with the repo** (`backend/app/static/demo`: 12 avatars and covers, ~48 artworks, 4 video clips with posters, 3 audio tracks), so the app looks full and works fully **offline**. Regenerate with `python backend/scripts/make_demo_media.py` (needs ffmpeg).
* **Already have an older database?** Run `python -m app.seed --reset` (or `docker compose down -v` first) to load the new demo content. `AUTO_SEED` only seeds an empty database.
* **Uploading:** creators use **Post** for photos, video (MP4, MOV, WEBM) and audio, up to `MAX_UPLOAD_MB` (default 100). Photos are resized in the browser before upload; a progress bar is shown. Brand accounts post briefs instead (**New Brief**).
* **Profile photo and cover photo:** open your own profile and use the camera button on the avatar and **Change cover** on the banner, or go to **Settings**. Both can be removed there.
* Local uploads are stored as relative URLs (`/uploads/...`) and the frontend adds the API origin, so they keep working when the host or port changes. HEIC photos are not supported (export as JPG or PNG).

## Demo accounts
Password for all: **demo1234** · `brand@demo.com` (Glow Naturals) · `brand2@demo.com` (Lumina Creative agency) · `creator1@demo.com` … `creator12@demo.com`

## Environment variables
| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | backend | `postgresql://…` (prod) or `sqlite:///./creatormatch.db` |
| `SECRET_KEY` | backend | JWT signing key. **Set a long random value in production** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | backend | JWT lifetime (default 10080) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | backend | Claude for prompts P1–P12 (blank = fallbacks) |
| `VOYAGE_API_KEY` | backend | Voyage `voyage-3-lite` embeddings (blank = built-in 256-d hashing embedder) |
| `CORS_ORIGINS` | backend | Comma-separated allowed origins |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | backend | Local upload folder and size limit |
| `STORAGE_BACKEND` | backend | `local` or `s3` |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_KEY`, `S3_SECRET`, `S3_PUBLIC_URL` | backend | S3-compatible / Supabase Storage |
| `PUBLIC_BASE_URL` | backend | Public URL of the API (used to build upload URLs) |
| `AUTO_SEED` | backend | `true` seeds an empty database on first boot |
| `AI_RATE_LIMIT_PER_MIN`, `AUTH_RATE_LIMIT_PER_MIN` | backend | Per-user AI / per-IP auth rate limits |
| `NEXT_PUBLIC_API_URL` | frontend | Backend base URL (baked in at build time) |

## Seeding
`python -m app.seed` seeds 12 creators, 2 brands, 4 briefs (3 open + 1 completed job with a 5-star review), ~40 posts, follows, likes, comments and notifications.
`--reset` wipes first, `--reembed` recomputes all vectors.

## Tests
```bash
cd backend && python -m pytest -q                    # SQLite, no API key needed
TEST_DATABASE_URL=postgresql://user:pw@localhost/cm_test python -m pytest -q   # same suite on pgvector
cd frontend && npm run lint && npm run type-check && npm run build
```
58 backend tests cover auth and roles, discovery, brief builder, matching order and filters, proposals and milestone permissions,
review → rating update, uploads and trust, idempotent follow/like/comment, feed pagination, notifications, messaging, and the AI path with a mocked model.

## Deploy
**Backend + database on Render:** push to GitHub → *New → Blueprint* → select the repo (`render.yaml`). Fill the `sync: false` variables:
`CORS_ORIGINS` (your Vercel URL), `PUBLIC_BASE_URL` (the Render URL), the S3 variables, and optionally the AI keys.
Render's disk is **ephemeral**, so uploads must go to object storage (`STORAGE_BACKEND=s3`). The database must support the `vector` extension (Render Postgres does; the migration runs `CREATE EXTENSION`).
**Frontend on Vercel:** import the repo, set *Root Directory* to `frontend`, add `NEXT_PUBLIC_API_URL=https://<your-render-service>.onrender.com`.
**CI:** `.github/workflows/ci.yml` runs backend tests (SQLite and pgvector), migrations, frontend lint, type-check and build on every push.

## 3-minute demo script
1. Sign up as a creator (`/register`), open **Settings**, pick tools/industries/price, then **Post** a piece. AI tags it; click **Write with AI** in Settings for the bio.
2. Log in as `creator2@demo.com`; follow, like and comment on that post. The creator gets notifications.
3. Log in as `brand@demo.com` → **New Brief** and type: *cheerful 15-second skincare reel, around 30k, in 7 days*.
4. Answer (or tap) the 3–4 AI questions → review the editable structured brief → **Publish** (it appears in the feed).
5. Click **Find my top 5**: score ring, four breakdown bars, *why this match* and a *watch-out* per creator.
6. **Shortlist** one creator. As that creator (`creator1@demo.com`) open the brief → **Draft with AI** → send. As the brand, **Accept**.
7. In the workspace chat, creator marks milestones delivered, brand approves them, then rates the creator; the profile rating updates.

## Notes and limits
* Payments are simulated (milestones only). No native apps, video transcoding or legal copyright determination; the trust check is a screening aid.
* Alembic revision `0001` snapshots the model schema at v1.0 (via `metadata.create_all`) and adds the pgvector extension and HNSW indexes; later schema changes should be separate revisions.
