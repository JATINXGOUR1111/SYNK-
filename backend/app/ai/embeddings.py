"""Embeddings: Voyage (voyage-3-lite) when a key exists, else a deterministic 256-d hashing embedder.
Voyage vectors are 512-d; they are folded to 256-d so both modes share one column type."""
import hashlib
import logging
import math
import re
import httpx
from ..config import settings
from ..models import EMBED_DIM

log = logging.getLogger("creatormatch.embed")
_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = {"the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "with", "is", "are", "at", "by", "this", "that"}


def embedding_mode() -> str:
    return "voyage" if settings.VOYAGE_API_KEY else "hash"


def _norm(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def hash_embed(text: str) -> list[float]:
    toks = [t for t in _TOKEN.findall((text or "").lower()) if t not in _STOP]
    vec = [0.0] * EMBED_DIM
    feats = toks + [f"{a}_{b}" for a, b in zip(toks, toks[1:])]
    for f in feats:
        h = hashlib.md5(f.encode()).digest()
        idx = int.from_bytes(h[:4], "big") % EMBED_DIM
        sign = 1.0 if h[4] % 2 == 0 else -1.0
        vec[idx] += sign * (1.0 if "_" not in f else 0.5)
    return _norm(vec)


def _voyage(text: str) -> list[float] | None:
    try:
        r = httpx.post("https://api.voyageai.com/v1/embeddings",
                       headers={"Authorization": f"Bearer {settings.VOYAGE_API_KEY}"},
                       json={"input": [text[:8000]], "model": "voyage-3-lite"}, timeout=settings.AI_TIMEOUT_SECONDS)
        r.raise_for_status()
        v = r.json()["data"][0]["embedding"]
        half = len(v) // 2
        if half != EMBED_DIM:  # fold arbitrary dim to EMBED_DIM
            folded = [0.0] * EMBED_DIM
            for i, x in enumerate(v):
                folded[i % EMBED_DIM] += x
            return _norm(folded)
        return _norm([a + b for a, b in zip(v[:half], v[half:])]) if len(v) == 2 * EMBED_DIM else _norm(v)
    except Exception as e:  # noqa: BLE001
        log.warning("Voyage embedding failed, using hash embedder: %s", e)
        return None


def embed(text: str) -> list[float]:
    if settings.VOYAGE_API_KEY:
        v = _voyage(text)
        if v:
            return v
    return hash_embed(text)


def cosine(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))  # vectors are unit length


def weighted_average(vecs: list[tuple[list[float], float]]) -> list[float] | None:
    vecs = [(v, w) for v, w in vecs if v]
    if not vecs:
        return None
    out = [0.0] * len(vecs[0][0])
    for v, w in vecs:
        for i, x in enumerate(v):
            out[i] += x * w
    return _norm(out)
