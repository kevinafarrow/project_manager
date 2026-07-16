"""CRUD endpoints for projects and their child entities."""
import sqlite3
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .db import get_db, seed_default_statuses
from . import tags

router = APIRouter()


def _get_or_404(conn, table: str, item_id: int) -> sqlite3.Row:
    row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        raise HTTPException(404, f"{table[:-1]} {item_id} not found")
    return row


def _apply_patch(conn, table: str, item_id: int, data: dict, allowed: set[str]):
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k} = ?" for k in fields)
    if table == "tasks":
        sets += ", updated_at = datetime('now')"
    conn.execute(f"UPDATE {table} SET {sets} WHERE id = ?", (*fields.values(), item_id))
    conn.commit()


# ---------- projects ----------

class ProjectIn(BaseModel):
    code: str = Field(min_length=1, max_length=16)
    name: str = Field(min_length=1)
    description: str = ""
    total_budget_hours: float = 0


@router.get("/projects")
def list_projects(conn=Depends(get_db)):
    return [dict(r) for r in conn.execute("SELECT * FROM projects ORDER BY id")]


@router.post("/projects", status_code=201)
def create_project(body: ProjectIn, conn=Depends(get_db)):
    code = body.code.strip().upper()
    try:
        cur = conn.execute(
            "INSERT INTO projects (code, name, description, total_budget_hours) VALUES (?, ?, ?, ?)",
            (code, body.name, body.description, body.total_budget_hours),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"project code '{code}' already exists")
    seed_default_statuses(conn, cur.lastrowid)
    conn.commit()
    return dict(_get_or_404(conn, "projects", cur.lastrowid))


@router.patch("/projects/{pid}")
def update_project(pid: int, body: dict, conn=Depends(get_db)):
    _get_or_404(conn, "projects", pid)
    _apply_patch(conn, "projects", pid, body,
                 {"name", "description", "total_budget_hours", "code"})
    return dict(_get_or_404(conn, "projects", pid))


@router.delete("/projects/{pid}", status_code=204)
def delete_project(pid: int, conn=Depends(get_db)):
    _get_or_404(conn, "projects", pid)
    conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
    conn.commit()


@router.get("/projects/{pid}/full")
def project_full(pid: int, conn=Depends(get_db)):
    """Everything the UI needs for one project, in one response."""
    project = dict(_get_or_404(conn, "projects", pid))
    phases = [dict(r) for r in conn.execute(
        "SELECT * FROM phases WHERE project_id = ? ORDER BY sort_order, id", (pid,))]
    statuses = [dict(r) for r in conn.execute(
        "SELECT * FROM statuses WHERE project_id = ? ORDER BY sort_order, id", (pid,))]
    logged = {
        (r["target_type"], r["target_id"]): r["total"]
        for r in conn.execute(
            "SELECT target_type, target_id, SUM(hours) AS total FROM time_entries "
            "WHERE project_id = ? GROUP BY target_type, target_id", (pid,))
    }
    tasks = []
    for r in conn.execute(
        "SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order, id", (pid,)
    ):
        t = dict(r)
        t["checklist"] = [dict(c) for c in conn.execute(
            "SELECT * FROM checklist_items WHERE task_id = ? ORDER BY sort_order, id",
            (r["id"],))]
        t["logged_hours"] = round(logged.get(("task", r["id"]), 0) or 0, 2)
        tasks.append(t)
    milestones = [dict(r) for r in conn.execute(
        "SELECT * FROM milestones WHERE project_id = ? ORDER BY date, id", (pid,))]
    overhead = []
    for r in conn.execute(
        "SELECT * FROM overhead_categories WHERE project_id = ? ORDER BY sort_order, id",
        (pid,),
    ):
        o = dict(r)
        o["logged_hours"] = round(logged.get(("overhead", r["id"]), 0) or 0, 2)
        overhead.append(o)
    dependencies = [dict(r) for r in conn.execute(
        "SELECT * FROM dependencies WHERE project_id = ? ORDER BY id", (pid,))]
    return {
        "project": project, "phases": phases, "statuses": statuses, "tasks": tasks,
        "milestones": milestones, "overhead_categories": overhead,
        "dependencies": dependencies, "today": date.today().isoformat(),
    }


