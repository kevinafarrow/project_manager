import { useMemo, useState } from 'react'
import { useAction, useApp } from '../state'
import { api } from '../api'
import TaskDrawer from '../components/TaskDrawer'
import { IconPlus } from '../icons'

export default function TasksPage() {
  const { current, toast } = useApp()
  const run = useAction()
  const [selected, setSelected] = useState<number | null>(null)
  const [phaseFilter, setPhaseFilter] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newPhase, setNewPhase] = useState<number | ''>('')

  const filtered = useMemo(() => {
    if (!current) return []
    const q = search.trim().toLowerCase()
    return current.tasks.filter((t) => {
      if (phaseFilter !== 'all' && t.phase_id !== phaseFilter) return false
      if (statusFilter !== 'all' && t.status_id !== statusFilter) return false
      if (q && !`${t.external_key} ${t.title} ${t.owner} ${t.tag}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [current, phaseFilter, statusFilter, search])

  if (!current) return <div className="empty-note">Select or create a project first.</div>

  const phaseName = (id: number | null) => current.phases.find((p) => p.id === id)?.name ?? '—'
  const doneIds = new Set(current.statuses.filter((s) => s.is_done).map((s) => s.id))

  const createTask = () => {
    if (!newTitle.trim()) { toast('Title is required', true); return }
    run(() => api.createTask(current.project.id, {
      title: newTitle.trim(), external_key: newKey.trim(),
      phase_id: newPhase === '' ? null : newPhase,
    }), 'Task created').then((ok) => {
      if (ok) { setNewTitle(''); setNewKey(''); setCreating(false) }
    })
  }

  return (
    <>
      <div className="page-head">
        <h1>Tasks — {current.project.name}</h1>
        <span className="badge neutral">{filtered.length} of {current.tasks.length}</span>
        <div className="spacer" />
        <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
          <option value="all">All phases</option>
          {current.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
          <option value="all">All statuses</option>
          {current.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="btn primary" onClick={() => setCreating(true)}><IconPlus size={14} /> New task</button>
      </div>

      {creating && (
        <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ marginBottom: 0, flex: 2, minWidth: 220 }}>
            <label>Title</label>
            <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createTask()} />
          </div>
          <div className="field" style={{ marginBottom: 0, maxWidth: 120 }}>
            <label>Ref key</label>
            <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="CC1.2" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Phase</label>
            <select value={newPhase} onChange={(e) => setNewPhase(e.target.value ? Number(e.target.value) : '')}>
              <option value="">(none)</option>
              {current.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button className="btn primary" onClick={createTask}>Create</button>
          <button className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
        </div>
      )}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead>
            <tr>
              <th>Ref</th><th>Task</th><th>Phase</th><th>Status</th><th>Owner</th>
              <th>Due</th><th className="num">Budget h</th><th className="num">Logged h</th>
              <th>Burn</th><th>Checklist</th><th>Tag</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const burn = t.estimated_hours > 0 ? t.logged_hours / t.estimated_hours : 0
              const checked = t.checklist.filter((c) => c.done).length
              const done = t.status_id != null && doneIds.has(t.status_id)
              const overdue = !done && t.end_date != null && t.end_date < current.today
              return (
                <tr key={t.id} className="clickable" onClick={() => setSelected(t.id)}>
                  <td className="mono">{t.external_key || '—'}</td>
                  <td style={{ maxWidth: 340 }}>{t.title}</td>
                  <td>{phaseName(t.phase_id)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      value={t.status_id ?? ''}
                      onChange={(e) => run(() => api.updateTask(t.id, { status_id: e.target.value ? Number(e.target.value) : null }))}
                      style={{ padding: '3px 6px', fontSize: 12.5 }}
                    >
                      {current.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td>{t.owner || '—'}</td>
                  <td className={overdue ? 'error-text' : ''}>{t.end_date ?? '—'}</td>
                  <td className="num">{t.estimated_hours}</td>
                  <td className="num">{t.logged_hours}</td>
                  <td>
                    <div className="meter" title={`${Math.round(burn * 100)}%`}>
                      <i className={burn > 1 ? 'over' : ''} style={{ width: `${Math.min(100, burn * 100)}%` }} />
                    </div>
                  </td>
                  <td>{t.checklist.length ? `${checked}/${t.checklist.length}` : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="tag-chip" title="Copy tag"
                      onClick={() => { navigator.clipboard.writeText(t.tag); toast(`Copied ${t.tag}`) }}>
                      {t.tag}
                    </button>
                  </td>
                </tr>
              )
            })}
            {!filtered.length && (
              <tr><td colSpan={11} className="empty-note">No tasks match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {selected != null && (
        <TaskDrawer data={current} taskId={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
