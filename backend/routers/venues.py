from fastapi import APIRouter
from typing import Optional

from data_access import delete_flat, list_flat, upsert_flat
from sort_order import sort_by_sort_order
import uuid

router = APIRouter(prefix="/api/venues")


@router.get("")
def get_venues(propertyId: Optional[str] = None):
    return sort_by_sort_order(list_flat("venues", propertyId))


@router.post("")
def save_venue(data: dict):
    item = {**(data if isinstance(data, dict) else {})}
    if "id" not in item:
        item["id"] = "V" + str(uuid.uuid4())[:6]
    return upsert_flat("venues", item, id_prefix="V")


@router.delete("/{id}")
def delete_venue(id: str, propertyId: Optional[str] = None):
    delete_flat("venues", id, propertyId)
    return {"message": "Deleted successfully"}
