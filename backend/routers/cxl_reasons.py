from typing import Optional

from fastapi import APIRouter

from data_access import delete_flat, list_flat, upsert_payload_only

router = APIRouter(prefix="/api/cxl-reasons", tags=["CancellationReasons"])


@router.get("")
def list_cxl_reasons(propertyId: Optional[str] = None):
    return list_flat("cxl_reasons", propertyId)


@router.post("")
def upsert_cxl_reason(data: dict):
    if not str(data.get("id") or "").strip():
        return data
    return upsert_payload_only("cxl_reasons", data, id_prefix="CX")


@router.delete("/{reason_id}")
def delete_cxl_reason(reason_id: str):
    delete_flat("cxl_reasons", reason_id)
    return {"message": "Deleted successfully"}
