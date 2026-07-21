"""Backup / restore round-trip and validation tests.

Each test points the app at a throwaway database via `db.DB_PATH`, so the real
`data/pm.sqlite3` is never touched. `db.connect()` reads the module global at call
time, which is what makes monkeypatching the path enough to redirect every route.
"""
import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.app import db
from backend.app.main import app

client = TestClient(app)


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "pm.sqlite3")
    db.init_db()
    return db.DB_PATH


def _make_project(code="AMBIT"):
    r = client.post("/api/projects", json={
        "code": code, "name": "SOC 2 Readiness", "total_budget_hours": 167.8})
    assert r.status_code == 201, r.text
    return r.json()


def test_backup_then_restore_round_trips_data(fresh_db):
    project = _make_project()
    # Log an hour so we prove real rows survive, not just the schema.
    task = client.post(f"/api/projects/{project['id']}/tasks", json={"title": "Kickoff"}).json()
    client.post(f"/api/projects/{project['id']}/time-entries", json={
        "target_type": "task", "target_id": task["id"],
        "entry_date": "2026-07-20", "hours": 2.5, "note": "kickoff call"})

    backup = client.get("/api/backup")
    assert backup.status_code == 200
    assert backup.headers["content-type"] == "application/octet-stream"
    assert "engagement-pm-backup-" in backup.headers["content-disposition"]
    snapshot = backup.content
    assert snapshot[:16] == b"SQLite format 3\x00"

    # Wipe everything, then restore from the snapshot.
    client.delete(f"/api/projects/{project['id']}")
    assert client.get("/api/projects").json() == []

    restore = client.post("/api/restore", files={"file": ("backup.sqlite3", snapshot)})
    assert restore.status_code == 200, restore.text
    assert restore.json()["counts"] == {"projects": 1, "tasks": 1, "time_entries": 1}

    projects = client.get("/api/projects").json()
    assert len(projects) == 1 and projects[0]["code"] == "AMBIT"
    entries = client.get(f"/api/projects/{projects[0]['id']}/time-entries").json()
    assert len(entries) == 1 and entries[0]["hours"] == 2.5


def test_restore_keeps_pre_restore_safety_copy(fresh_db):
    _make_project("ALPHA")
    good_backup = client.get("/api/backup").content

    _make_project("BETA")  # current DB now has two projects
    client.post("/api/restore", files={"file": ("backup.sqlite3", good_backup)})

    pre = fresh_db.with_suffix(fresh_db.suffix + ".pre-restore")
    assert pre.exists(), "expected a pre-restore safety copy"
    conn = sqlite3.connect(pre)
    try:
        codes = {r[0] for r in conn.execute("SELECT code FROM projects")}
    finally:
        conn.close()
    assert codes == {"ALPHA", "BETA"}, "safety copy should hold the state before restore"


def test_restore_rejects_non_sqlite_file(fresh_db):
    _make_project()
    r = client.post("/api/restore", files={"file": ("evil.sqlite3", b"this is not a database")})
    assert r.status_code == 400
    # Original data untouched.
    assert len(client.get("/api/projects").json()) == 1


def test_restore_rejects_empty_file(fresh_db):
    r = client.post("/api/restore", files={"file": ("empty.sqlite3", b"")})
    assert r.status_code == 400


def test_restore_rejects_sqlite_without_our_schema(fresh_db, tmp_path):
    foreign = tmp_path / "foreign.sqlite3"
    conn = sqlite3.connect(foreign)
    conn.execute("CREATE TABLE unrelated (x INTEGER)")
    conn.commit()
    conn.close()

    r = client.post("/api/restore", files={"file": ("foreign.sqlite3", foreign.read_bytes())})
    assert r.status_code == 400
    assert "missing tables" in r.json()["detail"]
