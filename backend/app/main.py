import logging
import os
from contextlib import asynccontextmanager
from fastapi import APIRouter, Depends, FastAPI, File, UploadFile
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
    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(engine)  # quick local runs and tests; Postgres uses Alembic
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
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
