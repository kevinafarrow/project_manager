import { useMemo, useRef, useState } from 'react'
import type { FullProject, Milestone, Task } from '../types'
import { addDays, diffDays, fmtMonth, fmtShort, isWeekend, monthStart, todayISO } from '../dates'
import { api } from '../api'
import { useAction } from '../state'

export type Zoom = 'day' | 'week' | 'month'
const PX: Record<Zoom, number> = { day: 34, week: 13, month: 4.6 }
const ROW_H = 34
const PHASE_H = 30
const MS_LANE_H = 38
const HEADER_H = 46
const BAR_H = 20

interface Row {
  kind: 'phase' | 'task'
  y: number
  h: number
  phaseName?: string
  task?: Task
}

interface DragState {
  taskId: number
  mode: 'move' | 'start' | 'end'
  originX: number
  origStart: string
  origEnd: string
  deltaDays: number
  moved: boolean
}

function fmtH(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}

export default function Gantt({
  data, zoom, onSelectTask,
}: {
  data: FullProject
  zoom: Zoom
  onSelectTask: (t: Task) => void
}) {
  const run = useAction()
  const [drag, setDrag] = useState<DragState | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const didAutoScroll = useRef(false)
  const pxDay = PX[zoom]
  const today = data.today || todayISO()

  const { tasks, phases, milestones, dependencies, statuses } = data
  const doneStatusIds = useMemo(
    () => new Set(statuses.filter((s) => s.is_done).map((s) => s.id)),
    [statuses],
  )

  // ---- date range ----
  const [rangeStart, totalDays] = useMemo(() => {
    const dates: string[] = []
    tasks.forEach((t) => { if (t.start_date) dates.push(t.start_date); if (t.end_date) dates.push(t.end_date) })
    milestones.forEach((m) => dates.push(m.date))
    dates.push(today)
    const min = dates.reduce((a, b) => (a < b ? a : b))
    const max = dates.reduce((a, b) => (a > b ? a : b))
    const start = addDays(min, -7)
    return [start, diffDays(start, addDays(max, 15))]
  }, [tasks, milestones, today])

  const x = (iso: string) => diffDays(rangeStart, iso) * pxDay
  const width = totalDays * pxDay

  // ---- rows ----
  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    let y = HEADER_H + (milestones.length ? MS_LANE_H : 0)
    const groups: { name: string; tasks: Task[] }[] = phases
      .map((p) => ({ name: p.name, tasks: tasks.filter((t) => t.phase_id === p.id) }))
    const orphans = tasks.filter((t) => t.phase_id == null || !phases.some((p) => p.id === t.phase_id))
    if (orphans.length) groups.push({ name: 'No phase', tasks: orphans })
    for (const g of groups) {
      if (!g.tasks.length) continue
      out.push({ kind: 'phase', y, h: PHASE_H, phaseName: g.name })
      y += PHASE_H
      for (const t of g.tasks) {
        out.push({ kind: 'task', y, h: ROW_H, task: t })
        y += ROW_H
      }
    }
    return out
  }, [phases, tasks, milestones.length])

  const totalH = rows.length
    ? rows[rows.length - 1].y + rows[rows.length - 1].h + 10
    : HEADER_H + 60

  // Effective (possibly drag-adjusted) dates for a task.
  const effDates = (t: Task): [string | null, string | null] => {
    if (!drag || drag.taskId !== t.id) return [t.start_date, t.end_date]
    const d = drag.deltaDays
    if (drag.mode === 'move') return [addDays(drag.origStart, d), addDays(drag.origEnd, d)]
    if (drag.mode === 'start') {
      const s = addDays(drag.origStart, d)
      return [s <= drag.origEnd ? s : drag.origEnd, drag.origEnd]
    }
    const e = addDays(drag.origEnd, d)
    return [drag.origStart, e >= drag.origStart ? e : drag.origStart]
  }

  const taskRowByid = useMemo(() => {
    const m = new Map<number, Row>()
    rows.forEach((r) => { if (r.kind === 'task' && r.task) m.set(r.task.id, r) })
    return m
  }, [rows])
  const msById = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones])

  // ---- drag handlers ----
  const startDrag = (e: React.PointerEvent, t: Task, mode: DragState['mode']) => {
    if (!t.start_date || !t.end_date) return
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    setDrag({
      taskId: t.id, mode, originX: e.clientX,
      origStart: t.start_date, origEnd: t.end_date, deltaDays: 0, moved: false,
    })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const dx = e.clientX - drag.originX
    const dd = Math.round(dx / pxDay)
    if (dd !== drag.deltaDays || Math.abs(dx) > 4) {
      setDrag({ ...drag, deltaDays: dd, moved: drag.moved || Math.abs(dx) > 4 })
    }
  }
  const endDrag = (t: Task) => {
    if (!drag) return
    const wasDrag = drag.moved
    const [s, en] = effDates(t)
    const changed = s !== t.start_date || en !== t.end_date
    setDrag(null)
    if (!wasDrag) {
      onSelectTask(t)
    } else if (changed) {
      run(() => api.updateTask(t.id, { start_date: s, end_date: en }),
        `Rescheduled ${t.external_key || t.title}`)
    }
  }

  // ---- dependency geometry ----
  type Pt = { x: number; y: number } | null
  const predPoint = (kind: string, id: number): Pt => {
    if (kind === 'task') {
      const r = taskRowByid.get(id)
      const t = r?.task
      if (!r || !t) return null
      const [s, e] = effDates(t)
      if (!s || !e) return null
      return { x: x(e) + pxDay, y: r.y + r.h / 2 }
    }
    const m = msById.get(id)
    return m ? { x: x(m.date) + pxDay / 2, y: HEADER_H + MS_LANE_H / 2 } : null
  }
  const succPoint = (kind: string, id: number): Pt => {
    if (kind === 'task') {
      const r = taskRowByid.get(id)
      const t = r?.task
      if (!r || !t) return null
      const [s] = effDates(t)
      if (!s) return null
      return { x: x(s), y: r.y + r.h / 2 }
    }
    const m = msById.get(id)
    return m ? { x: x(m.date) + pxDay / 2, y: HEADER_H + MS_LANE_H / 2 } : null
  }
  const depDate = (kind: string, id: number, which: 'end' | 'start'): string | null => {
    if (kind === 'task') {
      const t = taskRowByid.get(id)?.task
      if (!t) return null
      const [s, e] = effDates(t)
      return which === 'end' ? e : s
    }
    return msById.get(id)?.date ?? null
  }

  // ---- header ticks ----
  const months: { x: number; label: string }[] = []
  {
    let m = monthStart(rangeStart)
    if (m < rangeStart) m = monthStart(addDays(rangeStart, 32))
    let cur = monthStart(addDays(rangeStart, 0))
    // first partial month label at range start
    months.push({ x: 0, label: fmtMonth(rangeStart) })
    cur = monthStart(addDays(cur, 35))
    while (diffDays(rangeStart, cur) < totalDays) {
      months.push({ x: x(cur), label: fmtMonth(cur) })
      cur = monthStart(addDays(cur, 35))
    }
  }
  const dayTicks: { iso: string; px: number }[] = []
  if (zoom !== 'month') {
    for (let i = 0; i < totalDays; i++) {
      const iso = addDays(rangeStart, i)
      if (zoom === 'day' || parseInt(iso.slice(8), 10) % 7 === 1 || iso === rangeStart) {
        dayTicks.push({ iso, px: i * pxDay })
      }
    }
  }

  // grid lines
  const grid: number[] = []
  const gridStep = zoom === 'day' ? 1 : 7
  if (zoom !== 'month') {
    for (let i = 0; i < totalDays; i += gridStep) grid.push(i * pxDay)
  } else {
    months.forEach((m) => grid.push(m.x))
  }

  // auto-scroll to today once
  const todayX = x(today)
  if (scrollRef.current && !didAutoScroll.current) {
    didAutoScroll.current = true
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ left: Math.max(0, todayX - 260) })
    })
  }

  const accent = 'var(--accent)'

  return (
    <div className="gantt-wrap">
      {/* ------- names column ------- */}
      <div className="gantt-names">
        <div style={{ height: HEADER_H, borderBottom: '1px solid var(--line)' }} />
        {milestones.length > 0 && (
          <div className="gantt-phase-row" style={{ height: MS_LANE_H }}>Milestones</div>
        )}
        {rows.map((r, i) =>
          r.kind === 'phase' ? (
            <div key={i} className="gantt-phase-row" style={{ height: r.h }}>{r.phaseName}</div>
          ) : (
            <div
              key={i}
              className="gantt-row-name"
              style={{ height: r.h }}
              onClick={() => r.task && onSelectTask(r.task)}
              title={r.task!.title}
            >
              <StatusDot task={r.task!} today={today} doneIds={doneStatusIds} />
              {r.task!.external_key && <span className="key">{r.task!.external_key}</span>}
              <span className="nm">{r.task!.title}</span>
            </div>
          ),
        )}
      </div>

      {/* ------- timeline ------- */}
      <div className="gantt-scroll" ref={scrollRef}>
        <svg width={width} height={totalH} style={{ display: 'block' }}>
          <defs>
            <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0.5 8 4 0 7.5Z" fill="var(--ink-3)" />
            </marker>
            <marker id="arr-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0.5 8 4 0 7.5Z" fill="var(--danger)" />
            </marker>
          </defs>

          {/* weekend shading */}
          {zoom !== 'month' &&
            Array.from({ length: totalDays }, (_, i) => i)
              .filter((i) => isWeekend(addDays(rangeStart, i)))
              .map((i) => (
                <rect key={i} x={i * pxDay} y={HEADER_H} width={pxDay} height={totalH - HEADER_H}
                  fill="var(--ink-3)" opacity={0.07} />
              ))}

          {/* grid */}
          {grid.map((gx, i) => (
            <line key={i} x1={gx} y1={HEADER_H} x2={gx} y2={totalH} stroke="var(--line-2)" />
          ))}

          {/* header */}
          {months.map((m, i) => (
            <text key={i} x={m.x + 6} y={17} fontSize={12} fontWeight={700} fill="var(--ink-2)">
              {m.label}
            </text>
          ))}
          {dayTicks.map((t) => (
            <text key={t.iso} x={t.px + 4} y={37} fontSize={10.5} fill="var(--ink-3)">
              {zoom === 'day' ? parseInt(t.iso.slice(8), 10) : fmtShort(t.iso)}
            </text>
          ))}
          <line x1={0} y1={HEADER_H} x2={width} y2={HEADER_H} stroke="var(--line)" />

          {/* phase band backgrounds */}
          {rows.filter((r) => r.kind === 'phase').map((r, i) => (
            <rect key={i} x={0} y={r.y} width={width} height={r.h} fill="var(--panel-2)" />
          ))}

          {/* milestone vertical guides */}
          {milestones.map((m) => (
            <line key={m.id} x1={x(m.date) + pxDay / 2} y1={HEADER_H} x2={x(m.date) + pxDay / 2}
              y2={totalH} stroke="var(--ink-3)" strokeDasharray="3 5" opacity={0.5} />
          ))}

          {/* today */}
          <line x1={todayX + pxDay / 2} y1={HEADER_H} x2={todayX + pxDay / 2} y2={totalH}
            stroke={accent} strokeWidth={1.5} />
          <g style={{ pointerEvents: 'none' }}>
            <rect x={todayX + pxDay / 2 - 22} y={HEADER_H + 3} width={44} height={15} rx={7}
              fill={accent} />
            <text x={todayX + pxDay / 2} y={HEADER_H + 14} fontSize={9.5} fontWeight={700}
              fill="var(--accent-ink)" textAnchor="middle">
              TODAY
            </text>
          </g>

          {/* dependencies */}
          {dependencies.map((d) => {
            const a = predPoint(d.pred_type, d.pred_id)
            const b = succPoint(d.succ_type, d.succ_id)
            if (!a || !b) return null
            const pe = depDate(d.pred_type, d.pred_id, 'end')
            const ss = depDate(d.succ_type, d.succ_id, 'start')
            const conflict = pe != null && ss != null && ss < pe
            const bend = Math.max(18, Math.min(46, (b.x - a.x) / 2))
            return (
              <path
                key={d.id}
                d={`M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x - 2} ${b.y}`}
                fill="none"
                stroke={conflict ? 'var(--danger)' : 'var(--ink-3)'}
                strokeWidth={conflict ? 1.8 : 1.2}
                opacity={conflict ? 0.95 : 0.55}
                markerEnd={conflict ? 'url(#arr-bad)' : 'url(#arr)'}
              >
                {conflict && (
                  <title>{`Conflict: starts ${ss} before predecessor ends ${pe}`}</title>
                )}
              </path>
            )
          })}

          {/* milestones */}
          {milestones.map((m) => (
            <MilestoneDiamond key={m.id} m={m} cx={x(m.date) + pxDay / 2} cy={HEADER_H + MS_LANE_H / 2} />
          ))}

          {/* task bars */}
          {rows.map((r) => {
            if (r.kind !== 'task' || !r.task) return null
            const t = r.task
            const [s, e] = effDates(t)
            const cy = r.y + r.h / 2
            if (!s || !e) {
              return (
                <text key={t.id} x={8} y={cy + 4} fontSize={11} fill="var(--ink-3)" fontStyle="italic">
                  unscheduled
                </text>
              )
            }
            const bx = x(s)
            const bw = Math.max(pxDay, (diffDays(s, e) + 1) * pxDay)
            const done = t.status_id != null && doneStatusIds.has(t.status_id)
            const overdue = !done && e < today
            const over = t.estimated_hours > 0 && t.logged_hours > t.estimated_hours
            const burnFrac = t.estimated_hours > 0
              ? Math.min(1, t.logged_hours / t.estimated_hours)
              : (t.logged_hours > 0 ? 1 : 0)
            const base = done ? 'var(--ok)' : overdue ? 'var(--danger)' : accent
            const label = `${fmtH(t.estimated_hours)}h${t.logged_hours ? ` · ${fmtH(t.logged_hours)} logged` : ''}`
            return (
              <g
                key={t.id}
                onPointerMove={onMove}
                onPointerUp={() => endDrag(t)}
                style={{ cursor: drag?.taskId === t.id && drag.moved ? 'grabbing' : 'pointer' }}
              >
                <title>{`${t.external_key ? t.external_key + ' — ' : ''}${t.title}\n${s} → ${e}\nBudget ${fmtH(t.estimated_hours)}h · Logged ${fmtH(t.logged_hours)}h`}</title>
                <rect x={bx} y={cy - BAR_H / 2} width={bw} height={BAR_H} rx={6}
                  fill={base} opacity={0.22}
                  stroke={overdue ? 'var(--danger)' : 'none'} strokeWidth={1.4}
                  onPointerDown={(ev) => startDrag(ev, t, 'move')}
                />
                {burnFrac > 0 && (
                  <rect x={bx} y={cy - BAR_H / 2} width={Math.max(4, bw * burnFrac)} height={BAR_H}
                    rx={6} fill={over ? 'var(--danger)' : base} opacity={0.9}
                    style={{ pointerEvents: 'none' }} />
                )}
                {bw > 40 && (
                  <rect x={bx} y={cy - BAR_H / 2} width={bw} height={BAR_H} rx={6}
                    fill="none" stroke={base} opacity={0.35} style={{ pointerEvents: 'none' }} />
                )}
                {/* resize handles */}
                <rect x={bx - 3} y={cy - BAR_H / 2} width={7} height={BAR_H} fill="transparent"
                  style={{ cursor: 'ew-resize' }} onPointerDown={(ev) => startDrag(ev, t, 'start')} />
                <rect x={bx + bw - 4} y={cy - BAR_H / 2} width={7} height={BAR_H} fill="transparent"
                  style={{ cursor: 'ew-resize' }} onPointerDown={(ev) => startDrag(ev, t, 'end')} />
                <text x={bx + bw + 7} y={cy + 3.5} fontSize={11} fill="var(--ink-2)"
                  style={{ pointerEvents: 'none' }}>
                  {label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function StatusDot({ task, today, doneIds }: { task: Task; today: string; doneIds: Set<number> }) {
  const done = task.status_id != null && doneIds.has(task.status_id)
  const overdue = !done && task.end_date != null && task.end_date < today
  const color = done ? 'var(--ok)' : overdue ? 'var(--danger)' : 'var(--ink-3)'
  return (
    <span style={{
      width: 8, height: 8, borderRadius: 99, background: color, flex: 'none', display: 'inline-block',
    }} />
  )
}

function MilestoneDiamond({ m, cx, cy }: { m: Milestone; cx: number; cy: number }) {
  const r = 7
  return (
    <g>
      <title>{`${m.name} — ${m.date}`}</title>
      <path
        d={`M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`}
        fill="var(--amber)"
        stroke="var(--panel)"
        strokeWidth={1.5}
      />
      <text x={cx + r + 5} y={cy + 4} fontSize={11} fontWeight={600} fill="var(--ink-2)">
        {m.name} · {fmtShort(m.date)}
      </text>
    </g>
  )
}
