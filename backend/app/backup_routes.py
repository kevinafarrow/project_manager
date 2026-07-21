"""Whole-database backup and restore — for migrating hosts or point-in-time snapshots.

A backup is a byte-for-byte SQLite copy taken with the online backup API, so it is
consistent even while the app is serving requests. Restore validates the uploaded
file is a sound SQLite database with this app's schema before atomically swapping it
in, and keeps the pre-restore database as a safety copy next to it.
"""
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from . import db

router = APIRouter()

# Core tables a valid backup must contain; guards against restoring an arbitrary
# (or empty) SQLite file that would leave the app broken.
REQUIRED_TABLES = {
    "projects", "phases", "statuses", "tasks", "checklist_items",
    "milestones", "overhead_categories", "dependencies", "time_entries",
}


def _snapshot(dest: Path) -> None:
    """Copy the live database into `dest` via SQLite's consistent online backup."""
    db.init_db()  # ensure the source exists even on a fresh install
    src = sqlite3.connect(db.DB_PATH)
    try:
        out = sqlite3.connect(dest)
        try:
            src.backup(out)
        finally:
            out.close()
    finally:
        src.close()


@router.get("/backup")
def download_backup():
    """Stream a consistent snapshot of the database as a download."""
    tmp = Path(tempfile.mkstemp(prefix="pm-backup-", suffix=".sqlite3")[1])
    _snapshot(tmp)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return FileResponse(
        tmp,
        media_type="application/octet-stream",
        filename=f"engagement-pm-backup-{stamp}.sqlite3",
        background=BackgroundTask(tmp.unlink),  # clean up after the response is sent
    )


def _validate(path: Path) -> None:
    """Raise HTTPException(400) unless `path` is a sound SQLite DB with our schema."""
    try:
        conn = sqlite3.connect(path)
    except sqlite3.Error:
        raise HTTPException(400, "not a readable SQLite database")
    try:
        try:
            check = conn.execute("PRAGMA integrity_check").fetchone()[0]
        except sqlite3.DatabaseError:
            raise HTTPException(400, "file is not a valid SQLite database")
        if check != "ok":
            raise HTTPException(400, f"database failed integrity check: {check}")
        tables = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'")}
        missing = REQUIRED_TABLES - tables
        if missing:
            raise HTTPException(
                400, f"not an Engagement PM backup (missing tables: {', '.join(sorted(missing))})")
    finally:
        conn.close()


@router.post("/restore")
async def restore_backup(file: UploadFile):
    """Replace the database with an uploaded backup, keeping a pre-restore copy.

    The current database is copied to `<db>.pre-restore` before the swap, so a bad
    restore can be undone by renaming that file back.
    """
    data_dir = db.DB_PATH.parent
    data_dir.mkdir(parents=True, exist_ok=True)

    # Land the upload in the data dir so the final os.replace is an atomic,
    # same-filesystem rename.
    fd, tmp_name = tempfile.mkstemp(prefix="pm-restore-", suffix=".sqlite3", dir=data_dir)
    incoming = Path(tmp_name)
    try:
        with open(fd, "wb") as out:
            while chunk := await file.read(1 << 20):
                out.write(chunk)
        if incoming.stat().st_size == 0:
            raise HTTPException(400, "uploaded file is empty")
        _validate(incoming)

        if db.DB_PATH.exists():
            _snapshot(db.DB_PATH.with_suffix(db.DB_PATH.suffix + ".pre-restore"))

        incoming.replace(db.DB_PATH)
        # Drop any stale rollback/WAL sidecars that belonged to the old database.
        for suffix in ("-wal", "-shm", "-journal"):
            sidecar = Path(str(db.DB_PATH) + suffix)
            sidecar.unlink(missing_ok=True)
    finally:
        incoming.unlink(missing_ok=True)

    counts = {}
    conn = db.connect()
    try:
        for table in ("projects", "tasks", "time_entries"):
            counts[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        conn.close()
    return {"restored": True, "counts": counts}
