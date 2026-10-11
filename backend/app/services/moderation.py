from ..ai import service as ai


def moderate_text(text: str, image=None) -> dict:
    try:
        return ai.moderate(text, image)
    except Exception:  # noqa: BLE001
        from ..ai.fallbacks import moderate
        return moderate(text)