# ---------- phases ----------

class NamedIn(BaseModel):
    name: str = Field(min_length=1)
    sort_order: int = 0


@router.post("/projects/{pid}/phases", status_code=201)
def create_phase(pid: int, body: NamedIn, conn=Depends(get_db)):
    _get_or_404(conn, "projects", pid)
    try:
        cur = conn.execute(
            "INSERT INTO phases (project_id, name, sort_order) VALUES (?, ?, ?)",
            (pid, body.name, body.sort_order),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"phase '{body.name}' already exists")
    conn.commit()
    return dict(_get_or_404(conn, "phases", cur.lastrowid))


@router.patch("/phases/{item_id}")
def update_phase(item_id: int, body: dict, conn=Depends(get_db)):
    _get_or_404(conn, "phases", item_id)
    _apply_patch(conn, "phases", item_id, body, {"name", "sort_order"})
    return dict(_get_or_404(conn, "phases", item_id))


@router.delete("/phases/{item_id}", status_code=204)
def delete_phase(item_id: int, conn=Depends(get_db)):
    _get_or_404(conn, "phases", item_id)
    conn.execute("DELETE FROM phases WHERE id = ?", (item_id,))
    conn.commit()


# ---------- statuses ----------

class StatusIn(NamedIn):
    is_done: bool = False


@router.post("/projects/{pid}/statuses", status_code=201)
def create_status(pid: int, body: StatusIn, conn=Depends(get_db)):
    _get_or_404(conn, "projects", pid)
    try:
        cur = conn.execute(
            "INSERT INTO statuses (project_id, name, sort_order, is_done) VALUES (?, ?, ?, ?)",
            (pid, body.name, body.sort_order, int(body.is_done)),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"status '{body.name}' already exists")
    conn.commit()
    return dict(_get_or_404(conn, "statuses", cur.lastrowid))


@router.patch("/statuses/{item_id}")
def update_status(item_id: int, body: dict, conn=Depends(get_db)):
    _get_or_404(conn, "statuses", item_id)
    if "is_done" in body:
        body["is_done"] = int(bool(body["is_done"]))
    _apply_patch(conn, "statuses", item_id, body, {"name", "sort_order", "is_done"})
    return dict(_get_or_404(conn, "statuses", item_id))


@router.delete("/statuses/{item_id}", status_code=204)
def delete_status(item_id: int, conn=Depends(get_db)):
    _get_or_404(conn, "statuses", item_id)
    conn.execute("DELETE FROM statuses WHERE id = ?", (item_id,))
    conn.commit()


# ---------- tasks ----------

class TaskIn(BaseModel):
    title: str = Field(min_length=1)
    external_key: str = ""
    description: str = ""
    owner: str = ""
    phase_id: int | None = None
    status_id: int | None = None
    start_date: str | None = None
    end_date: str | None = None
    estimated_hours: float = 0
    tag: str | None = None
    sort_order: int = 0
    checklist: list[str] = []


