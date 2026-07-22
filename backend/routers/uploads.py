"""Upload endpoints: local disk storage on the Docker volume (as-uploads-data)."""
from __future__ import annotations

import logging
import os
import re
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Cookie, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from auth_db import can_access_property, is_admin
from dependencies import require_user
from security import SESSION_COOKIE_NAME

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])
logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
ALLOWED_FOLDERS = {"feed", "chat", "general", "contracts", "requests"}
ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp",
    ".mp4", ".webm", ".mov",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".zip",
}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
VIDEO_EXT = {".mp4", ".webm", ".mov"}

# Log once when any legacy (pre-ownership-row) upload is served — do not spam per request.
_legacy_upload_logged = False


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


def _record_upload_ownership(
    public_id: str,
    *,
    user_id: Optional[str],
    property_id: Optional[str],
    folder: str,
) -> None:
    """Best-effort insert; soft-fail if migration 017 is not applied yet."""
    try:
        from utils import _get_pool

        pool = _get_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO upload_files (public_id, uploaded_by_user_id, property_id, folder)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (public_id) DO UPDATE SET
                        uploaded_by_user_id = EXCLUDED.uploaded_by_user_id,
                        property_id = EXCLUDED.property_id,
                        folder = EXCLUDED.folder
                    """,
                    (public_id, user_id, property_id, folder),
                )
            conn.commit()
    except Exception as exc:
        logger.warning("upload ownership record skipped for %s: %s", public_id, exc)


def _lookup_upload_ownership(public_id: str) -> Optional[dict[str, Any]]:
    """Return ownership row or None (missing table / missing row = legacy)."""
    try:
        from utils import _get_pool

        pool = _get_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT public_id, uploaded_by_user_id, property_id, folder
                      FROM upload_files
                     WHERE public_id = %s
                    """,
                    (public_id,),
                )
                row = cur.fetchone()
        if not row:
            return None
        return dict(row) if not isinstance(row, dict) else row
    except Exception:
        return None


def _delete_upload_ownership(public_id: str) -> None:
    try:
        from utils import _get_pool

        pool = _get_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM upload_files WHERE public_id = %s;", (public_id,))
            conn.commit()
    except Exception as exc:
        logger.warning("upload ownership delete skipped for %s: %s", public_id, exc)


def _assert_upload_access(user: dict[str, Any], public_id: str) -> None:
    """Admin, uploader, or same property scope. Legacy (no row) → authenticated OK."""
    global _legacy_upload_logged
    meta = _lookup_upload_ownership(public_id)
    if meta is None:
        if not _legacy_upload_logged:
            _legacy_upload_logged = True
            logger.warning(
                "upload %s has no ownership row; allowing authenticated access (legacy grandfather)",
                public_id,
            )
        return
    if is_admin(user):
        return
    uploader = str(meta.get("uploaded_by_user_id") or "").strip()
    if uploader and uploader == str(user.get("id") or "").strip():
        return
    file_pid = str(meta.get("property_id") or "").strip()
    if file_pid and can_access_property(user, file_pid):
        return
    raise HTTPException(status_code=404, detail="File not found.")


@router.post("/local")
async def upload_local_file(
    file: UploadFile = File(...),
    folder: str = Form("general"),
    propertyId: str | None = Form(default=None),
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    """Save a file to the Docker volume and return a same-origin URL + metadata."""
    user = require_user(session_id)

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

    prop_id = str(propertyId or user.get("propertyId") or "").strip() or None
    if prop_id and not can_access_property(user, prop_id):
        prop_id = str(user.get("propertyId") or "").strip() or None
    _record_upload_ownership(
        public_id,
        user_id=str(user.get("id") or "").strip() or None,
        property_id=prop_id,
        folder=safe_folder,
    )

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
    user = require_user(session_id)

    safe_folder = _safe_folder(folder)
    name = Path(filename).name
    if not re.fullmatch(r"[a-f0-9]{32}\.[a-z0-9]{1,8}", name, flags=re.I):
        raise HTTPException(status_code=404, detail="File not found.")
    ext = _ext_of(name)
    if not ext:
        raise HTTPException(status_code=404, detail="File not found.")

    public_id = f"{safe_folder}/{name}"
    _assert_upload_access(user, public_id)

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
    user = require_user(session_id)
    pid = str(publicId or "").strip().replace("\\", "/")
    parts = pid.split("/")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid publicId.")
    folder, filename = parts
    safe_folder = _safe_folder(folder)
    name = Path(filename).name
    if not re.fullmatch(r"[a-f0-9]{32}\.[a-z0-9]{1,8}", name, flags=re.I):
        raise HTTPException(status_code=400, detail="Invalid publicId.")
    public_id = f"{safe_folder}/{name}"
    _assert_upload_access(user, public_id)
    path = (_uploads_root() / safe_folder / name).resolve()
    try:
        path.relative_to(_uploads_root())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path.") from None
    if path.is_file():
        path.unlink()
    _delete_upload_ownership(public_id)
    return {"ok": True, "publicId": public_id}
