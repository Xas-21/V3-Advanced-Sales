from fastapi import APIRouter, HTTPException
from typing import Optional

from data_access import delete_flat, list_flat, save_ledger_entry, transfer_allocation

router = APIRouter(prefix="/api/account-ledger")


@router.get("")
def get_ledger(accountId: Optional[str] = None, propertyId: Optional[str] = None):
    rows = list_flat("account_ledger", propertyId)
    aid = str(accountId or "").strip()
    if not aid:
        return rows
    return [r for r in rows if str((r or {}).get("accountId") or "").strip() == aid]


@router.post("")
def save_ledger(data: dict):
    return save_ledger_entry(data)


@router.post("/{id}/transfer")
def transfer_ledger(id: str, body: dict):
    try:
        return transfer_allocation(id, str((body or {}).get("toRequestId") or ""))
    except KeyError:
        raise HTTPException(status_code=404, detail="Ledger entry not found")


@router.delete("/{id}")
def delete_ledger(id: str, propertyId: Optional[str] = None):
    delete_flat("account_ledger", id, propertyId)
    return {"message": "Deleted successfully"}
