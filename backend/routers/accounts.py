from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from typing import Optional

from services.business_card_scan import parse_business_card_image
from data_access import delete_account, get_account, list_accounts, upsert_account

router = APIRouter(prefix="/api", tags=["Accounts"])


@router.get("/accounts")
def list_accounts_endpoint(propertyId: Optional[str] = None):
    return list_accounts(propertyId)


@router.post("/accounts")
def upsert_account_endpoint(data: dict):
    return upsert_account(data)


@router.get("/accounts/{account_id}")
def get_account_endpoint(account_id: str):
    acc = get_account(account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    return acc


@router.put("/accounts/sync")
def sync_accounts(payload: dict):
    property_id = str(payload.get("propertyId", "")).strip()
    incoming = payload.get("accounts", [])
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
    if payload.get("allowClear") is True:
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
    content = await file.read()
    parsed = parse_business_card_image(content, file_name=str(file.filename or ""))
    if propertyId and isinstance(parsed, dict):
        parsed["propertyId"] = str(propertyId)
    return parsed
