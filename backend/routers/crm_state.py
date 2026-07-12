from fastapi import APIRouter, HTTPException
from typing import Optional

from crm_recovery import crm_item_count, merge_recovery_block
from data_access import get_crm_state as dal_get_crm_state, list_accounts, list_requests, upsert_crm_state

router = APIRouter(prefix="/api", tags=["CRM"])

DEFAULT_BUCKETS = {
    "new": [],
    "waiting": [],
    "qualified": [],
    "proposal": [],
    "negotiation": [],
    "won": [],
    "notInterested": [],
}

PIPELINE_KEYS = ["waiting", "qualified", "proposal", "negotiation", "won", "notInterested"]


def _normalize_leads(raw):
    if not isinstance(raw, dict):
        return {**DEFAULT_BUCKETS}
    out = {**DEFAULT_BUCKETS}
    for k, v in raw.items():
        if k in out and isinstance(v, list):
            out[k] = v
    return out


def _default_pipeline():
    return {k: [] for k in PIPELINE_KEYS}


def _normalize_pipeline(raw):
    out = _default_pipeline()
    if not isinstance(raw, dict):
        return out
    for k in PIPELINE_KEYS:
        v = raw.get(k)
        if isinstance(v, list):
            out[k] = v
    return out


def _migrate_block(block):
    sales_calls = block.get("salesCalls") if isinstance(block.get("salesCalls"), list) else []
    pipeline = _normalize_pipeline(block.get("pipeline")) if isinstance(block.get("pipeline"), dict) else _default_pipeline()
    legacy = block.get("leads")
    if isinstance(legacy, dict):
        normalized = _normalize_leads(legacy)
        if not sales_calls and isinstance(normalized.get("new"), list):
            sales_calls = normalized["new"]
        for k in PIPELINE_KEYS:
            if not pipeline.get(k) and isinstance(normalized.get(k), list):
                pipeline[k] = normalized[k]
    return {
        "salesCalls": sales_calls,
        "pipeline": pipeline,
        "accountActivities": block.get("accountActivities")
        if isinstance(block.get("accountActivities"), dict)
        else {},
    }


@router.get("/crm-state")
def get_crm_state(propertyId: Optional[str] = None):
    key = propertyId or "global"
    block = dal_get_crm_state(key) or {}
    migrated = _migrate_block(block)
    return {
        "propertyId": key,
        "salesCalls": migrated["salesCalls"],
        "pipeline": migrated["pipeline"],
        "accountActivities": migrated["accountActivities"],
        "leads": {"new": migrated["salesCalls"], **migrated["pipeline"]},
    }


@router.post("/crm-state")
def save_crm_state(data: dict):
    key = data.get("propertyId") or "global"
    prev = dal_get_crm_state(key) or {}

    sales_calls = data.get("salesCalls")
    if not isinstance(sales_calls, list):
        sales_calls = prev.get("salesCalls") if isinstance(prev.get("salesCalls"), list) else []
        if not sales_calls and "leads" in data:
            legacy = _normalize_leads(data.get("leads"))
            sales_calls = legacy.get("new") or []
        elif not sales_calls and isinstance(prev.get("leads"), dict):
            legacy = _normalize_leads(prev.get("leads"))
            sales_calls = legacy.get("new") or []

    pipeline = data.get("pipeline")
    if not isinstance(pipeline, dict):
        pipeline = prev.get("pipeline") if isinstance(prev.get("pipeline"), dict) else _default_pipeline()
        if "leads" in data:
            legacy = _normalize_leads(data.get("leads"))
            for k in PIPELINE_KEYS:
                if k in legacy:
                    pipeline[k] = legacy[k]
    pipeline = _normalize_pipeline(pipeline)
    activities = data.get("accountActivities", prev.get("accountActivities") or {})
    if not isinstance(activities, dict):
        activities = {}

    incoming_block = {
        "salesCalls": sales_calls,
        "pipeline": pipeline,
        "accountActivities": activities,
    }
    if crm_item_count(prev) > 0 and crm_item_count(incoming_block) == 0:
        raise HTTPException(
            status_code=409,
            detail="Refusing to save empty CRM state over existing data. Use POST /api/crm-state/recover if you need to rebuild.",
        )

    upsert_crm_state(key, incoming_block)
    migrated = _migrate_block(incoming_block)
    return {
        "propertyId": key,
        "salesCalls": migrated["salesCalls"],
        "pipeline": migrated["pipeline"],
        "accountActivities": migrated["accountActivities"],
    }


@router.post("/crm-state/recover")
def recover_crm_state(propertyId: Optional[str] = None):
    key = str(propertyId or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="propertyId required")
    current = dal_get_crm_state(key) or {}
    requests = list_requests(key)
    accounts = list_accounts(key)
    recovered = merge_recovery_block(current, requests, accounts, key, None)
    upsert_crm_state(key, recovered)
    migrated = _migrate_block(recovered)
    pipe_total = sum(len(migrated["pipeline"].get(k) or []) for k in PIPELINE_KEYS)
    return {
        "propertyId": key,
        "recovered": True,
        "salesCallsCount": len(migrated["salesCalls"]),
        "pipelineCardsCount": pipe_total,
        "salesCalls": migrated["salesCalls"],
        "pipeline": migrated["pipeline"],
        "accountActivities": migrated["accountActivities"],
        "leads": {"new": migrated["salesCalls"], **migrated["pipeline"]},
    }
