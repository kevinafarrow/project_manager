import { useEffect, useState } from 'react'
import { useApp } from '../state'
import { api } from '../api'
import type { Stats } from '../types'
import BurnupChart from '../components/BurnupChart'
import { IconWarn } from '../icons'

function fmtH(n: number): string {
  return String(Math.round(n * 10) / 10)
}

export default function DashboardPage() {
  const { current, toast } = useApp()
  const [stats, setStats] = useState<Stats | null>(null)
  const pid = current?.project.id

  useEffect(() => {
    if (pid == null) { setStats(null); return }
    api.stats(pid).then(setStats).catch((e) => toast(String(e), true))
  }, [pid, current, toast])

  if (!current || pid == null) return <div className="empty-note">Select or create a project first.</div>
  if (!stats) return <div className="empty-note">Loading…</div>

  const burnAhead = stats.burn_pct - stats.completion_pct
  const burnTone = stats.burn_pct > 100 ? 'danger' : burnAhead > 15 ? 'amber' : 'ok'

  return (
    <>
      <div className="page-head">
        <h1>Dashboard — {stats.project.name}</h1>
        <div className="spacer" />
        <a className="btn" href={`/api/projects/${pid}/report`} target="_blank" rel="noreferrer">
          Export status report
        </a>
      </div>

      <div className="tiles" style={{ marginBottom: 16 }}>
        <div className="card tile">
          <div className="v">{stats.completion_pct}%</div>
          <div className="l">Work complete</div>
          <div className="s">{stats.done_count} of {stats.task_count} tasks done (hours-weighted)</div>
        </div>
        <div className="card tile">
          <div className="v" style={{ color: `var(--${burnTone})` }}>{stats.burn_pct}%</div>
          <div className="l">Budget burned</div>
          <div className="s">{fmtH(stats.logged_total_hours)}h of {fmtH(stats.budget_hours)}h</div>
        </div>
        <div className="card tile">
          <div className="v">{fmtH(stats.remaining_budget_hours)}h</div>
          <div className="l">Budget remaining</div>
          <div className="s">tasks {fmtH(stats.logged_task_hours)}h · overhead {fmtH(stats.logged_overhead_hours)}h</div>
        </div>
        <div className="card tile">
          <div className="v">{fmtH(stats.allocated_hours)}h</div>
          <div className="l">Allocated to tasks</div>
          <div className="s">{fmtH(stats.reserve_hours)}h unallocated reserve</div>
        </div>
        <div className="card tile">
          <div className="v" style={{ color: stats.overdue.length ? 'var(--danger)' : 'var(--ok)' }}>
            {stats.overdue.length}
          </div>
          <div className="l">Overdue tasks</div>
          <div className="s">{stats.upcoming.length} due in the next 14 days</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(420px, 3fr) minmax(300px, 2fr)', alignItems: 'start', marginBottom: 16 }}>
        <div className="card card-pad">
          <h2>Hours burn-up</h2>
          <BurnupChart
            points={stats.burnup}
            budget={stats.budget_hours}
            allocated={stats.allocated_hours}
            today={stats.today}
          />
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="card card-pad">
            <h2>Progress by phase</h2>
            {stats.by_phase.map((ph) => {
              const pct = ph.estimated_hours
                ? Math.round((100 * ph.done_estimated_hours) / ph.estimated_hours) : 0
              return (
                <div key={ph.phase} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600 }}>{ph.phase}</span>
                    <span className="hint">
                      {ph.done_count}/{ph.task_count} tasks · {fmtH(ph.logged_hours)}h / {fmtH(ph.estimated_hours)}h · {pct}%
                    </span>
                  </div>
                  <div className="meter" style={{ height: 8 }}>
                    <i style={{ width: `${pct}%`, background: 'var(--chart-mark)' }} />
                  </div>
                </div>
              )
            })}
            {!stats.by_phase.length && <div className="empty-note">No phases yet.</div>}
          </div>

          <div className="card card-pad">
            <h2>Overhead hours</h2>
            {stats.by_overhead.map((o) => {
              const max = Math.max(...stats.by_overhead.map((x) => x.logged_hours), 1)
              return (
                <div key={o.tag} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                  <span style={{ width: 130, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                  <div className="meter" style={{ flex: 1, height: 8 }}>
                    <i style={{ width: `${(100 * o.logged_hours) / max}%`, background: 'var(--chart-mark)' }} />
                  </div>
                  <span className="hint" style={{ width: 42, textAlign: 'right' }}>{fmtH(o.logged_hours)}h</span>
                </div>
              )
            })}
            {!stats.by_overhead.length && <div className="empty-note">No overhead categories yet.</div>}
          </div>
        </div>
      </div>

      {stats.conflicts.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: 'var(--danger)' }}>
          <h2 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconWarn size={14} /> Dependency conflicts
          </h2>
          {stats.conflicts.map((c) => (
            <div key={c.dependency_id} style={{ fontSize: 13, padding: '3px 0' }}>
              <b>{c.successor}</b> starts {c.successor_start}, before <b>{c.predecessor}</b> ends {c.predecessor_end}
            </div>
          ))}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <TaskListCard title={`Overdue (${stats.overdue.length})`} tasks={stats.overdue} danger />
        <TaskListCard title={`Due in 14 days (${stats.upcoming.length})`} tasks={stats.upcoming} />
      </div>
    </>
  )
}

function TaskListCard({ title, tasks, danger }: {
  title: string
  tasks: Stats['overdue']
  danger?: boolean
}) {
  return (
    <div className="card card-pad">
      <h2>{title}</h2>
      {tasks.length === 0 && <div className="empty-note">None</div>}
      {tasks.length > 0 && (
        <table className="data">
          <thead><tr><th>Ref</th><th>Task</th><th>Owner</th><th>Status</th><th>Due</th></tr></thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td className="mono">{t.external_key || '—'}</td>
                <td style={{ maxWidth: 260 }}>{t.title}</td>
                <td>{t.owner || '—'}</td>
                <td>{t.status_name ?? '—'}</td>
                <td className={danger ? 'error-text' : ''}>{t.end_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
