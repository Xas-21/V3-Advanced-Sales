from fastapi import APIRouter
from typing import Optional

from data_access import delete_flat, list_flat, upsert_flat
import uuid

router = APIRouter(prefix="/api/taxes")


@router.get("")
def get_taxes(propertyId: Optional[str] = None):
    return list_flat("taxes", propertyId)


@router.post("")
def save_tax(data: dict):
    item = {**(data if isinstance(data, dict) else {})}
    if "id" not in item:
        item["id"] = "T" + str(uuid.uuid4())[:6]
    return upsert_flat("taxes", item, id_prefix="T")


@router.delete("/{id}")
def delete_tax(id: str, propertyId: Optional[str] = None):
    delete_flat("taxes", id, propertyId)
    return {"message": "Deleted successfully"}
