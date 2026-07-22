from typing import Optional

from fastapi import APIRouter, Cookie

from data_access import _broadcast_change, delete_flat, list_flat, upsert_payload_only
from dependencies import require_admin
from security import SESSION_COOKIE_NAME

router = APIRouter(prefix="/api/contracts", tags=["Contracts"])


@router.get("/templates")
def list_contract_templates(propertyId: Optional[str] = None):
    templates = list_flat("contract_templates", propertyId)
    if not propertyId:
        return templates
    pid = str(propertyId)
    return [
        t
        for t in templates
        if not t.get("propertyId") or str(t.get("propertyId")) == pid
    ]


@router.post("/templates")
def upsert_contract_template(
    data: dict,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    require_admin(session_id)
    if not str(data.get("id") or "").strip():
        return data  # preserve legacy behaviour: ignore items without id
    item = upsert_payload_only("contract_templates", data, id_prefix="CT")
    pid = str(item.get("propertyId") or "").strip() or None
    _broadcast_change(
        "updated",
        "contracts",
        {"id": item.get("id"), "propertyId": pid},
        pid,
    )
    return item


@router.delete("/templates/{template_id}")
def delete_contract_template(
    template_id: str,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    require_admin(session_id)
    delete_flat("contract_templates", template_id)
    _broadcast_change("deleted", "contracts", {"id": template_id}, None)
    return {"message": "Deleted successfully"}
