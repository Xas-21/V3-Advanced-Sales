from fastapi import APIRouter
from typing import Optional

from data_access import delete_flat, list_flat, upsert_flat

router = APIRouter(prefix="/api/account-rates")


@router.get("")
def get_account_rates(propertyId: Optional[str] = None, accountId: Optional[str] = None):
    rows = list_flat("account_rates", propertyId)
    aid = str(accountId or "").strip()
    if not aid:
        return rows
    return [r for r in rows if str((r or {}).get("accountId") or "").strip() == aid]


@router.post("")
def save_account_rate(data: dict):
    return upsert_flat("account_rates", data, id_prefix="AR")


@router.delete("/{id}")
def delete_account_rate(id: str, propertyId: Optional[str] = None):
    delete_flat("account_rates", id, propertyId)
    return {"message": "Deleted successfully"}
