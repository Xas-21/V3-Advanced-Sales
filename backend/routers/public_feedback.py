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
    # RequestFeedbackPublicPage posts JSON.stringify({ answers })
    answers = payload.get("answers") if isinstance(payload, dict) else None
    if not isinstance(answers, dict):
        raise HTTPException(status_code=400, detail="answers object required")
    try:
        return submit_public_feedback(token, answers)
    except PermissionError as e:
        raise HTTPException(status_code=404, detail=str(e) or "Feedback link not found.")
