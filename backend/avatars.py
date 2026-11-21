"""Foto profilo: ridimensionate e salvate come file in ``<cartella dati>/avatars`` (in produzione /data/avatars)."""
import base64
import binascii
import io
import os
import re
import secrets
from pathlib import Path

from fastapi import HTTPException

SIZE = 256
MAX_BYTES = 8 * 1024 * 1024
NAME_RE = re.compile(r"^\d+-[0-9a-f]{16}\.jpg$")


def data_dir() -> Path:
    if os.environ.get("DATA_DIR"):
        return Path(os.environ["DATA_DIR"])
    url = os.environ.get("DATABASE_URL", "")
    if url.startswith("sqlite:///"):
        return Path(os.path.abspath(url.split("sqlite:///", 1)[1])).parent
    return Path("data")


def avatar_dir() -> Path:
    path = data_dir() / "avatars"
    path.mkdir(parents=True, exist_ok=True)
    return path


def avatar_url(user) -> str | None:
    return f"/api/avatars/{user.avatar_path}" if getattr(user, "avatar_path", None) else None


def decode_data_url(value: str) -> bytes:
    if not value:
        raise HTTPException(status_code=422, detail="Immagine mancante")
    payload = value.split(",", 1)[1] if value.startswith("data:") else value
    try:
        raw = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="Immagine non valida")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Immagine troppo grande (massimo 8 MB)")
    return raw


def render_avatar(raw: bytes) -> bytes:
    """Ritaglio quadrato centrato, 256x256, JPEG."""
    from PIL import Image, ImageOps, UnidentifiedImageError
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=422, detail="Il file non è un'immagine valida")
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    img = ImageOps.fit(img, (SIZE, SIZE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85, optimize=True)
    return out.getvalue()


def remove_avatar_file(name: str | None):
    if name and NAME_RE.match(name):
        path = avatar_dir() / name
        if path.exists():
            path.unlink()


def save_avatar(user, data_url: str) -> str:
    image = render_avatar(decode_data_url(data_url))
    name = f"{user.id}-{secrets.token_hex(8)}.jpg"
    (avatar_dir() / name).write_bytes(image)
    old, user.avatar_path = user.avatar_path, name
    remove_avatar_file(old)
    return name


def resolve_avatar(name: str):
    if not NAME_RE.match(name or ""):
        return None
    path = avatar_dir() / name
    return path if path.is_file() else None
