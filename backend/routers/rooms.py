from fastapi import APIRouter
from typing import Optional

from data_access import delete_flat, list_flat, upsert_flat
import uuid

router = APIRouter(prefix="/api/rooms")


@router.get("")
def get_rooms(propertyId: Optional[str] = None):
    return list_flat("rooms", propertyId)


@router.post("")
def save_room(data: dict):
    item = {**(data if isinstance(data, dict) else {})}
    if "id" not in item:
        item["id"] = "R" + str(uuid.uuid4())[:6]
    return upsert_flat("rooms", item, id_prefix="R")


@router.delete("/{id}")
def delete_room(id: str, propertyId: Optional[str] = None):
    delete_flat("rooms", id, propertyId)
    return {"message": "Deleted successfully"}
