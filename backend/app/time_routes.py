"""Time entry endpoints, including bulk ingest of tagged timesheet lines."""
import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .db import get_db
from .tags import resolve_tag

router = APIRouter()

DATE_FORMATS = ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d %b %Y", "%b %d %Y", "%b %d, %Y")


def parse_date(raw: str) -> str | None:
    raw = raw.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_hours(raw: str) -> float | None:
    raw = raw.strip().lower().removesuffix("h")
    if ":" in raw:  # 3:30 -> 3.5
        try:
            h, m = raw.split(":", 1)
            return round(int(h) + int(m) / 60, 2)
        except ValueError:
            return None
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if 0 < value <= 24 else None


class EntryIn(BaseModel):
    target_type: str = Field(pattern="^(task|overhead)$")
    target_id: int
    entry_date: str
    hours: float = Field(gt=0, le=24)
    person: str = ""
    note: str = ""


class IngestIn(BaseModel):
    text: str
    commit: bool = False


@router.get("/projects/{pid}/time-entries")
def list_entries(pid: int, conn=Depends(get_db)):
    tag_of = {("task", r["id"]): (r["tag"], r["title"]) for r in conn.execute(
        "SELECT id, tag, title FROM tasks WHERE project_id = ?", (pid,))}
    tag_of.update({("overhead", r["id"]): (r["tag"], r["name"]) for r in conn.execute(
        "SELECT id, tag, name FROM overhead_categories WHERE project_id = ?", (pid,))})
    entries = []
    for r in conn.execute(
        "SELECT * FROM time_entries WHERE project_id = ? ORDER BY entry_date DESC, id DESC",
        (pid,),
    ):
        e = dict(r)
        tag, label = tag_of.get((r["target_type"], r["target_id"]), ("(deleted)", "(deleted)"))
        e["tag"], e["target_label"] = tag, label
        entries.append(e)
    return entries


@router.post("/projects/{pid}/time-entries", status_code=201)
def create_entry(pid: int, body: EntryIn, conn=Depends(get_db)):
    table = "tasks" if body.target_type == "task" else "overhead_categories"
    row = conn.execute(
        f"SELECT project_id FROM {table} WHERE id = ?", (body.target_id,)).fetchone()
    if row is None or row["project_id"] != pid:
        raise HTTPException(400, f"{body.target_type} {body.target_id} not found in project {pid}")
    if parse_date(body.entry_date) is None:
        raise HTTPException(400, f"unparseable date '{body.entry_date}'")
    cur = conn.execute(
        "INSERT INTO time_entries (project_id, target_type, target_id, entry_date, hours, person, note) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (pid, body.target_type, body.target_id, parse_date(body.entry_date),
         body.hours, body.person, body.note),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM time_entries WHERE id = ?", (cur.lastrowid,)).fetchone())


@router.delete("/time-entries/{item_id}", status_code=204)
def delete_entry(item_id: int, conn=Depends(get_db)):
    if conn.execute("SELECT 1 FROM time_entries WHERE id = ?", (item_id,)).fetchone() is None:
        raise HTTPException(404, "entry not found")
    conn.execute("DELETE FROM time_entries WHERE id = ?", (item_id,))
    conn.commit()


@router.post("/projects/{pid}/time-entries/ingest")
def ingest_entries(pid: int, body: IngestIn, conn=Depends(get_db)):
    """Parse pasted timesheet lines: TAG, DATE, HOURS[, PERSON[, NOTE]].

    Comma- or tab-separated; note may contain commas. Returns a row-by-row
    preview; inserts the valid rows only when commit=true.
    """
    if conn.execute("SELECT 1 FROM projects WHERE id = ?", (pid,)).fetchone() is None:
        raise HTTPException(404, f"project {pid} not found")
    rows = []
    for lineno, line in enumerate(body.text.splitlines(), start=1):
        if not line.strip() or line.strip().startswith("#"):
            continue
        delim = "\t" if "\t" in line else ","
        fields = next(csv.reader(io.StringIO(line), delimiter=delim))
        fields = [f.strip() for f in fields]
        row = {"line": lineno, "raw": line.strip(), "errors": []}
        if len(fields) < 3:
            row["errors"].append("need at least TAG, DATE, HOURS")
            rows.append(row)
            continue
        raw_tag, raw_date, raw_hours = fields[0], fields[1], fields[2]
        row["person"] = fields[3] if len(fields) > 3 else ""
        # Anything past the 4th comma belongs to the note.
        row["note"] = ", ".join(fields[4:]) if len(fields) > 4 else ""

        target_type, target_id, resolved = resolve_tag(conn, pid, raw_tag)
        if target_type is None:
            row["errors"].append(resolved)
        else:
            row.update(target_type=target_type, target_id=target_id, tag=resolved)
        entry_date = parse_date(raw_date)
        if entry_date is None:
            row["errors"].append(f"unparseable date '{raw_date}'")
        else:
            row["entry_date"] = entry_date
        hours = parse_hours(raw_hours)
        if hours is None:
            row["errors"].append(f"unparseable hours '{raw_hours}' (expect e.g. 3.5, 3:30)")
        else:
            row["hours"] = hours
        rows.append(row)

    valid = [r for r in rows if not r["errors"]]
    if body.commit:
        for r in valid:
            conn.execute(
                "INSERT INTO time_entries (project_id, target_type, target_id, entry_date, hours, person, note) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (pid, r["target_type"], r["target_id"], r["entry_date"], r["hours"],
                 r["person"], r["note"]),
            )
        conn.commit()
    return {
        "rows": rows,
        "valid_count": len(valid),
        "error_count": len(rows) - len(valid),
        "total_hours": round(sum(r["hours"] for r in valid), 2),
        "committed": body.commit,
    }
