"""JSON artifact import: preview (diff) and commit (upsert by external key).

Artifact format "pm-import/v1":

{
  "format": "pm-import/v1",
  "project": {"code": "AMBIT", "name": "...", "description": "...",
              "total_budget_hours": 167.8},
  "phases": ["Remediation", {"name": "Audit Support", "sort_order": 2}],
  "overhead_categories": ["Project management", {"name": "Meetings"}],
  "milestones": [{"external_key": "OBS-START", "name": "Observation period begins",
                  "date": "2026-09-01"}],
  "tasks": [{
     "external_key": "CC8.1", "title": "...", "description": "...", "owner": "...",
     "phase": "Remediation", "status": "Not Started",
     "start_date": "2026-07-16", "end_date": "2026-07-31",
     "estimated_hours": 6, "tag": "AMBIT-CC8.1-branch-protection",
     "checklist": ["step one", "step two"],
     "depends_on": ["CC3.2", "OBS-START"]
  }]
}

Matching keys: project by code; phases and overhead categories by name;
milestones by external_key (falling back to name); tasks by external_key
(falling back to title). Existing time entries, checklist done-states, and
task statuses are never modified by a re-import.
"""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .db import get_db, seed_default_statuses
from . import tags

router = APIRouter()

FORMAT = "pm-import/v1"

TASK_UPDATE_FIELDS = ("title", "description", "owner", "start_date", "end_date",
                      "estimated_hours")


class ImportIn(BaseModel):
    artifact: dict
    commit: bool = False


def _norm_named(items, default_prefix) -> list[dict]:
    out = []
    for i, item in enumerate(items or []):
        if isinstance(item, str):
            out.append({"name": item, "sort_order": i})
        else:
            out.append({"name": item["name"], "sort_order": item.get("sort_order", i)})
    return out


def _validate(artifact: dict) -> list[str]:
    errors = []
    if artifact.get("format") != FORMAT:
        errors.append(f"artifact 'format' must be '{FORMAT}'")
    project = artifact.get("project") or {}
    if not project.get("code"):
        errors.append("project.code is required")
    if not project.get("name"):
        errors.append("project.name is required")
    for i, t in enumerate(artifact.get("tasks") or []):
        if not isinstance(t, dict) or not t.get("title"):
            errors.append(f"tasks[{i}]: title is required")
    for i, m in enumerate(artifact.get("milestones") or []):
        if not isinstance(m, dict) or not m.get("name") or not m.get("date"):
            errors.append(f"milestones[{i}]: name and date are required")
    return errors


def _task_key(t: dict) -> str:
    return (t.get("external_key") or t.get("title") or "").strip().lower()


