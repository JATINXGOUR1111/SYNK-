import logging
import os
from contextlib import asynccontextmanager
from fastapi import APIRouter, Depends, FastAPI, File, UploadFile
from fastapi.responses import FileResponse, Response, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, func, text
from .config import settings
from .db import Base, engine, SessionLocal
from . import models  # noqa: F401
from .ai.service import ai_status
from .routers import auth, users, creators, posts, briefs, proposals, messages, notifications
from .security import get_current_user
from .models import User
from .services import storage

log = logging.getLogger("creatormatch")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    if settings.AUTO_SEED:
        with SessionLocal() as db:
            if not db.scalar(select(func.count(User.id))):
                from .seed import seed
                seed(db)
                log.info("Seeded demo data")
    yield


app = FastAPI(title="CreatorMatch API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")
for r in (auth, users, creators, posts, briefs, proposals, messages, notifications):
    api.include_router(r.router)


@api.post("/uploads", status_code=201)
def upload(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    data, kind, ext, ctype = storage.read_upload(file)
    url = storage.save_bytes(data, ext, ctype)
    return {"url": url, "type": kind}


@api.get("/health")
def health():
    ok = True
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        ok = False
    return {"status": "ok" if ok else "degraded", "database": ok, **ai_status()}


app.include_router(api)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
_static = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(_static, exist_ok=True)
app.mount("/static", StaticFiles(directory=_static), name="static")

PLACEHOLDER_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="100%" height="100%">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5" />
      <stop offset="50%" stop-color="#7c3aed" />
      <stop offset="100%" stop-color="#c026d3" />
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)" />
  <circle cx="300" cy="260" r="60" fill="white" opacity="0.25" />
  <path d="M180 440 L260 320 L320 400 L380 300 L460 440 Z" fill="white" opacity="0.35" />
  <text x="300" y="500" text-anchor="middle" fill="white" font-family="system-ui, sans-serif" font-size="20" font-weight="600" opacity="0.85">CreatorMatch</text>
</svg>"""


@app.get("/uploads/{filename}")
def serve_upload(filename: str):
    # 1. Local disk cache
    file_path = os.path.join(settings.UPLOAD_DIR, filename)
    if os.path.isfile(file_path):
        return FileResponse(file_path)

    # 2. Database lookup (ensures persistence across Render container restarts)
    try:
        from .models import UploadedFile
        with SessionLocal() as db:
            row = db.scalar(select(UploadedFile).where(UploadedFile.name == filename))
            if row:
                try:
                    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
                    with open(file_path, "wb") as fp:
                        fp.write(row.data)
                except Exception:
                    pass
                return Response(content=row.data, media_type=row.content_type)
    except Exception as e:
        log.warning("DB upload lookup failed: %s", e)

    # 3. Graceful fallback for lost legacy uploads
    lower = filename.lower()
    if lower.endswith((".mp4", ".mov", ".webm")):
        return RedirectResponse(url="/static/demo/clip_0.mp4")
    elif lower.endswith((".mp3", ".wav", ".ogg", ".m4a")):
        return RedirectResponse(url="/static/demo/track_0.mp3")
    else:
        return Response(content=PLACEHOLDER_SVG, media_type="image/svg+xml")

