from fastapi import APIRouter
from typing import Optional

from data_access import delete_flat, list_flat, upsert_flat

router = APIRouter(prefix="/api/rate-plans")


@router.get("")
def get_rate_plans(propertyId: Optional[str] = None):
    return list_flat("rate_plans", propertyId)


@router.post("")
def save_rate_plan(data: dict):
    return upsert_flat("rate_plans", data, id_prefix="RP")


@router.delete("/{id}")
def delete_rate_plan(id: str, propertyId: Optional[str] = None):
    delete_flat("rate_plans", id, propertyId)
    return {"message": "Deleted successfully"}
