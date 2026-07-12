from fastapi import APIRouter, HTTPException
from typing import Optional

from data_access import delete_flat, list_flat, upsert_flat

router = APIRouter(prefix="/api", tags=["Properties"])


@router.get("/properties")
def list_properties(propertyId: Optional[str] = None):
    return list_flat("properties", propertyId)


@router.post("/properties")
def create_property(data: dict):
    return upsert_flat("properties", data, id_prefix="P")


@router.delete("/properties/{prop_id}")
def remove_property(prop_id: str, propertyId: Optional[str] = None):
    delete_flat("properties", prop_id, propertyId)
    return {"message": "Deleted successfully"}
