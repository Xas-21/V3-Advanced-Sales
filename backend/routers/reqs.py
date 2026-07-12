from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from typing import Optional

from data_access import delete_request, get_request, list_requests as dal_list_requests, upsert_request
from utils import RequestIdCollisionError

router = APIRouter(prefix="/api", tags=["Requests"])


@router.get("/requests")
def list_requests(propertyId: Optional[str] = None):
    return dal_list_requests(propertyId)


@router.post("/requests")
def create_request(data: dict):
    try:
        return upsert_request(data)
    except RequestIdCollisionError as exc:
        existing = exc.existing or {}
        existing_name = str(existing.get("requestName") or existing.get("confirmationNo") or "").strip()
        detail = (
            f"Request id {exc.req_id} already exists"
            + (f" ({existing_name})" if existing_name else "")
            + ". Save again to get a new id, or load the existing request to update it."
        )
        raise HTTPException(status_code=409, detail=detail) from exc


@router.delete("/requests/{req_id}")
def remove_request(req_id: str):
    delete_request(req_id)
    return {"message": "Deleted successfully"}
