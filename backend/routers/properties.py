from typing import Optional

from fastapi import APIRouter, Cookie

from data_access import delete_flat, list_flat, upsert_flat
from dependencies import require_admin
from security import SESSION_COOKIE_NAME

router = APIRouter(prefix="/api", tags=["Properties"])


@router.get("/properties")
def list_properties(propertyId: Optional[str] = None):
    return list_flat("properties", propertyId)


@router.post("/properties")
def create_property(
    data: dict,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    require_admin(session_id)
    return upsert_flat("properties", data, id_prefix="P")


@router.delete("/properties/{prop_id}")
def remove_property(
    prop_id: str,
    propertyId: Optional[str] = None,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    require_admin(session_id)
    delete_flat("properties", prop_id, propertyId)
    return {"message": "Deleted successfully"}
