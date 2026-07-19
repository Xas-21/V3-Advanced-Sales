"""Session resolve-once + last_seen throttle (plan 002)."""
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from dependencies import require_user, set_current_user


def test_require_user_prefers_middleware_context():
    fake = {"id": "u-ctx", "username": "ctx", "role": "Admin"}
    set_current_user(fake)
    try:
        with patch("dependencies.resolve_session") as mock_resolve:
            user = require_user(session_id="cookie-should-be-ignored")
            assert user is fake
            mock_resolve.assert_not_called()
    finally:
        set_current_user(None)


def test_require_user_falls_back_to_resolve_when_no_context():
    set_current_user(None)
    fake = {"id": "u-fb", "username": "fb", "role": "Admin"}
    with patch("dependencies.resolve_session", return_value=fake) as mock_resolve:
        user = require_user(session_id="tok-abc")
        assert user is fake
        mock_resolve.assert_called_once_with("tok-abc")


def test_require_user_401_when_unauthenticated():
    set_current_user(None)
    with patch("dependencies.resolve_session", return_value=None):
        with pytest.raises(HTTPException) as exc:
            require_user(session_id=None)
        assert exc.value.status_code == 401
