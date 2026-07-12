import sys
import os
print("VisaTour Backend: LOADING MAIN APP...")
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

from routers import auth, users, properties, rooms, venues, taxes, financials, reqs, crm_state, contact, accounts, tasks, uploads, contracts, cxl_reasons, promotions, feed
from routers import ws
from utils import close_database, get_database_url, init_database, storage_mode, check_database_health


def _database_host() -> str | None:
    url = get_database_url()
    if not url or "@" not in url:
        return None
    return url.split("@", 1)[1].split("/", 1)[0]


app = FastAPI(title="VisaTour ERP Backend", version="2.0.0", redirect_slashes=False)


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

# Contact and uploads routers — keep unauthenticated for now (Abdullah will secure separately)
app.include_router(contact.router)
app.include_router(uploads.router)

# WebSocket endpoint for real-time live updates
app.include_router(ws.router)

# Also add WebSocket route directly to ensure registration
from fastapi.routing import APIWebSocketRoute
for route in ws.router.routes:
    if isinstance(route, APIWebSocketRoute):
        app.routes.append(route)
        print(f"VisaTour Backend: Registered WebSocket route {route.path}")


@app.on_event("startup")
def on_startup():
    if storage_mode() == "postgres":
        init_database()


@app.on_event("shutdown")
def on_shutdown():
    close_database()

@app.get("/api/health")
def health():
    db_ok = check_database_health() if storage_mode() == "postgres" else None
    return {
        "status": "ok" if db_ok is not False else "degraded",
        "database_connected": db_ok,
    }

@app.get("/")
def read_root():
    return {"message": "Welcome to the VisaTour Backend API"}

if __name__ == "__main__":
    import uvicorn
    # Need to use the string reference to handle reloads correctly
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
