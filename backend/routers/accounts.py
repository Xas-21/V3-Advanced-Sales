from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from services.business_card_scan import parse_business_card_image
from data_access import delete_account, get_account, list_accounts, upsert_account

router = APIRouter(prefix="/api", tags=["Accounts"])

SCAN_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
_SCAN_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
_SCAN_IMAGE_CT = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/bmp",
    "application/octet-stream",
}


class AccountUpsertBody(BaseModel):
    """Minimal identity + list fields; extras kept for payload jsonb."""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    propertyId: Optional[str] = None
    contacts: Optional[list[Any]] = None
    activities: Optional[list[Any]] = None
    tags: Optional[list[Any]] = None
    profileAuditLog: Optional[list[Any]] = None


class AccountSyncBody(BaseModel):
    """Sync envelope: typed identity/list/bool; extras allowed."""

    model_config = ConfigDict(extra="allow")

    propertyId: str = Field(..., min_length=1)
    accounts: list[Any] = Field(default_factory=list)
    allowClear: bool = False


@router.get("/accounts")
def list_accounts_endpoint(propertyId: Optional[str] = None):
    return list_accounts(propertyId)


@router.post("/accounts")
def upsert_account_endpoint(data: AccountUpsertBody):
    return upsert_account(data.model_dump(exclude_unset=True))


@router.get("/accounts/{account_id}")
def get_account_endpoint(account_id: str):
    acc = get_account(account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    return acc


@router.put("/accounts/sync")
def sync_accounts(payload: AccountSyncBody):
    data = payload.model_dump(exclude_unset=True)
    property_id = str(data.get("propertyId", "")).strip()
    incoming = data.get("accounts", [])
    if not property_id:
        return {"message": "propertyId required", "saved": 0, "propertyId": property_id}
    if not isinstance(incoming, list):
        incoming = []
    saved = 0
    incoming_ids = set()
    for item in incoming:
        if isinstance(item, dict):
            aid = str(item.get("id") or "").strip()
            if aid:
                incoming_ids.add(aid)
            upsert_account(item)
            saved += 1
    # allowClear: remove accounts for this property that are not in the incoming set
    if data.get("allowClear") is True:
        existing = list_accounts(property_id)
        for acc in existing:
            eid = str(acc.get("id") or "").strip()
            if eid and eid not in incoming_ids:
                delete_account(eid)
    return {"message": "synced", "saved": saved, "propertyId": property_id}


@router.delete("/accounts/{account_id}")
def delete_account_endpoint(account_id: str):
    delete_account(account_id)
    return {"message": "Deleted successfully"}


@router.get("/accounts/{account_id}/delete-impact")
def account_delete_impact(account_id: str):
    # FK-cascaded delete: account_contacts, account_activities removed with it.
    return {"accountId": str(account_id), "linkedRequests": 0, "contacts": 0, "activities": 0}


@router.post("/accounts/scan-extract")
async def scan_extract_business_card(
    file: UploadFile = File(...),
    propertyId: Optional[str] = Form(default=None),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _SCAN_IMAGE_EXT:
        raise HTTPException(status_code=400, detail="Unsupported image type")
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in _SCAN_IMAGE_CT:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    content = await file.read(SCAN_MAX_BYTES + 1)
    if len(content) > SCAN_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large")

    parsed = parse_business_card_image(content, file_name=str(file.filename or ""))
    if propertyId and isinstance(parsed, dict):
        parsed["propertyId"] = str(propertyId)
    return parsed
