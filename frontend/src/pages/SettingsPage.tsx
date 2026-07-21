import { useEffect, useRef, useState } from 'react'
import { useAction, useApp } from '../state'
import { api } from '../api'
import { todayISO } from '../dates'

export default function SettingsPage() {
  const { current, currentId, selectProject, reloadProjects, toast } = useApp()
  const run = useAction()

  const restoreInput = useRef<HTMLInputElement>(null)
  const [restoring, setRestoring] = useState(false)
  const restore = async (file: File) => {
    if (!window.confirm(
      `Restore from "${file.name}"? This REPLACES the entire database — every project, ` +
      'task, and logged hour — with the contents of the backup. The current database is ' +
      'saved alongside it as pm.sqlite3.pre-restore first.')) return
    setRestoring(true)
    try {
      const { counts } = await api.restoreBackup(file)
      toast(`Restored ${counts.projects} project(s), ${counts.time_entries} time entries. Reloading…`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true)
      setRestoring(false)
    }
  }

  // project form
  const [pName, setPName] = useState('')
  const [pBudget, setPBudget] = useState('')
  const [pDesc, setPDesc] = useState('')
  useEffect(() => {
    setPName(current?.project.name ?? '')
    setPBudget(current ? String(current.project.total_budget_hours) : '')
    setPDesc(current?.project.description ?? '')
  }, [current])

  // new project form
  const [nCode, setNCode] = useState('')
  const [nName, setNName] = useState('')
  const [nBudget, setNBudget] = useState('')

  const [newPhase, setNewPhase] = useState('')
  const [newStatus, setNewStatus] = useState('')
  const [newOverhead, setNewOverhead] = useState('')
  const [newMsName, setNewMsName] = useState('')
  const [newMsDate, setNewMsDate] = useState(todayISO())

  const createProject = async () => {
    if (!nCode.trim() || !nName.trim()) { toast('Code and name are required', true); return }
    try {
      const p = await api.createProject({
        code: nCode.trim(), name: nName.trim(),
        total_budget_hours: parseFloat(nBudget) || 0,
      })
      await reloadProjects()
      selectProject(p.id)
      setNCode(''); setNName(''); setNBudget('')
      toast(`Project ${p.code} created`)
    } catch (e) { toast(e instanceof Error ? e.message : String(e), true) }
  }

  const saveProject = () => {
    if (!current) return
    run(() => api.updateProject(current.project.id, {
      name: pName, description: pDesc, total_budget_hours: parseFloat(pBudget) || 0,
    }), 'Project saved').then(() => reloadProjects())
  }

  const deleteProject = async () => {
    if (!current) return
    const p = current.project
    if (!window.confirm(`Delete project ${p.code} — "${p.name}" — including ALL tasks, hours, and history? This cannot be undone.`)) return
    if (!window.confirm('Really delete? Last chance.')) return
    try {
      await api.deleteProject(p.id)
      toast(`Project ${p.code} deleted`)
      selectProject(null)
      await reloadProjects()
    } catch (e) { toast(e instanceof Error ? e.message : String(e), true) }
  }

  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>

        <div className="card card-pad">
          <h2>New project</h2>
          <div className="field-row">
            <div className="field" style={{ maxWidth: 110 }}>
              <label>Code</label>
              <input placeholder="AMBIT" value={nCode} onChange={(e) => setNCode(e.target.value.toUpperCase())} />
            </div>
            <div className="field">
              <label>Name</label>
              <input placeholder="Client engagement name" value={nName} onChange={(e) => setNName(e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ maxWidth: 180 }}>
            <label>Total budget (hours)</label>
            <input type="number" step="0.1" min="0" value={nBudget} onChange={(e) => setNBudget(e.target.value)} />
          </div>
          <button className="btn primary" onClick={createProject}>Create project</button>
          <p className="hint" style={{ marginTop: 8 }}>
            Tip: importing an artifact on the Import page creates the project automatically.
          </p>
        </div>

        <div className="card card-pad">
          <h2>Backup &amp; restore</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            A backup is a full, consistent copy of the database (all projects, tasks, hours,
            and history). Use it to migrate to another host or as a point-in-time snapshot:
            download here, then restore on the destination.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <a className="btn primary" href="/api/backup">Download backup</a>
            <input
              ref={restoreInput}
              type="file"
              accept=".sqlite3,.sqlite,.db,application/octet-stream"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''  // allow re-selecting the same file later
                if (file) restore(file)
              }}
            />
            <button className="btn" disabled={restoring}
              onClick={() => restoreInput.current?.click()}>
              {restoring ? 'Restoring…' : 'Restore from backup…'}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Restoring replaces everything currently in the app. The pre-restore database is
            kept as <code>pm.sqlite3.pre-restore</code> in the data directory.
          </p>
        </div>

        {current && (
          <>
            <div className="card card-pad">
              <h2>Project — {current.project.code}</h2>
              <div className="field">
                <label>Name</label>
                <input value={pName} onChange={(e) => setPName(e.target.value)} />
              </div>
              <div className="field" style={{ maxWidth: 180 }}>
                <label>Total budget (hours)</label>
                <input type="number" step="0.1" min="0" value={pBudget} onChange={(e) => setPBudget(e.target.value)} />
              </div>
              <div className="field">
                <label>Description</label>
                <textarea rows={2} value={pDesc} onChange={(e) => setPDesc(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" onClick={saveProject}>Save</button>
                <div style={{ flex: 1 }} />
                <button className="btn danger" onClick={deleteProject}>Delete project</button>
              </div>
            </div>

            <div className="card card-pad">
              <h2>Phases</h2>
              {current.phases.map((p) => (
                <EditableRow
                  key={p.id}
                  value={p.name}
                  onSave={(name) => run(() => api.updatePhase(p.id, { name }))}
                  onDelete={() => {
                    if (window.confirm(`Delete phase "${p.name}"? Its tasks keep existing without a phase.`))
                      run(() => api.deletePhase(p.id))
                  }}
                />
              ))}
              <AddRow placeholder="New phase name" value={newPhase} setValue={setNewPhase}
                onAdd={() => run(() => api.createPhase(current.project.id, {
                  name: newPhase.trim(), sort_order: current.phases.length,
                })).then(() => setNewPhase(''))} />
            </div>

            <div className="card card-pad">
              <h2>Statuses</h2>
              {current.statuses.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                  <EditableRow
                    value={s.name}
                    style={{ flex: 1 }}
                    onSave={(name) => run(() => api.updateStatus(s.id, { name }))}
                    onDelete={() => {
                      if (window.confirm(`Delete status "${s.name}"? Tasks using it become status-less.`))
                        run(() => api.deleteStatus(s.id))
                    }}
                  />
                  <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={!!s.is_done}
                      onChange={(e) => run(() => api.updateStatus(s.id, { is_done: e.target.checked ? 1 : 0 }))} />
                    counts as done
                  </label>
                </div>
              ))}
              <AddRow placeholder="New status name" value={newStatus} setValue={setNewStatus}
                onAdd={() => run(() => api.createStatus(current.project.id, {
                  name: newStatus.trim(), sort_order: current.statuses.length,
                })).then(() => setNewStatus(''))} />
              <p className="hint">"Counts as done" drives the completion % on the dashboard.</p>
            </div>

            <div className="card card-pad">
              <h2>Overhead categories</h2>
              <p className="hint" style={{ marginTop: 0 }}>
                Hour buckets for work that isn't a schedulable task (PM, meetings…). Each gets a tag.
              </p>
              {current.overhead_categories.map((o) => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                  <EditableRow
                    value={o.name}
                    style={{ flex: 1 }}
                    onSave={(name) => run(() => api.updateOverhead(o.id, { name }))}
                    onDelete={() => {
                      if (window.confirm(`Delete overhead category "${o.name}"? Its logged entries will be orphaned.`))
                        run(() => api.deleteOverhead(o.id))
                    }}
                  />
                  <button className="tag-chip" title="Copy tag"
                    onClick={() => { navigator.clipboard.writeText(o.tag); toast(`Copied ${o.tag}`) }}>
                    {o.tag}
                  </button>
                  <span className="badge neutral">{o.logged_hours}h</span>
                </div>
              ))}
              <AddRow placeholder="New category name" value={newOverhead} setValue={setNewOverhead}
                onAdd={() => run(() => api.createOverhead(current.project.id, {
                  name: newOverhead.trim(), sort_order: current.overhead_categories.length,
                })).then(() => setNewOverhead(''))} />
            </div>

            <div className="card card-pad">
              <h2>Milestones</h2>
              {current.milestones.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                  <span style={{ color: 'var(--amber)' }}>◆</span>
                  <EditableRow
                    value={m.name}
                    style={{ flex: 1 }}
                    onSave={(name) => run(() => api.updateMilestone(m.id, { name }))}
                    onDelete={() => {
                      if (window.confirm(`Delete milestone "${m.name}"?`))
                        run(() => api.deleteMilestone(m.id))
                    }}
                  />
                  <input type="date" value={m.date} style={{ padding: '3px 6px', fontSize: 12.5 }}
                    onChange={(e) => run(() => api.updateMilestone(m.id, { date: e.target.value }))} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input style={{ flex: 1 }} placeholder="New milestone name" value={newMsName}
                  onChange={(e) => setNewMsName(e.target.value)} />
                <input type="date" value={newMsDate} onChange={(e) => setNewMsDate(e.target.value)} />
                <button className="btn sm" disabled={!newMsName.trim()}
                  onClick={() => run(() => api.createMilestone(current.project.id, {
                    name: newMsName.trim(), date: newMsDate,
                  })).then(() => setNewMsName(''))}>
                  Add
                </button>
              </div>
            </div>
          </>
        )}
        {!current && currentId == null && (
          <div className="card card-pad">
            <h2>No project selected</h2>
            <p className="hint">Create a project here, or import an artifact on the Import page.</p>
          </div>
        )}
      </div>
    </>
  )
}

function EditableRow({
  value, onSave, onDelete, style,
}: {
  value: string
  onSave: (v: string) => void
  onDelete: () => void
  style?: React.CSSProperties
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0', ...style }}>
      <input
        style={{ flex: 1, padding: '4px 8px' }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text.trim() && text !== value) onSave(text.trim()) }}
        onKeyDown={(e) => { if (e.key === 'Enter' && text.trim() && text !== value) onSave(text.trim()) }}
      />
      <button className="btn ghost sm" title="Delete" onClick={onDelete}>✕</button>
    </div>
  )
}

function AddRow({
  placeholder, value, setValue, onAdd,
}: {
  placeholder: string
  value: string
  setValue: (v: string) => void
  onAdd: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <input
        style={{ flex: 1 }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) onAdd() }}
      />
      <button className="btn sm" disabled={!value.trim()} onClick={onAdd}>Add</button>
    </div>
  )
}
