from fastapi import APIRouter
from typing import Optional

from data_access import delete_flat, list_flat, upsert_flat

router = APIRouter(prefix="/api/financials")


@router.get("")
def get_financials(propertyId: Optional[str] = None):
    return list_flat("financials", propertyId)


@router.post("")
def save_financials(data: dict):
    return upsert_flat("financials", data, id_prefix="F")


@router.delete("/{id}")
def delete_financials(id: str, propertyId: Optional[str] = None):
    delete_flat("financials", id, propertyId)
    return {"message": "Deleted successfully"}
