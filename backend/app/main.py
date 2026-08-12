"""AGL QA & Live Dispatch Audit Platform — Phase 6 API.

Run locally:
    cd backend
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000

Auto-creates the SQLite schema on startup and seeds demo data on first boot.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (register models with Base.metadata)
from .database import Base, PHOTOS_PATH, engine, run_light_migrations
from .routers import (
    carriers,
    charges,
    checklist,
    clinics,
    dispatch,
    dispatchers,
    drivers,
    photos,
    reports,
    routes,
    states,
    stops,
    trends,
    violations,
)
from .seed import seed_if_empty


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_light_migrations()  # add columns introduced after the first release
    seed_if_empty()
    yield


app = FastAPI(
    title="AGL QA & Live Dispatch Audit Platform",
    version="0.10.0",
    description="Pickup Sheet with manual driver/clinic entry, in-app Guide.",
    lifespan=lifespan,
)

# LAN dev default. Restrict origins before exposing beyond the office network.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clinics.router)
app.include_router(drivers.router)
app.include_router(dispatchers.router)
app.include_router(carriers.router)
app.include_router(states.router)
app.include_router(routes.router)
app.include_router(stops.router)
app.include_router(checklist.router)
app.include_router(photos.router)
app.include_router(violations.router)
app.include_router(dispatch.router)
app.include_router(charges.router)
app.include_router(reports.router)
app.include_router(trends.router)

# Serve uploaded audit photos from backend/photos. Ensure the directory exists
# before StaticFiles checks it (default check_dir=True) so a fresh clone boots.
from fastapi.staticfiles import StaticFiles  # noqa: E402

PHOTOS_PATH.mkdir(parents=True, exist_ok=True)
app.mount("/photos", StaticFiles(directory=PHOTOS_PATH), name="photos")


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.10.0"}
