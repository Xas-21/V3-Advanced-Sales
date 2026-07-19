import sys
import os
print("Advanced Sales Backend: LOADING MAIN APP...")
from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from cors_middleware import ProductionCORSMiddleware, build_cors_settings
from dependencies import set_current_user, require_user, require_admin
from auth_db import resolve_session

# Ensure the backend directory is in the path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)
load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)

from routers import auth, users, properties, rooms, venues, taxes, financials, reqs, crm_state, contact, accounts, tasks, uploads, contracts, cxl_reasons, promotions, account_rates, feed, chat, presence
from routers import ws
from utils import close_database, get_database_url, init_database, storage_mode, check_database_health


def _database_host() -> str | None:
    url = get_database_url()
    if not url or "@" not in url:
        return None
    return url.split("@", 1)[1].split("/", 1)[0]


app = FastAPI(title="Advanced Sales Backend", version="2.0.0", redirect_slashes=False)


@app.middleware("http")
async def auth_context_and_security_headers(request: Request, call_next):
    # Resolve session (best-effort; public routes work without one). Sets the
    # request-scoped user so data layers can enforce tenant isolation.
    token = request.cookies.get("as_session")
    try:
        user = resolve_session(token)
    except Exception:
        user = None
    set_current_user(user)
    try:
        response = await call_next(request)
    finally:
        set_current_user(None)
    # Harden responses
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; connect-src 'self'",
    )
    return response


_cors_origins, _cors_regex = build_cors_settings()
app.add_middleware(
    ProductionCORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler — sanitize 500 errors, log internal details
import logging
@app.exception_handler(PermissionError)
async def permission_error_handler(request: Request, exc: PermissionError):
    # Tenant/authorization violations raised by the data layer -> 403 (not 500).
    return JSONResponse(status_code=403, content={"detail": str(exc) or "Access denied."})

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Please try again or contact support."},
    )

# Include Routers  
# Auth router has no auth requirement (it handles login)
app.include_router(auth.router)

# User management + feed require auth (already have their own dependencies)
app.include_router(users.router)
app.include_router(feed.router)
app.include_router(chat.router)
app.include_router(presence.router)

# Data routers — require authentication for ALL endpoints
_auth_required = [Depends(require_user)]
app.include_router(properties.router, dependencies=_auth_required)
app.include_router(rooms.router, dependencies=_auth_required)
app.include_router(venues.router, dependencies=_auth_required)
app.include_router(taxes.router, dependencies=_auth_required)
app.include_router(financials.router, dependencies=_auth_required)
app.include_router(reqs.router, dependencies=_auth_required)
app.include_router(crm_state.router, dependencies=_auth_required)
app.include_router(accounts.router, dependencies=_auth_required)
app.include_router(tasks.router, dependencies=_auth_required)
app.include_router(contracts.router, dependencies=_auth_required)
app.include_router(cxl_reasons.router, dependencies=_auth_required)
app.include_router(promotions.router, dependencies=_auth_required)
app.include_router(account_rates.router, dependencies=_auth_required)

# Contact form stays public (marketing/subscribe). Uploads require auth so
# anonymous callers cannot write to the shared uploads volume.
app.include_router(contact.router)
app.include_router(uploads.router, dependencies=_auth_required)

# WebSocket endpoint for real-time live updates.
# Registered directly on the app (not via include_router): in this FastAPI
# build included routers are wrapped as _IncludedRouter mounts that do not match
# websocket handshakes, so the /ws upgrade would 404. add_api_websocket_route
# places the route at the top level where it is matched reliably.
app.add_api_websocket_route("/ws", ws.websocket_endpoint)


@app.on_event("startup")
def on_startup():
    if storage_mode() == "postgres":
        init_database()


@app.on_event("shutdown")
def on_shutdown():
    close_database()

@app.get("/api/health")
def health():
    # Ops probe: always 200 when ready; 503 when Postgres is required and down
    # (Compose urlopen already fails on non-2xx — no healthcheck change needed).
    mode = storage_mode()
    version = os.getenv("APP_VERSION") or app.version
    if mode == "postgres":
        db_ok = check_database_health()
        ready = db_ok
        status = "ok" if db_ok else "degraded"
    else:
        db_ok = None
        ready = False
        status = "error"
    body = {
        "status": status,
        "live": True,
        "ready": ready,
        "database_connected": db_ok,
        "storage_mode": mode,
        "version": version,
    }
    return JSONResponse(content=body, status_code=200 if ready else 503)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Advanced Sales Backend API"}

if __name__ == "__main__":
    import uvicorn
    # Need to use the string reference to handle reloads correctly
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
