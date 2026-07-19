"""Upload endpoints: local disk storage on the Docker volume (as-uploads-data)."""
from __future__ import annotations

import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Cookie, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from dependencies import require_user
from security import SESSION_COOKIE_NAME

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
ALLOWED_FOLDERS = {"feed", "chat", "general", "contracts", "requests"}
ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
    ".mp4", ".webm", ".mov",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".zip",
}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"}
VIDEO_EXT = {".mp4", ".webm", ".mov"}


def _uploads_root() -> Path:
    raw = (os.getenv("UPLOADS_DIR") or "").strip()
    if raw:
        root = Path(raw)
    else:
        root = Path(__file__).resolve().parent.parent / "uploads"
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def _safe_folder(folder: str | None) -> str:
    f = re.sub(r"[^a-z0-9_-]", "", (folder or "general").strip().lower().split("/")[-1])
    if f not in ALLOWED_FOLDERS:
        f = "general"
    return f


def _ext_of(filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext in ALLOWED_EXTENSIONS:
        return ext
    return ""


def _resource_type(ext: str) -> str:
    if ext in IMAGE_EXT:
        return "image"
    if ext in VIDEO_EXT:
        return "video"
    return "raw"


def _guess_media_type(ext: str) -> str:
    mapping = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
        ".svg": "image/svg+xml",
        ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
        ".pdf": "application/pdf",
        ".txt": "text/plain", ".csv": "text/csv",
        ".zip": "application/zip",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".ppt": "application/vnd.ms-powerpoint",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }
    return mapping.get(ext, "application/octet-stream")


@router.post("/local")
async def upload_local_file(
    file: UploadFile = File(...),
    folder: str = Form("general"),
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    """Save a file to the Docker volume and return a same-origin URL + metadata."""
    require_user(session_id)

    original = (file.filename or "file").strip() or "file"
    ext = _ext_of(original)
    if not ext:
        raise HTTPException(
            status_code=400,
            detail="File type not allowed. Use images, video, PDF, or common office documents.",
        )

    safe_folder = _safe_folder(folder)
    dest_dir = _uploads_root() / safe_folder
    dest_dir.mkdir(parents=True, exist_ok=True)

    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = dest_dir / stored_name

    size = 0
    try:
        with dest_path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    out.close()
                    dest_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="File too large (max 20 MB).")
                out.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {exc}") from exc
    finally:
        await file.close()

    public_id = f"{safe_folder}/{stored_name}"
    secure_url = f"/api/uploads/files/{public_id}"

    return {
        "secure_url": secure_url,
        "public_id": public_id,
        "original_filename": original[:200],
        "bytes": size,
        "format": ext.lstrip("."),
        "resource_type": _resource_type(ext),
    }


@router.get("/files/{folder}/{filename}")
def get_local_file(
    folder: str,
    filename: str,
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    """Serve a previously uploaded file (auth required; cookie sent by <img>/<a>)."""
    require_user(session_id)

    safe_folder = _safe_folder(folder)
    name = Path(filename).name
    if not re.fullmatch(r"[a-f0-9]{32}\.[a-z0-9]{1,8}", name, flags=re.I):
        raise HTTPException(status_code=404, detail="File not found.")
    ext = _ext_of(name)
    if not ext:
        raise HTTPException(status_code=404, detail="File not found.")

    path = (_uploads_root() / safe_folder / name).resolve()
    root = _uploads_root()
    try:
        path.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=404, detail="File not found.") from None
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")

    return FileResponse(
        path,
        media_type=_guess_media_type(ext),
        filename=name,
        content_disposition_type="inline",
    )


@router.delete("/local")
def delete_local_file(
    publicId: str,
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    """Delete a local upload by public_id (folder/filename)."""
    require_user(session_id)
    pid = str(publicId or "").strip().replace("\\", "/")
    parts = pid.split("/")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid publicId.")
    folder, filename = parts
    safe_folder = _safe_folder(folder)
    name = Path(filename).name
    if not re.fullmatch(r"[a-f0-9]{32}\.[a-z0-9]{1,8}", name, flags=re.I):
        raise HTTPException(status_code=400, detail="Invalid publicId.")
    path = (_uploads_root() / safe_folder / name).resolve()
    try:
        path.relative_to(_uploads_root())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path.") from None
    if path.is_file():
        path.unlink()
    return {"ok": True, "publicId": f"{safe_folder}/{name}"}