@router.post("/projects/{pid}/tasks", status_code=201)
def create_task(pid: int, body: TaskIn, conn=Depends(get_db)):
    project = _get_or_404(conn, "projects", pid)
    tag = body.tag or tags.task_tag(conn, pid, project["code"], body.external_key, body.title)
    status_id = body.status_id
    if status_id is None:
        first = conn.execute(
            "SELECT id FROM statuses WHERE project_id = ? ORDER BY sort_order, id LIMIT 1",
            (pid,)).fetchone()
        status_id = first["id"] if first else None
    try:
        cur = conn.execute(
            "INSERT INTO tasks (project_id, phase_id, status_id, external_key, title, "
            "description, owner, start_date, end_date, estimated_hours, tag, sort_order) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (pid, body.phase_id, status_id, body.external_key, body.title,
             body.description, body.owner, body.start_date, body.end_date,
             body.estimated_hours, tag, body.sort_order),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"tag '{tag}' already exists in this project")
    for i, text in enumerate(body.checklist):
        conn.execute(
            "INSERT INTO checklist_items (task_id, text, sort_order) VALUES (?, ?, ?)",
            (cur.lastrowid, text, i),
        )
    conn.commit()
    return dict(_get_or_404(conn, "tasks", cur.lastrowid))


@router.patch("/tasks/{item_id}")
def update_task(item_id: int, body: dict, conn=Depends(get_db)):
    _get_or_404(conn, "tasks", item_id)
    try:
        _apply_patch(conn, "tasks", item_id, body,
                     {"title", "external_key", "description", "owner", "phase_id",
                      "status_id", "start_date", "end_date", "estimated_hours", "tag",
                      "sort_order"})
    except sqlite3.IntegrityError:
        raise HTTPException(409, "tag already exists in this project")
    return dict(_get_or_404(conn, "tasks", item_id))


@router.delete("/tasks/{item_id}", status_code=204)
def delete_task(item_id: int, conn=Depends(get_db)):
    task = _get_or_404(conn, "tasks", item_id)
    conn.execute(
        "DELETE FROM dependencies WHERE project_id = ? AND "
        "((pred_type = 'task' AND pred_id = ?) OR (succ_type = 'task' AND succ_id = ?))",
        (task["project_id"], item_id, item_id))
    conn.execute("DELETE FROM tasks WHERE id = ?", (item_id,))
    conn.commit()


# ---------- checklist ----------

class ChecklistIn(BaseModel):
    text: str = Field(min_length=1)
    sort_order: int = 0


@router.post("/tasks/{task_id}/checklist", status_code=201)
def create_checklist_item(task_id: int, body: ChecklistIn, conn=Depends(get_db)):
    _get_or_404(conn, "tasks", task_id)
    cur = conn.execute(
        "INSERT INTO checklist_items (task_id, text, sort_order) VALUES (?, ?, ?)",
        (task_id, body.text, body.sort_order),
    )
    conn.commit()
    return dict(_get_or_404(conn, "checklist_items", cur.lastrowid))


@router.patch("/checklist/{item_id}")
def update_checklist_item(item_id: int, body: dict, conn=Depends(get_db)):
    _get_or_404(conn, "checklist_items", item_id)
    if "done" in body:
        body["done"] = int(bool(body["done"]))
    _apply_patch(conn, "checklist_items", item_id, body, {"text", "done", "sort_order"})
    return dict(_get_or_404(conn, "checklist_items", item_id))


@router.delete("/checklist/{item_id}", status_code=204)
def delete_checklist_item(item_id: int, conn=Depends(get_db)):
    _get_or_404(conn, "checklist_items", item_id)
    conn.execute("DELETE FROM checklist_items WHERE id = ?", (item_id,))
    conn.commit()


# ---------- milestones ----------

class MilestoneIn(BaseModel):
    name: str = Field(min_length=1)
    date: str
    external_key: str = ""


@router.post("/projects/{pid}/milestones", status_code=201)
def create_milestone(pid: int, body: MilestoneIn, conn=Depends(get_db)):
    _get_or_404(conn, "projects", pid)
    cur = conn.execute(
        "INSERT INTO milestones (project_id, name, date, external_key) VALUES (?, ?, ?, ?)",
        (pid, body.name, body.date, body.external_key),
    )
    conn.commit()
    return dict(_get_or_404(conn, "milestones", cur.lastrowid))


