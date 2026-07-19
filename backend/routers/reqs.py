from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from data_access import delete_request, list_requests as dal_list_requests, upsert_request
from utils import RequestIdCollisionError

router = APIRouter(prefix="/api", tags=["Requests"])


class RequestCreateBody(BaseModel):
    """Minimal identity + list/bool fields; extras kept for payload jsonb."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: Optional[str] = None
    propertyId: Optional[str] = None
    accountId: Optional[str] = None
    rooms: Optional[list[Any]] = None
    venues: Optional[list[Any]] = None
    logs: Optional[list[Any]] = None
    meals: Optional[list[Any]] = None
    beverages: Optional[list[Any]] = None
    resources: Optional[list[Any]] = None
    update_flag: Optional[bool] = Field(default=None, alias="_update")


@router.get("/requests")
def list_requests(propertyId: Optional[str] = None):
    return dal_list_requests(propertyId)


@router.post("/requests")
def create_request(data: RequestCreateBody):
    payload = data.model_dump(exclude_unset=True, by_alias=True)
    try:
        return upsert_request(payload)
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
