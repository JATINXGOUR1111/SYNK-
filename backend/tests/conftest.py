import io
import os
import shutil
import tempfile

_tmp = tempfile.mkdtemp(prefix="cm_test_")
os.environ.update({"DATABASE_URL": os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp}/test.db", "UPLOAD_DIR": f"{_tmp}/uploads", "ANTHROPIC_API_KEY": "",
                   "VOYAGE_API_KEY": "", "SECRET_KEY": "test-secret-test-secret-test-secret", "AUTO_SEED": "false",
                   "AUTH_RATE_LIMIT_PER_MIN": "1000", "AI_RATE_LIMIT_PER_MIN": "1000"})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from app.main import app  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.ratelimit import reset_limits  # noqa: E402
from app.seed import seed  # noqa: E402

_tokens: dict[str, str] = {}


@pytest.fixture(scope="session")
def client():
    from sqlalchemy import text
    from app.db import Base, engine
    if engine.dialect.name == "postgresql":  # run the same suite against pgvector: python -m pytest with TEST_DATABASE_URL
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
    with TestClient(app) as c:
        with SessionLocal() as db:
            seed(db)
        yield c
    shutil.rmtree(_tmp, ignore_errors=True)


@pytest.fixture(autouse=True)
def _reset():
    reset_limits()


@pytest.fixture()
def auth(client):
    def _login(email: str) -> dict:
        if email not in _tokens:
            r = client.post("/api/auth/login", json={"email": email, "password": "demo1234"})
            assert r.status_code == 200, r.text
            _tokens[email] = r.json()["token"]
        return {"Authorization": f"Bearer {_tokens[email]}"}
    return _login


def png_bytes(color=(200, 50, 120)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), color).save(buf, "PNG")
    return buf.getvalue()


def register(client, handle: str, role: str = "creator", **kw):
    r = client.post("/api/auth/register", json={"email": f"{handle}@t.com", "password": "password1", "name": handle.title(),
                                                  "handle": handle, "role": role, **kw})
    assert r.status_code == 201, r.text
    return r.json()["user"], {"Authorization": f"Bearer {r.json()['token']}"}
