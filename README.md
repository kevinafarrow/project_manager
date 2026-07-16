# Engagement PM

A local, single-user project management WebUI for infosec/compliance engagements
(SOC 2 readiness, pentests, …). FastAPI + SQLite backend, React/TypeScript/Vite
frontend with a custom SVG Gantt. Dark/light mode follows the system with a manual
toggle.

## Run

```bash
docker compose up -d --build   # recommended → http://localhost:42688
```

Or without Docker:

```bash
./run.sh            # builds frontend if needed, serves everything at http://localhost:42688
REBUILD=1 ./run.sh  # force a frontend rebuild
./dev.sh            # dev mode: uvicorn --reload + Vite HMR (UI at :5173, API at :42688)
```

The port is 42688 — "GANTT" on a phone keypad. Data lives in `data/pm.sqlite3`
(gitignored; mounted as a volume by docker-compose, so the container and local
runs share the same database). For local runs, Node is expected at
`~/.local/opt/node` (see `run.sh`).

## Concepts

- **Project** — one engagement, with a total hours budget (e.g. AmBit: 167.8h of
  YSecurity effort; client-internal hours are not tracked).
- **Phases** — editable groupings (Remediation / Observation Support / …) shown as
  Gantt swimlanes.
- **Tasks** — flat within a phase; manual start/end dates, budgeted hours, editable
  status list, a lightweight checklist, and an auto-generated time-tracking **tag**
  like `AMBIT-CC8.1-change-mgmt`.
- **Milestones** — dated diamonds on the Gantt; can participate in dependencies.
- **Dependencies** — draw arrows and flag conflicts (successor starts before
  predecessor ends). They never auto-move bars.
- **Overhead categories** — pure hour buckets (PM, meetings…) with tags like
  `AMBIT-OH-meetings`; count against the budget without appearing on the Gantt.

## Hours

Two paths: quick-add on any task/overhead row, or **bulk paste** on the Hours page —
one line per entry, `TAG, DATE, HOURS, PERSON, NOTE` (tab-separated also fine; tag
prefixes resolve; `3:30` means 3.5h). Preview shows per-line errors before commit.

## Importing a plan

The Import page accepts a `pm-import/v1` JSON artifact (schema + a copyable AI
prompt are on that page). Preview shows a full diff before commit. Re-imports
upsert by `external_key` and never touch logged hours, checklist ticks, or task
statuses. The AmBit seed artifact generated from the gap analysis lives at
`seed/ambit-soc2-typeii.json`.

## Reporting

Dashboard: budget burn vs completion, allocation vs reserve, per-phase progress,
burn-up chart, overdue/upcoming, dependency conflicts. **Export status report**
downloads a self-contained HTML snapshot suitable for client check-ins
(`GET /api/projects/{id}/report`).
