"""SQLite connection management and schema."""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "pm.sqlite3"

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    total_budget_hours REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS phases (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS statuses (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_done INTEGER NOT NULL DEFAULT 0,
    UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_id INTEGER REFERENCES phases(id) ON DELETE SET NULL,
    status_id INTEGER REFERENCES statuses(id) ON DELETE SET NULL,
    external_key TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner TEXT NOT NULL DEFAULT '',
    start_date TEXT,
    end_date TEXT,
    estimated_hours REAL NOT NULL DEFAULT 0,
    tag TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, tag)
);

CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    external_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS overhead_categories (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tag TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(project_id, name),
    UNIQUE(project_id, tag)
);

CREATE TABLE IF NOT EXISTS dependencies (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    pred_type TEXT NOT NULL CHECK (pred_type IN ('task','milestone')),
    pred_id INTEGER NOT NULL,
    succ_type TEXT NOT NULL CHECK (succ_type IN ('task','milestone')),
    succ_id INTEGER NOT NULL,
    UNIQUE(project_id, pred_type, pred_id, succ_type, succ_id)
);

CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('task','overhead')),
    target_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    hours REAL NOT NULL,
    person TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_entries_target ON time_entries(target_type, target_id);
"""

DEFAULT_STATUSES = [
    ("Not Started", 0, 0),
    ("In Progress", 1, 0),
    ("Blocked", 2, 0),
    ("Done", 3, 1),
]


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def seed_default_statuses(conn: sqlite3.Connection, project_id: int) -> None:
    conn.executemany(
        "INSERT INTO statuses (project_id, name, sort_order, is_done) VALUES (?, ?, ?, ?)",
        [(project_id, name, order, done) for name, order, done in DEFAULT_STATUSES],
    )
