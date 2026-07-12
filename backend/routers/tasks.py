from fastapi import APIRouter
from typing import Optional

from data_access import delete_flat, list_flat, upsert_flat

router = APIRouter(prefix="/api/tasks")


@router.get("")
def get_tasks(propertyId: Optional[str] = None):
    return list_flat("tasks", propertyId)


@router.post("")
def save_task(data: dict):
    return upsert_flat("tasks", data, id_prefix="TK")


@router.put("/sync")
def sync_tasks(payload: dict):
    property_id = str(payload.get("propertyId", "")).strip()
    incoming = payload.get("tasks", [])
    if not property_id:
        return {"message": "propertyId required", "saved": 0}
    if not isinstance(incoming, list):
        incoming = []
    saved = 0
    for item in incoming:
        if isinstance(item, dict):
            upsert_flat("tasks", item, id_prefix="TK")
            saved += 1
    return {"message": "synced", "saved": saved}


@router.delete("/{id}")
def delete_task(id: str, propertyId: Optional[str] = None):
    delete_flat("tasks", id, propertyId)
    return {"message": "Deleted successfully"}
