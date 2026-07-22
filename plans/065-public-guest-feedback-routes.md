# Plan 065: Wire the public guest-feedback backend routes (fix 404)

> **Executor instructions**: Follow step by step; verify each step; obey STOP conditions.
> A reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7d43062..HEAD -- backend/main.py backend/data_access.py RequestFeedbackPublicPage.tsx`

## Status
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `7d43062`, 2026-07-22

## Why this matters
The public guest-feedback page calls `GET /api/requests/feedback/{token}` and
`POST /api/requests/feedback/{token}/submit`, but **no backend route implements them** — the
page 404s. The data-access helpers already exist and are unused; they just need routes. These
are intentionally **public** (no auth) — guests open a tokenized link.

## Current state (verified)
- `RequestFeedbackPublicPage.tsx:73` — `fetch(apiUrl('/api/requests/feedback/{token}'))`; `:188` — `POST .../submit`.
- `backend/data_access.py:614-708` — `get_public_feedback_by_token(token)` and `submit_public_feedback(token, answers)` exist, tenant-independent by design (do NOT call `_tenant_scope`).
- No route references `feedback` in `backend/routers/*` (grep returns nothing).
- Public router precedent: `backend/routers/contact.py` is included WITHOUT `_auth_required` (`main.py:216`).

## Scope
**In scope:** create `backend/routers/public_feedback.py`; register it in `backend/main.py` WITHOUT the `_auth_required` dependency; new test `backend/tests/test_public_feedback.py`.
**Out of scope:** auth-side feedback editing (that's inside the request wizard already); the frontend page (it already calls the right URLs).

## Steps

### Step 1: Public router
Create `backend/routers/public_feedback.py`:
```python
from fastapi import APIRouter, HTTPException
from data_access import get_public_feedback_by_token, submit_public_feedback

router = APIRouter(prefix="/api/requests/feedback", tags=["PublicFeedback"])

@router.get("/{token}")
def get_feedback(token: str):
    data = get_public_feedback_by_token(token)
    if not data:
        raise HTTPException(status_code=404, detail="Feedback link not found.")
    return data

@router.post("/{token}/submit")
def submit_feedback(token: str, payload: dict):
    answers = payload.get("answers") if isinstance(payload, dict) else None
    if not isinstance(answers, dict):
        raise HTTPException(status_code=400, detail="answers object required")
    try:
        return submit_public_feedback(token, answers)
    except PermissionError as e:
        raise HTTPException(status_code=404, detail=str(e) or "Feedback link not found.")
```
Confirm the exact submit body shape against `RequestFeedbackPublicPage.tsx:188` (adjust the `answers` key if the page posts a different envelope).

### Step 2: Register public (no auth) in `main.py`
Add `from routers import ... public_feedback` and `app.include_router(public_feedback.router)` in the PUBLIC section (near `contact.router`, `main.py:216`) — NOT under `_auth_required`.
**Verify**: `GET /api/requests/feedback/<bad>` → 404 (not 401), meaning it's reachable without a session.

### Step 3: Test
`backend/tests/test_public_feedback.py`: seed a request with a feedback `publicToken`, GET returns the form fields with no cookie, POST submit stores answers and re-GET reflects them; bad token → 404. Model after `backend/tests/test_api_full.py`.
**Verify**: `cd backend && python -m pytest tests/test_public_feedback.py -v` pass.

## Done criteria
- [ ] GET/POST feedback routes reachable WITHOUT auth; bad token → 404
- [ ] Submitting stores answers (verified by re-GET)
- [ ] `pytest` pass; only in-scope files changed

## STOP conditions
- The frontend posts a different body shape than `{answers: {...}}` — match the page, don't guess.
- `get_public_feedback_by_token` unexpectedly requires auth context (it must not).

## Maintenance notes
- Reviewer: confirm the route is truly public and returns only guest-safe fields (the helper already whitelists).
- Consider IP rate-limiting the submit in a later hardening pass (not required to unbreak the feature).
