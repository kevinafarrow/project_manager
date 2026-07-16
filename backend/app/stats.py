"""Dashboard statistics computation."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from .db import get_db

router = APIRouter()


def compute_stats(conn, pid: int) -> dict:
    project = conn.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
    if project is None:
        raise HTTPException(404, f"project {pid} not found")
    today = date.today().isoformat()

    tasks = [dict(r) for r in conn.execute(
        "SELECT t.*, s.name AS status_name, COALESCE(s.is_done, 0) AS is_done, p.name AS phase_name "
        "FROM tasks t LEFT JOIN statuses s ON t.status_id = s.id "
        "LEFT JOIN phases p ON t.phase_id = p.id WHERE t.project_id = ? "
        "ORDER BY t.sort_order, t.id", (pid,))]
    logged = {(r["target_type"], r["target_id"]): r["total"] for r in conn.execute(
        "SELECT target_type, target_id, SUM(hours) AS total FROM time_entries "
        "WHERE project_id = ? GROUP BY target_type, target_id", (pid,))}
    for t in tasks:
        t["logged_hours"] = round(logged.get(("task", t["id"]), 0) or 0, 2)

    budget = project["total_budget_hours"] or 0
    allocated = sum(t["estimated_hours"] for t in tasks)
    logged_tasks = sum(t["logged_hours"] for t in tasks)
    overhead = [dict(r) for r in conn.execute(
        "SELECT * FROM overhead_categories WHERE project_id = ? ORDER BY sort_order, id",
        (pid,))]
    for o in overhead:
        o["logged_hours"] = round(logged.get(("overhead", o["id"]), 0) or 0, 2)
    logged_overhead = sum(o["logged_hours"] for o in overhead)
    logged_total = logged_tasks + logged_overhead

    done_est = sum(t["estimated_hours"] for t in tasks if t["is_done"])
    completion_pct = round(100 * done_est / allocated, 1) if allocated else 0

    phases = [dict(r) for r in conn.execute(
        "SELECT * FROM phases WHERE project_id = ? ORDER BY sort_order, id", (pid,))]
    by_phase = []
    for ph in phases + [{"id": None, "name": "(no phase)"}]:
        ph_tasks = [t for t in tasks if t["phase_id"] == ph["id"]]
        if not ph_tasks and ph["id"] is None:
            continue
        by_phase.append({
            "phase": ph["name"],
            "task_count": len(ph_tasks),
            "done_count": sum(1 for t in ph_tasks if t["is_done"]),
            "estimated_hours": round(sum(t["estimated_hours"] for t in ph_tasks), 2),
            "done_estimated_hours": round(
                sum(t["estimated_hours"] for t in ph_tasks if t["is_done"]), 2),
            "logged_hours": round(sum(t["logged_hours"] for t in ph_tasks), 2),
        })

    daily = conn.execute(
        "SELECT entry_date, SUM(hours) AS total FROM time_entries "
        "WHERE project_id = ? GROUP BY entry_date ORDER BY entry_date", (pid,)).fetchall()
    burnup, cumulative = [], 0.0
    for r in daily:
        cumulative += r["total"]
        burnup.append({"date": r["entry_date"], "cumulative_hours": round(cumulative, 2)})

    overdue = [t for t in tasks
               if t["end_date"] and t["end_date"] < today and not t["is_done"]]
    horizon = (date.today() + timedelta(days=14)).isoformat()
    upcoming = [t for t in tasks
                if t["end_date"] and today <= t["end_date"] <= horizon and not t["is_done"]]

    # Dependency conflicts: successor starts before its predecessor ends.
    task_by_id = {t["id"]: t for t in tasks}
    ms_by_id = {r["id"]: dict(r) for r in conn.execute(
        "SELECT * FROM milestones WHERE project_id = ?", (pid,))}

    def endpoint(kind, item_id):
        if kind == "task":
            t = task_by_id.get(item_id)
            return (t["title"], t["start_date"], t["end_date"], t["external_key"]) if t else None
        m = ms_by_id.get(item_id)
        return (m["name"], m["date"], m["date"], m["external_key"]) if m else None

    conflicts = []
    for d in conn.execute("SELECT * FROM dependencies WHERE project_id = ?", (pid,)):
        pred = endpoint(d["pred_type"], d["pred_id"])
        succ = endpoint(d["succ_type"], d["succ_id"])
        if not pred or not succ or not pred[2] or not succ[1]:
            continue
        if succ[1] < pred[2]:
            conflicts.append({
                "dependency_id": d["id"],
                "predecessor": pred[3] or pred[0], "predecessor_end": pred[2],
                "successor": succ[3] or succ[0], "successor_start": succ[1],
            })

    task_fields = ("id", "external_key", "title", "owner", "end_date", "status_name",
                   "phase_name", "estimated_hours", "logged_hours")
    slim = lambda ts: [{k: t[k] for k in task_fields} for t in ts]
    return {
        "project": dict(project),
        "budget_hours": budget,
        "allocated_hours": round(allocated, 2),
        "reserve_hours": round(budget - allocated, 2),
        "logged_total_hours": round(logged_total, 2),
        "logged_task_hours": round(logged_tasks, 2),
        "logged_overhead_hours": round(logged_overhead, 2),
        "remaining_budget_hours": round(budget - logged_total, 2),
        "burn_pct": round(100 * logged_total / budget, 1) if budget else 0,
        "completion_pct": completion_pct,
        "task_count": len(tasks),
        "done_count": sum(1 for t in tasks if t["is_done"]),
        "by_phase": by_phase,
        "by_overhead": [{"name": o["name"], "tag": o["tag"],
                         "logged_hours": o["logged_hours"]} for o in overhead],
        "burnup": burnup,
        "overdue": slim(overdue),
        "upcoming": slim(upcoming),
        "conflicts": conflicts,
        "today": today,
    }


@router.get("/projects/{pid}/stats")
def project_stats(pid: int, conn=Depends(get_db)):
    return compute_stats(conn, pid)
