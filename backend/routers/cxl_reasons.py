from typing import Optional

from fastapi import APIRouter, Cookie

from data_access import delete_flat, list_flat, upsert_payload_only
from dependencies import require_admin
from security import SESSION_COOKIE_NAME

router = APIRouter(prefix="/api/cxl-reasons", tags=["CancellationReasons"])


@router.get("")
def list_cxl_reasons(propertyId: Optional[str] = None):
    return list_flat("cxl_reasons", propertyId)


@router.post("")
def upsert_cxl_reason(
    data: dict,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    require_admin(session_id)
    if not str(data.get("id") or "").strip():
        return data
    return upsert_payload_only("cxl_reasons", data, id_prefix="CX")


@router.delete("/{reason_id}")
def delete_cxl_reason(
    reason_id: str,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    require_admin(session_id)
    delete_flat("cxl_reasons", reason_id)
    return {"message": "Deleted successfully"}
