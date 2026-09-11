"""
SOBRAD backend -- FastAPI application entrypoint.

Run with:
    uvicorn app.main:app --reload --port 8000

See README.md for full setup instructions.
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

# Load variables from a local backend/.env file (if present) into the process
# environment, e.g. ANTHROPIC_API_KEY -- see README.md. This is a no-op (and
# perfectly safe) when no .env file exists, which is why it's unconditional.
# Must run before any app code reads os.environ.
load_dotenv()

from app.database import Base, engine
from app.routers import auth, breathing, chat, journal, mood, stats, study

# Create tables on startup if they don't already exist. sobrad.db is created
# automatically in the working directory on first run.
Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# Tiny, idempotent migration for columns added after the initial release.
# There's no Alembic (or similar) in this prototype -- see database.py's
# docstring -- and Base.metadata.create_all only creates missing *tables*,
# never adds columns to ones that already exist. So an existing sobrad.db
# from before a column was added needs this to pick it up without the file
# being deleted (which would also wipe its data).
# ---------------------------------------------------------------------------
with engine.connect() as _conn:
    _existing_user_cols = {row[1] for row in _conn.execute(text("PRAGMA table_info(users)"))}
    if "passing_threshold" not in _existing_user_cols:
        _conn.execute(
            text("ALTER TABLE users ADD COLUMN passing_threshold FLOAT NOT NULL DEFAULT 70.0")
        )
        _conn.commit()

app = FastAPI(
    title="SOBRAD API",
    description="Backend for SOBRAD, a calm companion app by DST (Daiki Systems Tech).",
    version="0.1.0",
)

# Vite dev server defaults, plus whatever the deployed frontend's real origin
# is (e.g. https://sobrad.pages.dev or a custom domain on Cloudflare Pages).
# Set SOBRAD_CORS_ORIGINS as a comma-separated list in your Render environment
# variables -- no code change needed when you deploy. Bearer-token auth is
# used (not cookies), so credentials do not need to be allowed.
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
extra_origins = os.environ.get("SOBRAD_CORS_ORIGINS", "")
origins += [o.strip() for o in extra_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(journal.router)
app.include_router(mood.router)
app.include_router(breathing.router)
app.include_router(stats.router)
app.include_router(chat.router)
app.include_router(study.router)


@app.get("/api/health", tags=["health"])
def health_check():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Serve the built frontend (frontend/dist) from this same process/port, so
# the whole app is reachable through one origin (important for the public
# tunnel URL, and for the frontend's relative /api calls to work).
# ---------------------------------------------------------------------------
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if FRONTEND_DIST.is_dir():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        # Never intercept API routes -- let FastAPI's normal routing/404
        # handle those (this catch-all is only reached when no other route
        # matched, so an unknown /api/* path still correctly 404s as JSON
        # rather than silently returning the SPA's index.html).
        if full_path.startswith("api/"):
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Not found")

        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)

        # Fall back to index.html for everything else, so client-side routes
        # (e.g. /login, /home) work on a full page load/refresh.
        return FileResponse(FRONTEND_DIST / "index.html")
