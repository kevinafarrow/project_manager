"""Self-contained HTML status report for stakeholders."""
import html
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse

from .db import get_db
from .stats import compute_stats

router = APIRouter()

CSS = """
:root { --ink:#1a2233; --muted:#5c6784; --line:#dfe4ee; --accent:#3454d1;
        --ok:#2e7d54; --warn:#b3261e; --bg:#ffffff; --panel:#f6f8fc; }
* { box-sizing:border-box; margin:0; }
body { font:15px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
       color:var(--ink); background:var(--bg); max-width:860px; margin:0 auto;
       padding:48px 32px; }
h1 { font-size:24px; letter-spacing:-.01em; }
h2 { font-size:16px; margin:36px 0 12px; text-transform:uppercase;
     letter-spacing:.06em; color:var(--muted); }
.sub { color:var(--muted); margin-top:4px; }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
         gap:12px; margin-top:24px; }
.tile { background:var(--panel); border:1px solid var(--line); border-radius:10px;
        padding:14px 16px; }
.tile .v { font-size:22px; font-weight:650; font-variant-numeric:tabular-nums; }
.tile .l { font-size:12px; color:var(--muted); margin-top:2px; }
table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
th { text-align:left; font-size:12px; color:var(--muted); font-weight:600;
     padding:6px 10px; border-bottom:1px solid var(--line); }
td { padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
td.num, th.num { text-align:right; }
.bar { background:var(--line); border-radius:99px; height:8px; min-width:120px;
       overflow:hidden; }
.bar i { display:block; height:100%; background:var(--accent); border-radius:99px; }
.warn { color:var(--warn); }
.ok { color:var(--ok); }
.empty { color:var(--muted); font-style:italic; padding:8px 10px; }
footer { margin-top:40px; color:var(--muted); font-size:12px;
         border-top:1px solid var(--line); padding-top:12px; }
@media print { body { padding:0; } }
"""


def esc(v) -> str:
    return html.escape(str(v if v is not None else ""))


def _task_rows(tasks, hl_date=False) -> str:
    if not tasks:
        return '<tr><td colspan="5" class="empty">None</td></tr>'
    cls = ' class="warn"' if hl_date else ""
    return "".join(
        f"<tr><td>{esc(t['external_key'] or '—')}</td><td>{esc(t['title'])}</td>"
        f"<td>{esc(t['owner'])}</td><td>{esc(t['status_name'] or '—')}</td>"
        f"<td{cls}>{esc(t['end_date'])}</td></tr>"
        for t in tasks)


@router.get("/projects/{pid}/report", response_class=HTMLResponse)
def status_report(pid: int, conn=Depends(get_db)):
    s = compute_stats(conn, pid)
    p = s["project"]

    since = (date.today() - timedelta(days=14)).isoformat()
    recent_done = [dict(r) for r in conn.execute(
        "SELECT t.external_key, t.title, t.owner FROM tasks t "
        "JOIN statuses st ON t.status_id = st.id "
        "WHERE t.project_id = ? AND st.is_done = 1 AND t.updated_at >= ? "
        "ORDER BY t.updated_at DESC", (pid, since))]
    recent_notes = [dict(r) for r in conn.execute(
        "SELECT entry_date, hours, person, note FROM time_entries "
        "WHERE project_id = ? AND entry_date >= ? AND note != '' "
        "ORDER BY entry_date DESC LIMIT 12", (pid, since))]

    phase_rows = "".join(
        f"<tr><td>{esc(ph['phase'])}</td>"
        f"<td class='num'>{ph['done_count']}/{ph['task_count']}</td>"
        f"<td class='num'>{ph['estimated_hours']:g}</td>"
        f"<td class='num'>{ph['logged_hours']:g}</td>"
        f"<td><div class='bar'><i style='width:{min(100, round(100 * ph['done_estimated_hours'] / ph['estimated_hours']) if ph['estimated_hours'] else 0)}%'></i></div></td></tr>"
        for ph in s["by_phase"])
    overhead_rows = "".join(
        f"<tr><td>{esc(o['name'])}</td><td class='num'>{o['logged_hours']:g}</td></tr>"
        for o in s["by_overhead"] if o["logged_hours"]) or \
        '<tr><td colspan="2" class="empty">No overhead hours logged</td></tr>'
    done_rows = "".join(
        f"<tr><td>{esc(t['external_key'] or '—')}</td><td>{esc(t['title'])}</td>"
        f"<td>{esc(t['owner'])}</td></tr>" for t in recent_done) or \
        '<tr><td colspan="3" class="empty">None in the last 14 days</td></tr>'
    note_rows = "".join(
        f"<tr><td>{esc(n['entry_date'])}</td><td class='num'>{n['hours']:g}</td>"
        f"<td>{esc(n['person'])}</td><td>{esc(n['note'])}</td></tr>"
        for n in recent_notes) or \
        '<tr><td colspan="4" class="empty">No annotated entries in the last 14 days</td></tr>'

    burn_cls = "warn" if s["burn_pct"] > s["completion_pct"] + 15 else "ok"
    doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Status Report — {esc(p['name'])}</title><style>{CSS}</style></head><body>
<h1>{esc(p['name'])} — Status Report</h1>
<div class="sub">Project {esc(p['code'])} · Generated {esc(s['today'])}</div>
<div class="tiles">
  <div class="tile"><div class="v">{s['completion_pct']:g}%</div><div class="l">Work complete (hours-weighted)</div></div>
  <div class="tile"><div class="v {burn_cls}">{s['burn_pct']:g}%</div><div class="l">Budget burned</div></div>
  <div class="tile"><div class="v">{s['logged_total_hours']:g} / {s['budget_hours']:g}h</div><div class="l">Hours logged vs budget</div></div>
  <div class="tile"><div class="v">{s['done_count']} / {s['task_count']}</div><div class="l">Tasks done</div></div>
  <div class="tile"><div class="v">{s['reserve_hours']:g}h</div><div class="l">Unallocated reserve</div></div>
</div>
<h2>Progress by phase</h2>
<table><tr><th>Phase</th><th class="num">Tasks done</th><th class="num">Est. h</th><th class="num">Logged h</th><th>Completion</th></tr>{phase_rows}</table>
<h2>Overdue items ({len(s['overdue'])})</h2>
<table><tr><th>Ref</th><th>Task</th><th>Owner</th><th>Status</th><th>Due</th></tr>{_task_rows(s['overdue'], hl_date=True)}</table>
<h2>Due in the next 14 days ({len(s['upcoming'])})</h2>
<table><tr><th>Ref</th><th>Task</th><th>Owner</th><th>Status</th><th>Due</th></tr>{_task_rows(s['upcoming'])}</table>
<h2>Recently completed</h2>
<table><tr><th>Ref</th><th>Task</th><th>Owner</th></tr>{done_rows}</table>
<h2>Recent activity notes</h2>
<table><tr><th>Date</th><th class="num">Hours</th><th>Person</th><th>Note</th></tr>{note_rows}</table>
<h2>Overhead hours</h2>
<table><tr><th>Category</th><th class="num">Logged h</th></tr>{overhead_rows}</table>
<footer>Task hours: {s['logged_task_hours']:g}h · Overhead: {s['logged_overhead_hours']:g}h ·
Allocated to tasks: {s['allocated_hours']:g}h of {s['budget_hours']:g}h budget ·
Remaining budget: {s['remaining_budget_hours']:g}h</footer>
</body></html>"""
    return HTMLResponse(doc)