@router.patch("/milestones/{item_id}")
def update_milestone(item_id: int, body: dict, conn=Depends(get_db)):
    _get_or_404(conn, "milestones", item_id)
    _apply_patch(conn, "milestones", item_id, body, {"name", "date", "external_key"})
    return dict(_get_or_404(conn, "milestones", item_id))


@router.delete("/milestones/{item_id}", status_code=204)
def delete_milestone(item_id: int, conn=Depends(get_db)):
    ms = _get_or_404(conn, "milestones", item_id)
    conn.execute(
        "DELETE FROM dependencies WHERE project_id = ? AND "
        "((pred_type = 'milestone' AND pred_id = ?) OR (succ_type = 'milestone' AND succ_id = ?))",
        (ms["project_id"], item_id, item_id))
    conn.execute("DELETE FROM milestones WHERE id = ?", (item_id,))
    conn.commit()


# ---------- overhead categories ----------

@router.post("/projects/{pid}/overhead", status_code=201)
def create_overhead(pid: int, body: NamedIn, conn=Depends(get_db)):
    project = _get_or_404(conn, "projects", pid)
    tag = tags.overhead_tag(conn, pid, project["code"], body.name)
    try:
        cur = conn.execute(
            "INSERT INTO overhead_categories (project_id, name, tag, sort_order) VALUES (?, ?, ?, ?)",
            (pid, body.name, tag, body.sort_order),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"overhead category '{body.name}' already exists")
    conn.commit()
    return dict(_get_or_404(conn, "overhead_categories", cur.lastrowid))


@router.patch("/overhead/{item_id}")
def update_overhead(item_id: int, body: dict, conn=Depends(get_db)):
    _get_or_404(conn, "overhead_categories", item_id)
    try:
        _apply_patch(conn, "overhead_categories", item_id, body,
                     {"name", "tag", "sort_order"})
    except sqlite3.IntegrityError:
        raise HTTPException(409, "name or tag already exists in this project")
    return dict(_get_or_404(conn, "overhead_categories", item_id))


@router.delete("/overhead/{item_id}", status_code=204)
def delete_overhead(item_id: int, conn=Depends(get_db)):
    _get_or_404(conn, "overhead_categories", item_id)
    conn.execute("DELETE FROM overhead_categories WHERE id = ?", (item_id,))
    conn.commit()


# ---------- dependencies ----------

class DependencyIn(BaseModel):
    pred_type: str = Field(pattern="^(task|milestone)$")
    pred_id: int
    succ_type: str = Field(pattern="^(task|milestone)$")
    succ_id: int


@router.post("/projects/{pid}/dependencies", status_code=201)
def create_dependency(pid: int, body: DependencyIn, conn=Depends(get_db)):
    _get_or_404(conn, "projects", pid)
    if (body.pred_type, body.pred_id) == (body.succ_type, body.succ_id):
        raise HTTPException(400, "an item cannot depend on itself")
    for kind, item_id in ((body.pred_type, body.pred_id), (body.succ_type, body.succ_id)):
        table = "tasks" if kind == "task" else "milestones"
        row = conn.execute(
            f"SELECT project_id FROM {table} WHERE id = ?", (item_id,)).fetchone()
        if row is None or row["project_id"] != pid:
            raise HTTPException(400, f"{kind} {item_id} not found in project {pid}")
    try:
        cur = conn.execute(
            "INSERT INTO dependencies (project_id, pred_type, pred_id, succ_type, succ_id) "
            "VALUES (?, ?, ?, ?, ?)",
            (pid, body.pred_type, body.pred_id, body.succ_type, body.succ_id),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, "dependency already exists")
    conn.commit()
    return dict(_get_or_404(conn, "dependencies", cur.lastrowid))


@router.delete("/dependencies/{item_id}", status_code=204)
def delete_dependency(item_id: int, conn=Depends(get_db)):
    _get_or_404(conn, "dependencies", item_id)
    conn.execute("DELETE FROM dependencies WHERE id = ?", (item_id,))
    conn.commit()
