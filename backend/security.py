"""AS security core: password hashing, policy, signed server-side sessions.

No third-party JWT libs required — sessions are signed with HMAC-SHA256 using
SESSION_SECRET (env). The opaque token is stored server-side in the `sessions`
table so we can revoke/invalidate (e.g. on password change via sessionVersion).
"""
from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Optional, Tuple

import bcrypt

SESSION_COOKIE_NAME = "as_session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days
BCRYPT_ROUNDS = 12


def get_session_secret() -> str:
    secret = os.getenv("SESSION_SECRET", "").strip()
    if not secret:
        # Fail loud rather than run with a guessable secret.
        raise RuntimeError("SESSION_SECRET environment variable is not configured.")
    return secret


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #
def hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(pwd: str, hashed: str) -> bool:
    if not pwd or not hashed:
        return False
    try:
        return bcrypt.checkpw(pwd.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        # Not a bcrypt hash (legacy plaintext fallback is intentionally dropped).
        return False


def check_password_policy(pwd: str) -> Tuple[bool, str]:
    """Minimum bar for a production multi-tenant system."""
    if not pwd or len(pwd) < 10:
        return False, "Password must be at least 10 characters."
    lower = any(c.islower() for c in pwd)
    upper = any(c.isupper() for c in pwd)
    digit = any(c.isdigit() for c in pwd)
    symbol = any(not c.isalnum() for c in pwd)
    categories = sum([lower, upper, digit, symbol])
    if categories < 3:
        return False, "Use at least 3 of: lowercase, uppercase, digit, symbol."
    return True, ""


# --------------------------------------------------------------------------- #
# Signed session tokens  (format: user_id.version.issued_at.random)
# --------------------------------------------------------------------------- #
def _sign(token: str) -> str:
    mac = hmac.new(get_session_secret().encode(), token.encode(), hashlib.sha256).hexdigest()
    return f"{token}.{mac}"


def _verify_signature(signed: str) -> Optional[str]:
    if not signed or signed.count(".") < 2:
        return None
    *parts, mac = signed.rsplit(".", 1)
    token = ".".join(parts)
    expected = hmac.new(get_session_secret().encode(), token.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, mac):
        return None
    return token


def create_session_token(user_id: str, session_version: int) -> str:
    issued = int(time.time())
    rand = os.urandom(8).hex()
    token = f"{user_id}.{session_version}.{issued}.{rand}"
    return _sign(token)


def parse_session_token(signed: str) -> Optional[Tuple[str, int, int]]:
    """Returns (user_id, session_version, issued_at) or None if invalid signature."""
    token = _verify_signature(signed)
    if not token:
        return None
    try:
        uid, ver, issued, _rand = token.split(".")
        return uid, int(ver), int(issued)
    except (ValueError, TypeError):
        return None


def is_expired(issued_at: int, ttl: int = SESSION_TTL_SECONDS) -> bool:
    return (int(time.time()) - issued_at) > ttl
