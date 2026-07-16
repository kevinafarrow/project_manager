import { useEffect, useState } from 'react'
import type { FullProject, Task } from '../types'
import { api } from '../api'
import { useAction, useApp } from '../state'
import { IconX } from '../icons'
import { todayISO } from '../dates'

export default function TaskDrawer({
  data, taskId, onClose,
}: {
  data: FullProject
  taskId: number
  onClose: () => void
}) {
  const run = useAction()
  const { toast } = useApp()
  const task = data.tasks.find((t) => t.id === taskId)
  const [form, setForm] = useState<Partial<Task>>({})
  const [newCheck, setNewCheck] = useState('')
  const [newDep, setNewDep] = useState('')
  const [qaDate, setQaDate] = useState(todayISO())
  const [qaHours, setQaHours] = useState('')
  const [qaPerson, setQaPerson] = useState(() => localStorage.getItem('pm-person') || '')
  const [qaNote, setQaNote] = useState('')

  useEffect(() => { setForm({}) }, [taskId])

  if (!task) return null

  const val = <K extends keyof Task>(k: K): Task[K] =>
    (form[k] !== undefined ? form[k] : task[k]) as Task[K]
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setForm((f) => ({ ...f, [k]: v }))
  const dirty = Object.keys(form).some((k) => form[k as keyof Task] !== task[k as keyof Task])

  const save = () =>
    run(() => api.updateTask(task.id, form), 'Task saved').then((ok) => { if (ok) setForm({}) })

  const del = () => {
    if (!window.confirm(`Delete task "${task.title}" and its dependencies? Logged time entries will be orphaned.`)) return
    run(() => api.deleteTask(task.id), 'Task deleted').then((ok) => { if (ok) onClose() })
  }

  const deps = data.dependencies.filter(
    (d) => (d.succ_type === 'task' && d.succ_id === task.id) ||
           (d.pred_type === 'task' && d.pred_id === task.id),
  )
  const nameOf = (kind: string, id: number) => {
    if (kind === 'task') {
      const t = data.tasks.find((x) => x.id === id)
      return t ? (t.external_key || t.title) : '?'
    }
    const m = data.milestones.find((x) => x.id === id)
    return m ? `◆ ${m.name}` : '?'
  }

  const addDep = () => {
    if (!newDep) return
    const [kind, idStr] = newDep.split(':')
    run(() => api.createDependency(data.project.id, {
      pred_type: kind as 'task' | 'milestone', pred_id: Number(idStr),
      succ_type: 'task', succ_id: task.id,
    }), 'Dependency added').then(() => setNewDep(''))
  }

  const quickAdd = () => {
    const hours = parseFloat(qaHours)
    if (!hours || hours <= 0) { toast('Enter hours > 0', true); return }
    localStorage.setItem('pm-person', qaPerson)
    run(() => api.createEntry(data.project.id, {
      target_type: 'task', target_id: task.id, entry_date: qaDate,
      hours, person: qaPerson, note: qaNote,
    }), `Logged ${hours}h on ${task.tag}`).then((ok) => { if (ok) { setQaHours(''); setQaNote('') } })
  }

  const burn = task.estimated_hours > 0
    ? Math.round((task.logged_hours / task.estimated_hours) * 100) : 0

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <h2>{task.external_key ? `${task.external_key} — ` : ''}{task.title}</h2>
          <button className="btn ghost sm" onClick={onClose}><IconX /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <button
            className="tag-chip"
            title="Click to copy time-tracking tag"
            onClick={() => { navigator.clipboard.writeText(task.tag); toast(`Copied ${task.tag}`) }}
          >
            {task.tag}
          </button>
          <span className={`badge ${burn > 100 ? 'danger' : burn > 80 ? 'amber' : 'neutral'}`}>
            {task.logged_hours}h / {task.estimated_hours}h ({burn}%)
          </span>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Title</label>
            <input value={val('title')} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 110 }}>
            <label>Ref key</label>
            <input value={val('external_key')} onChange={(e) => set('external_key', e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Phase</label>
            <select value={val('phase_id') ?? ''} onChange={(e) => set('phase_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">(none)</option>
              {data.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={val('status_id') ?? ''} onChange={(e) => set('status_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">(none)</option>
              {data.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Owner</label>
            <input value={val('owner')} onChange={(e) => set('owner', e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Start</label>
            <input type="date" value={val('start_date') ?? ''} onChange={(e) => set('start_date', e.target.value || null)} />
          </div>
          <div className="field">
            <label>End</label>
            <input type="date" value={val('end_date') ?? ''} onChange={(e) => set('end_date', e.target.value || null)} />
          </div>
          <div className="field" style={{ maxWidth: 110 }}>
            <label>Budget (h)</label>
            <input type="number" step="0.5" min="0" value={val('estimated_hours')}
              onChange={(e) => set('estimated_hours', Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label>Description</label>
          <textarea rows={3} value={val('description')} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="field">
          <label>Tag</label>
          <input className="mono" value={val('tag')} onChange={(e) => set('tag', e.target.value)} />
        </div>
        {dirty && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn primary" onClick={save}>Save changes</button>
            <button className="btn ghost" onClick={() => setForm({})}>Discard</button>
          </div>
        )}

        <h2 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-2)', margin: '18px 0 6px' }}>
          Checklist ({task.checklist.filter((c) => c.done).length}/{task.checklist.length})
        </h2>
        <div className="checklist">
          {task.checklist.map((c) => (
            <div key={c.id} className={`check-item${c.done ? ' done' : ''}`}>
              <input type="checkbox" checked={!!c.done}
                onChange={(e) => run(() => api.updateChecklistItem(c.id, { done: e.target.checked }))} />
              <span>{c.text}</span>
              <button className="x" title="Remove" onClick={() => run(() => api.deleteChecklistItem(c.id))}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input
              style={{ flex: 1 }}
              placeholder="Add checklist item…"
              value={newCheck}
              onChange={(e) => setNewCheck(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newCheck.trim()) {
                  run(() => api.createChecklistItem(task.id, { text: newCheck.trim(), sort_order: task.checklist.length }))
                    .then(() => setNewCheck(''))
                }
              }}
            />
          </div>
        </div>

        <h2 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-2)', margin: '18px 0 6px' }}>
          Dependencies
        </h2>
        {deps.length === 0 && <div className="hint">None</div>}
        {deps.map((d) => {
          const incoming = d.succ_type === 'task' && d.succ_id === task.id
          return (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <span className="badge neutral">{incoming ? 'after' : 'before'}</span>
              <span style={{ flex: 1 }}>
                {incoming ? nameOf(d.pred_type, d.pred_id) : nameOf(d.succ_type, d.succ_id)}
              </span>
              <button className="btn ghost sm" onClick={() => run(() => api.deleteDependency(d.id))}>✕</button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <select style={{ flex: 1 }} value={newDep} onChange={(e) => setNewDep(e.target.value)}>
            <option value="">This task starts after…</option>
            {data.tasks.filter((t) => t.id !== task.id).map((t) => (
              <option key={t.id} value={`task:${t.id}`}>{t.external_key || t.title}</option>
            ))}
            {data.milestones.map((m) => (
              <option key={m.id} value={`milestone:${m.id}`}>◆ {m.name}</option>
            ))}
          </select>
          <button className="btn sm" disabled={!newDep} onClick={addDep}>Add</button>
        </div>

        <h2 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-2)', margin: '20px 0 6px' }}>
          Log hours
        </h2>
        <div className="field-row">
          <div className="field" style={{ maxWidth: 140 }}>
            <label>Date</label>
            <input type="date" value={qaDate} onChange={(e) => setQaDate(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 90 }}>
            <label>Hours</label>
            <input type="number" step="0.25" min="0" placeholder="1.5" value={qaHours}
              onChange={(e) => setQaHours(e.target.value)} />
          </div>
          <div className="field">
            <label>Person</label>
            <input value={qaPerson} onChange={(e) => setQaPerson(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Note</label>
          <input placeholder="What was done (optional)" value={qaNote} onChange={(e) => setQaNote(e.target.value)} />
        </div>
        <button className="btn primary" onClick={quickAdd}>Log hours</button>

        <div style={{ marginTop: 28, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <button className="btn danger sm" onClick={del}>Delete task</button>
        </div>
      </div>
    </>
  )
}
