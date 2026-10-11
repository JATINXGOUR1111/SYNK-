import io
import mimetypes
import os
import uuid
from fastapi import HTTPException, UploadFile
from ..config import settings

ALLOWED = {
    "image/jpeg": ("image", ".jpg"), "image/png": ("image", ".png"), "image/webp": ("image", ".webp"),
    "image/gif": ("image", ".gif"),
    "video/mp4": ("video", ".mp4"), "video/webm": ("video", ".webm"), "video/quicktime": ("video", ".mov"),
    "audio/mpeg": ("audio", ".mp3"), "audio/wav": ("audio", ".wav"), "audio/x-wav": ("audio", ".wav"),
    "audio/ogg": ("audio", ".ogg"), "audio/mp4": ("audio", ".m4a"), "audio/x-m4a": ("audio", ".m4a"),
}


def media_type_from_url(url: str) -> str:
    u = url.lower().split("?")[0]
    if u.endswith((".mp4", ".webm", ".mov")):
        return "video"
    if u.endswith((".mp3", ".wav", ".ogg", ".m4a")):
        return "audio"
    return "image"


def validate_media_url(url: str) -> str:
    url = (url or "").strip()
    if not (url.startswith("http://") or url.startswith("https://")) or len(url) > 500 or " " in url:
        raise HTTPException(422, "Media links must be http(s) URLs.")
    return url


def read_upload(file: UploadFile) -> tuple[bytes, str, str, str]:
    """Validate type + size + magic bytes. Returns (data, kind, extension, content_type)."""
    ctype = (file.content_type or "").split(";")[0].lower()
    if ctype not in ALLOWED:  # some browsers send an empty or generic type: fall back to the extension
        guessed = mimetypes.guess_type(file.filename or "")[0] or ""
        ctype = guessed.lower() if guessed.lower() in ALLOWED else ctype
    if ctype not in ALLOWED:
        raise HTTPException(415, "Unsupported file type. Use JPG, PNG, WEBP, GIF, MP4, MOV, WEBM, MP3, WAV, OGG or M4A.")
    kind, ext = ALLOWED[ctype]
    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    buf = io.BytesIO()
    while True:
        chunk = file.file.read(1024 * 1024)
        if not chunk:
            break
        buf.write(chunk)
        if buf.tell() > limit:
            raise HTTPException(413, f"File is too large (max {settings.MAX_UPLOAD_MB} MB).")
    data = buf.getvalue()
    if not data:
        raise HTTPException(422, "The uploaded file is empty.")
    if kind == "image":
        try:
            from PIL import Image
            Image.open(io.BytesIO(data)).verify()
        except Exception:  # noqa: BLE001
            raise HTTPException(422, "That image file looks corrupted.")
    return data, kind, ext, ctype


def save_bytes(data: bytes, ext: str, content_type: str) -> str:
    name = f"{uuid.uuid4().hex}{ext}"
    if settings.STORAGE_BACKEND == "s3":
        import boto3
        s3 = boto3.client("s3", endpoint_url=settings.S3_ENDPOINT or None, aws_access_key_id=settings.S3_KEY,
                          aws_secret_access_key=settings.S3_SECRET)
        s3.put_object(Bucket=settings.S3_BUCKET, Key=name, Body=data, ContentType=content_type)
        if settings.S3_PUBLIC_URL:
            return f"{settings.S3_PUBLIC_URL.rstrip('/')}/{name}"
        return f"{settings.S3_ENDPOINT.rstrip('/')}/{settings.S3_BUCKET}/{name}"
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    with open(os.path.join(settings.UPLOAD_DIR, name), "wb") as f:
        f.write(data)
    return f"/uploads/{name}"  # relative: the frontend prefixes the API origin, so URLs survive host/port changes
