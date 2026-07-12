from typing import Optional

from fastapi import APIRouter

from data_access import delete_flat, list_flat, upsert_payload_only

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
def upsert_contract_template(data: dict):
    if not str(data.get("id") or "").strip():
        return data  # preserve legacy behaviour: ignore items without id
    return upsert_payload_only("contract_templates", data, id_prefix="CT")


@router.delete("/templates/{template_id}")
def delete_contract_template(template_id: str):
    delete_flat("contract_templates", template_id)
    return {"message": "Deleted successfully"}