@router.post("/import")
def import_artifact(body: ImportIn, conn=Depends(get_db)):
    artifact = body.artifact
    errors = _validate(artifact)
    if errors:
        raise HTTPException(422, {"errors": errors})

    changes: list[dict] = []

    def record(entity, key, action, detail=None):
        changes.append({"entity": entity, "key": key, "action": action,
                        "changes": detail or {}})

    # ---- project ----
    p_in = artifact["project"]
    code = p_in["code"].strip().upper()
    project = conn.execute("SELECT * FROM projects WHERE code = ?", (code,)).fetchone()
    if project is None:
        cur = conn.execute(
            "INSERT INTO projects (code, name, description, total_budget_hours) VALUES (?, ?, ?, ?)",
            (code, p_in["name"], p_in.get("description", ""),
             p_in.get("total_budget_hours", 0)),
        )
        pid = cur.lastrowid
        seed_default_statuses(conn, pid)
        record("project", code, "create")
    else:
        pid = project["id"]
        detail = {}
        for field in ("name", "description", "total_budget_hours"):
            if field in p_in and p_in[field] != project[field]:
                detail[field] = [project[field], p_in[field]]
                conn.execute(f"UPDATE projects SET {field} = ? WHERE id = ?",
                             (p_in[field], pid))
        record("project", code, "update" if detail else "unchanged", detail)

    # ---- phases ----
    phase_ids: dict[str, int] = {}
    existing = {r["name"].lower(): r for r in conn.execute(
        "SELECT * FROM phases WHERE project_id = ?", (pid,))}
    wanted = _norm_named(artifact.get("phases"), "phase")
    # Phases referenced by tasks but not declared still need to exist.
    declared = {p["name"].lower() for p in wanted}
    for t in artifact.get("tasks") or []:
        name = (t.get("phase") or "").strip()
        if name and name.lower() not in declared:
            wanted.append({"name": name, "sort_order": len(wanted)})
            declared.add(name.lower())
    for p in wanted:
        row = existing.get(p["name"].lower())
        if row is None:
            cur = conn.execute(
                "INSERT INTO phases (project_id, name, sort_order) VALUES (?, ?, ?)",
                (pid, p["name"], p["sort_order"]))
            phase_ids[p["name"].lower()] = cur.lastrowid
            record("phase", p["name"], "create")
        else:
            phase_ids[p["name"].lower()] = row["id"]
            record("phase", p["name"], "unchanged")

    # ---- overhead categories ----
    project_row = conn.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
    existing = {r["name"].lower(): r for r in conn.execute(
        "SELECT * FROM overhead_categories WHERE project_id = ?", (pid,))}
    for o in _norm_named(artifact.get("overhead_categories"), "overhead"):
        row = existing.get(o["name"].lower())
        if row is None:
            tag = tags.overhead_tag(conn, pid, project_row["code"], o["name"])
            conn.execute(
                "INSERT INTO overhead_categories (project_id, name, tag, sort_order) VALUES (?, ?, ?, ?)",
                (pid, o["name"], tag, o["sort_order"]))
            record("overhead", o["name"], "create", {"tag": [None, tag]})
        else:
            record("overhead", o["name"], "unchanged")

    # ---- statuses referenced by tasks ----
    status_ids = {r["name"].lower(): r["id"] for r in conn.execute(
        "SELECT * FROM statuses WHERE project_id = ?", (pid,))}
    for t in artifact.get("tasks") or []:
        name = (t.get("status") or "").strip()
        if name and name.lower() not in status_ids:
            cur = conn.execute(
                "INSERT INTO statuses (project_id, name, sort_order, is_done) VALUES (?, ?, ?, 0)",
                (pid, name, len(status_ids)))
            status_ids[name.lower()] = cur.lastrowid
            record("status", name, "create")

    # ---- milestones ----
    def ms_key(row_or_dict) -> str:
        key = (row_or_dict["external_key"] or "") if not isinstance(row_or_dict, dict) \
            else (row_or_dict.get("external_key") or "")
        name = row_or_dict["name"] if not isinstance(row_or_dict, dict) \
            else row_or_dict.get("name", "")
        return (key or name).strip().lower()

    existing_ms = {ms_key(r): r for r in conn.execute(
        "SELECT * FROM milestones WHERE project_id = ?", (pid,))}
    milestone_ids: dict[str, int] = {ms_key(r): r["id"] for r in existing_ms.values()}
    for m in artifact.get("milestones") or []:
        key = ms_key(m)
        row = existing_ms.get(key)
        if row is None:
            cur = conn.execute(
                "INSERT INTO milestones (project_id, name, date, external_key) VALUES (?, ?, ?, ?)",
                (pid, m["name"], m["date"], m.get("external_key", "")))
            milestone_ids[key] = cur.lastrowid
            record("milestone", m["name"], "create")
        else:
            milestone_ids[key] = row["id"]
            detail = {}
            for field in ("name", "date"):
                if m.get(field) and m[field] != row[field]:
                    detail[field] = [row[field], m[field]]
                    conn.execute(f"UPDATE milestones SET {field} = ? WHERE id = ?",
                                 (m[field], row["id"]))
            record("milestone", m["name"], "update" if detail else "unchanged", detail)

    # ---- tasks ----
    existing_tasks = list(conn.execute("SELECT * FROM tasks WHERE project_id = ?", (pid,)))
    by_key = {(r["external_key"] or "").strip().lower(): r for r in existing_tasks
              if r["external_key"]}
    by_title = {r["title"].strip().lower(): r for r in existing_tasks}
    task_ids: dict[str, int] = {}
    for i, t in enumerate(artifact.get("tasks") or []):
        key = _task_key(t)
        ext = (t.get("external_key") or "").strip()
        row = by_key.get(ext.lower()) if ext else by_title.get(t["title"].strip().lower())
        phase_id = phase_ids.get((t.get("phase") or "").strip().lower())
        if row is None:
            tag = t.get("tag") or tags.task_tag(conn, pid, project_row["code"], ext, t["title"])
            status_id = status_ids.get((t.get("status") or "not started").strip().lower())
            cur = conn.execute(
                "INSERT INTO tasks (project_id, phase_id, status_id, external_key, title, "
                "description, owner, start_date, end_date, estimated_hours, tag, sort_order) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (pid, phase_id, status_id, ext, t["title"], t.get("description", ""),
                 t.get("owner", ""), t.get("start_date"), t.get("end_date"),
                 t.get("estimated_hours", 0), tag, i))
            task_ids[key] = cur.lastrowid
            for j, text in enumerate(t.get("checklist") or []):
                conn.execute(
                    "INSERT INTO checklist_items (task_id, text, sort_order) VALUES (?, ?, ?)",
                    (cur.lastrowid, text, j))
            record("task", ext or t["title"], "create",
                   {"tag": [None, tag],
                    "checklist_items": [0, len(t.get("checklist") or [])]})
        else:
            task_ids[key] = row["id"]
            detail = {}
            for field in TASK_UPDATE_FIELDS:
                if field in t and t[field] != row[field]:
                    detail[field] = [row[field], t[field]]
                    conn.execute(
                        f"UPDATE tasks SET {field} = ?, updated_at = datetime('now') WHERE id = ?",
                        (t[field], row["id"]))
            if phase_id is not None and phase_id != row["phase_id"]:
                detail["phase"] = [row["phase_id"], t.get("phase")]
                conn.execute("UPDATE tasks SET phase_id = ? WHERE id = ?",
                             (phase_id, row["id"]))
            # Merge checklist: add unseen items, never touch existing/done ones.
            have = {r["text"].strip().lower() for r in conn.execute(
                "SELECT text FROM checklist_items WHERE task_id = ?", (row["id"],))}
            added = 0
            for text in t.get("checklist") or []:
                if text.strip().lower() not in have:
                    conn.execute(
                        "INSERT INTO checklist_items (task_id, text, sort_order) VALUES (?, ?, ?)",
                        (row["id"], text, len(have) + added))
                    added += 1
            if added:
                detail["checklist_items"] = ["", f"+{added}"]
            record("task", ext or t["title"], "update" if detail else "unchanged", detail)

    # ---- dependencies (task.depends_on -> task or milestone external keys) ----
    existing_deps = {(r["pred_type"], r["pred_id"], r["succ_type"], r["succ_id"])
                     for r in conn.execute(
                         "SELECT * FROM dependencies WHERE project_id = ?", (pid,))}
    for t in artifact.get("tasks") or []:
        succ_id = task_ids.get(_task_key(t))
        if succ_id is None:
            continue
        for dep in t.get("depends_on") or []:
            dep_key = dep.strip().lower()
            if dep_key in task_ids:
                pred = ("task", task_ids[dep_key])
            elif dep_key in milestone_ids:
                pred = ("milestone", milestone_ids[dep_key])
            else:
                row = by_key.get(dep_key)
                if row is None:
                    record("dependency", f"{dep} -> {_task_key(t)}", "error",
                           {"reason": [None, f"unknown key '{dep}'"]})
                    continue
                pred = ("task", row["id"])
            quad = (*pred, "task", succ_id)
            if quad in existing_deps:
                record("dependency", f"{dep} -> {t.get('external_key') or t['title']}", "unchanged")
            else:
                conn.execute(
                    "INSERT INTO dependencies (project_id, pred_type, pred_id, succ_type, succ_id) "
                    "VALUES (?, ?, ?, ?, ?)", (pid, *quad))
                existing_deps.add(quad)
                record("dependency", f"{dep} -> {t.get('external_key') or t['title']}", "create")

    if body.commit:
        conn.commit()
    else:
        conn.rollback()

    summary = {}
    for c in changes:
        summary.setdefault(c["entity"], {}).setdefault(c["action"], 0)
        summary[c["entity"]][c["action"]] += 1
    return {"committed": body.commit, "project_code": code, "summary": summary,
            "changes": changes}
