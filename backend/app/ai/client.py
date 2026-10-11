"""Thin Anthropic Messages API client. Returns None on any problem so callers fall back."""
import base64
import json
import logging
import re
import httpx
from ..config import settings

log = logging.getLogger("creatormatch.ai")


def ai_enabled() -> bool:
    return bool(settings.ANTHROPIC_API_KEY)


def call_llm(system: str, user: str, image: tuple[bytes, str] | None = None, max_tokens: int = 1200) -> str | None:
    if not ai_enabled():
        return None
    content: list[dict] = []
    if image:
        data, media_type = image
        content.append({"type": "image", "source": {"type": "base64", "media_type": media_type,
                                                    "data": base64.b64encode(data).decode()}})
    content.append({"type": "text", "text": user})
    try:
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": settings.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": settings.ANTHROPIC_MODEL, "max_tokens": max_tokens, "system": system,
                  "messages": [{"role": "user", "content": content}]},
            timeout=settings.AI_TIMEOUT_SECONDS,
        )
        r.raise_for_status()
        return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")
    except Exception as e:  # noqa: BLE001 - a failed AI call must never break a request
        log.warning("LLM call failed: %s", e)
        return None


def parse_json(text: str | None) -> dict | None:
    if not text:
        return None
    t = re.sub(r"```(?:json)?", "", text).strip()
    try:
        v = json.loads(t)
        return v if isinstance(v, dict) else None
    except json.JSONDecodeError:
        a, b = t.find("{"), t.rfind("}")
        if a != -1 and b > a:
            try:
                v = json.loads(t[a:b + 1])
                return v if isinstance(v, dict) else None
            except json.JSONDecodeError:
                return None
    return None


def llm_json(system: str, user: str, image: tuple[bytes, str] | None = None) -> dict | None:
    return parse_json(call_llm(system, user, image))
