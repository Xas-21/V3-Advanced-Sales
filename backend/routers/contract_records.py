"""Server-side contract records (plan 062). Templates stay on routers.contracts."""
from typing import Optional

from fastapi import APIRouter, HTTPException

from data_access import _broadcast_change, delete_contract, list_contracts, upsert_contract

router = APIRouter(prefix="/api/contracts", tags=["ContractRecords"])


@router.get("")
def list_contracts_endpoint(
    propertyId: Optional[str] = None,
    status: Optional[str] = None,
):
    try:
        return list_contracts(propertyId, status=status)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e) or "Access denied")


@router.post("")
def upsert_contract_endpoint(data: dict):
    try:
        out = upsert_contract(data if isinstance(data, dict) else {})
        # Helpers also broadcast entity "contract"; emit "contracts" for live clients.
        pid = str((out or {}).get("propertyId") or "").strip() or None
        _broadcast_change(
            "updated",
            "contracts",
            {"id": (out or {}).get("id"), "propertyId": pid},
            pid,
        )
        return out
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e) or "Access denied")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.delete("/{contract_id}")
def delete_contract_endpoint(contract_id: str):
    try:
        delete_contract(contract_id)
        _broadcast_change("deleted", "contracts", {"id": contract_id}, None)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e) or "Access denied")
    return {"message": "Deleted successfully"}
