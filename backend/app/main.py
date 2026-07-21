"""Engagement project manager — FastAPI entry point."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import init_db
from . import crud_routes, time_routes, importer, stats, report, backup_routes

app = FastAPI(title="Engagement PM")
init_db()

for module in (crud_routes, time_routes, importer, stats, report, backup_routes):
    app.include_router(module.router, prefix="/api")

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        candidate = DIST / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
