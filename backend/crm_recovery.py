"""Rebuild CRM pipeline (and partial salesCalls) from requests + legacy snapshots."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

PIPELINE_KEYS = ["waiting", "qualified", "proposal", "negotiation", "won", "notInterested"]

# Canonical request-status → account pipeline stage map.
# Keep in parity with crmStateModel.ts STAGE_FROM_REQUEST (plan 060).
STAGE_FROM_REQUEST = {
    "inquiry": "waiting",
    "draft": "waiting",
    "accepted": "proposal",
    "tentative": "negotiation",
    "definite": "won",
    "actual": "won",
    "cancelled": "notInterested",
    "lost": "notInterested",
}

STAGE_RANK = {
    "notInterested": 0,
    "waiting": 1,
    "qualified": 2,
    "proposal": 3,
    "negotiation": 4,
    "won": 5,
}


def _ymd_slice(raw: Any) -> str:
    s = str(raw or "").strip()
    return s[:10] if len(s) >= 10 and s[4] == "-" else ""


def period_month_from_request(req: dict) -> str:
    ci = _ymd_slice(req.get("checkIn") or req.get("eventStart"))
    if ci:
        return ci[:7]
    agenda = req.get("agenda") or []
    if isinstance(agenda, list):
        for row in agenda:
            if isinstance(row, dict):
                sd = _ymd_slice(row.get("startDate"))
                if sd:
                    return sd[:7]
    rd = _ymd_slice(req.get("receivedDate") or req.get("requestDate"))
    if rd:
        return rd[:7]
    return ""


def stage_from_request_status(status: Any) -> str:
    s = str(status or "").lower().strip()
    return STAGE_FROM_REQUEST.get(s, "qualified")


def _request_revenue(req: dict) -> float:
    for key in ("grandTotalNoTax", "totalCostNoTax", "totalCost", "grandTotal", "totalAmount"):
        try:
            v = float(str(req.get(key) or "0").replace(",", ""))
            if v > 0:
                return v
        except (TypeError, ValueError):
            pass
    return 0.0


def rebuild_pipeline_from_requests(
    requests: list[dict],
    accounts_by_id: dict[str, dict],
    property_id: str,
) -> dict[str, list]:
    """One monthly pipeline card per account + period from operational request dates."""
    pipeline = {k: [] for k in PIPELINE_KEYS}
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)

    for req in requests:
        if not isinstance(req, dict):
            continue
        aid = str(req.get("accountId") or "").strip()
        if not aid:
            continue
        pm = period_month_from_request(req)
        if not pm:
            continue
        groups[(aid, pm)].append(req)

    for (aid, pm), reqs in groups.items():
        acc = accounts_by_id.get(aid) or {}
        best_stage = "qualified"
        best_rank = -1
        best_req: dict | None = None
        total_rev = 0.0
        for req in reqs:
            st = stage_from_request_status(req.get("status"))
            rank = STAGE_RANK.get(st, 2)
            rev = _request_revenue(req)
            total_rev += rev
            if rank >= best_rank:
                best_rank = rank
                best_stage = st
                best_req = req

        if not best_req:
            continue

        card_id = f"REC_{aid}_{pm.replace('-', '')}"
        company = str(
            best_req.get("account")
            or best_req.get("accountName")
            or acc.get("name")
            or "Account"
        ).strip()
        card = {
            "id": card_id,
            "accountId": aid,
            "periodMonth": pm,
            "company": company,
            "contact": str(best_req.get("bookerName") or acc.get("primaryContact") or "").strip(),
            "propertyId": property_id,
            "sourceCallIds": [],
            "linkedRequestId": str(best_req.get("id") or ""),
            "linkedRequestType": str(best_req.get("requestType") or ""),
            "linkedRequestRevenue": total_rev,
            "value": total_rev,
            "probability": 80 if best_stage == "won" else 50,
            "lastContact": _ymd_slice(best_req.get("checkIn") or best_req.get("receivedDate"))
            or pm + "-01",
            "enteredFunnelAt": _ymd_slice(best_req.get("receivedDate") or best_req.get("checkIn"))
            or pm + "-01",
            "stage": best_stage,
            "recoveredFromRequests": True,
        }
        pipeline[best_stage] = [card, *(pipeline.get(best_stage) or [])]

    return pipeline


def account_activities_to_sales_calls(
    account_activities: dict,
    accounts_by_id: dict[str, dict],
    property_id: str,
) -> list[dict]:
    """Convert legacy crm accountActivities map entries to salesCalls rows."""
    out: list[dict] = []
    if not isinstance(account_activities, dict):
        return out
    for aid, rows in account_activities.items():
        if not isinstance(rows, list):
            continue
        acc = accounts_by_id.get(str(aid)) or {}
        for i, entry in enumerate(rows):
            if not isinstance(entry, dict):
                continue
            typ = str(entry.get("type") or "").lower()
            if typ not in ("sales_call", "salescall", "call"):
                continue
            date = _ymd_slice(entry.get("date")) or _ymd_slice(entry.get("createdAt"))
            out.append(
                {
                    "id": str(entry.get("id") or f"REC_CALL_{aid}_{i}"),
                    "propertyId": property_id,
                    "accountId": str(aid),
                    "company": str(acc.get("name") or aid),
                    "subject": str(entry.get("subject") or entry.get("notes") or "Sales call")[:120],
                    "description": str(entry.get("notes") or ""),
                    "date": date or "",
                    "dueDate": date or "",
                    "lastContact": date or "",
                    "ownerUserId": entry.get("userId") or acc.get("ownerUserId"),
                    "accountManager": entry.get("user") or "",
                    "activityCompleted": True,
                    "followUpRequired": False,
                    "followUpDate": "",
                    "recoveredFromAccountActivities": True,
                }
            )
    return out


def merge_recovery_block(
    current: dict,
    requests: list[dict],
    accounts: list[dict],
    property_id: str,
    legacy_blob_block: dict | None = None,
) -> dict:
    accounts_by_id = {str(a.get("id")): a for a in accounts if isinstance(a, dict) and a.get("id")}

    sales_calls: list = []
    if isinstance(current.get("salesCalls"), list) and current["salesCalls"]:
        sales_calls = list(current["salesCalls"])
    else:
        legacy_aa = {}
        if isinstance(legacy_blob_block, dict):
            legacy_aa = legacy_blob_block.get("accountActivities") or {}
        if not legacy_aa and isinstance(current.get("accountActivities"), dict):
            legacy_aa = current["accountActivities"]
        sales_calls = account_activities_to_sales_calls(legacy_aa, accounts_by_id, property_id)
        if not sales_calls and isinstance(legacy_blob_block, dict):
            leads = legacy_blob_block.get("leads") if isinstance(legacy_blob_block.get("leads"), dict) else {}
            ln = leads.get("new") if isinstance(leads.get("new"), list) else []
            for lead in ln:
                if isinstance(lead, dict):
                    sales_calls.append({**lead, "dueDate": lead.get("nextActionDate") or lead.get("date") or ""})

    pipeline = {k: [] for k in PIPELINE_KEYS}
    has_pipeline = False
    if isinstance(current.get("pipeline"), dict):
        for k in PIPELINE_KEYS:
            arr = current["pipeline"].get(k)
            if isinstance(arr, list) and arr:
                pipeline[k] = list(arr)
                has_pipeline = True
    if not has_pipeline:
        pid = str(property_id)
        scoped_reqs = [
            r
            for r in requests
            if isinstance(r, dict)
            and str(r.get("propertyId") or "") in ("", pid, "P-GLOBAL")
        ]
        pipeline = rebuild_pipeline_from_requests(scoped_reqs, accounts_by_id, pid)

    activities = current.get("accountActivities") if isinstance(current.get("accountActivities"), dict) else {}
    if isinstance(legacy_blob_block, dict) and isinstance(legacy_blob_block.get("accountActivities"), dict):
        merged_aa = {**legacy_blob_block["accountActivities"], **activities}
        activities = merged_aa

    return {
        "salesCalls": sales_calls,
        "pipeline": pipeline,
        "accountActivities": activities,
    }


def crm_item_count(block: dict) -> int:
    if not isinstance(block, dict):
        return 0
    sc = len(block.get("salesCalls") or []) if isinstance(block.get("salesCalls"), list) else 0
    pipe = block.get("pipeline") if isinstance(block.get("pipeline"), dict) else {}
    pt = sum(len(pipe.get(k) or []) for k in PIPELINE_KEYS if isinstance(pipe.get(k), list))
    return sc + pt
