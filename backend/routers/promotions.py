from fastapi import APIRouter
from typing import Optional

from data_access import delete_flat, list_flat, upsert_flat

router = APIRouter(prefix="/api/promotions")


@router.get("")
def get_promotions(propertyId: Optional[str] = None):
    return list_flat("promotions", propertyId)


@router.post("")
def save_promotion(data: dict):
    return upsert_flat("promotions", data, id_prefix="PR")


@router.delete("/{id}")
def delete_promotion(id: str, propertyId: Optional[str] = None):
    delete_flat("promotions", id, propertyId)
    return {"message": "Deleted successfully"}
