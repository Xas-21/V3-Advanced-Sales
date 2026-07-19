import os
import smtplib
from email.mime.text import MIMEText

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/contact", tags=["contact"])

DEFAULT_NOTIFY_EMAIL = ""


class SubscribePayload(BaseModel):
    name: str
    email: str = Field(..., min_length=3, max_length=320)
    hotel: str
    role: str = ""
    phone: str = ""
    message: str = ""


@router.post("/subscribe")
def subscribe(payload: SubscribePayload):
    """
    Sends subscription inquiry email when SMTP_* env vars are set.
    Otherwise returns sent=false so the frontend can open mailto as fallback.
    """
    to_addr = os.getenv("CONTACT_TO_EMAIL", DEFAULT_NOTIFY_EMAIL).strip()
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_pass = os.getenv("SMTP_PASS", "").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587"))

    body_text = "\n".join(
        [
            "New Advanced Sales subscription request",
            "",
            f"Name: {payload.name}",
            f"Email: {payload.email}",
            f"Hotel: {payload.hotel}",
            f"Role/Department: {payload.role or '-'}",
            f"Phone: {payload.phone or '-'}",
            "",
            "Message:",
            payload.message or "-",
        ]
    )

    # CONTACT_TO_EMAIL required; empty default keeps mailto fallback (sent=false).
    if not to_addr or not smtp_host or not smtp_user or not smtp_pass:
        return {"sent": False, "reason": "smtp_not_configured"}

    subject = f"Advanced Sales Subscription — {payload.hotel}"
    msg = MIMEText(body_text, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_addr
    msg["Reply-To"] = str(payload.email)

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [to_addr], msg.as_string())
    except Exception as e:
        return {"sent": False, "reason": "smtp_error", "detail": str(e)}

    return {"sent": True}
