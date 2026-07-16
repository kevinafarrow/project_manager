import { useEffect, useState } from 'react'
import { useApp } from '../state'
import { api } from '../api'
import type { IngestResult, TimeEntry } from '../types'
import { todayISO } from '../dates'

export default function HoursPage() {
  const { current, reload, toast } = useApp()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<IngestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [qaTarget, setQaTarget] = useState('')
  const [qaDate, setQaDate] = useState(todayISO())
  const [qaHours, setQaHours] = useState('')
  const [qaPerson, setQaPerson] = useState(() => localStorage.getItem('pm-person') || '')
  const [qaNote, setQaNote] = useState('')

  const pid = current?.project.id

  const loadEntries = () => {
    if (pid == null) return
    api.listEntries(pid).then(setEntries).catch((e) => toast(String(e), true))
  }
  useEffect(loadEntries, [pid, current])  // current changes after reload()

  if (!current || pid == null) return <div className="empty-note">Select or create a project first.</div>

  const doPreview = async () => {
    setBusy(true)
    try {
      setPreview(await api.ingest(pid, text, false))
    } catch (e) { toast(String(e), true) } finally { setBusy(false) }
  }
  const doCommit = async () => {
    setBusy(true)
    try {
      const res = await api.ingest(pid, text, true)
      toast(`Logged ${res.total_hours}h across ${res.valid_count} entries${res.error_count ? ` (${res.error_count} lines skipped)` : ''}`)
      setText('')
      setPreview(null)
      await reload()
    } catch (e) { toast(String(e), true) } finally { setBusy(false) }
  }

  const quickAdd = async () => {
    const hours = parseFloat(qaHours)
    if (!qaTarget || !hours || hours <= 0) { toast('Pick a target and hours > 0', true); return }
    const [kind, idStr] = qaTarget.split(':')
    localStorage.setItem('pm-person', qaPerson)
    try {
      await api.createEntry(pid, {
        target_type: kind as 'task' | 'overhead', target_id: Number(idStr),
        entry_date: qaDate, hours, person: qaPerson, note: qaNote,
      })
      toast(`Logged ${hours}h`)
      setQaHours(''); setQaNote('')
      await reload()
    } catch (e) { toast(String(e), true) }
  }

  const delEntry = async (id: number) => {
    try {
      await api.deleteEntry(id)
      toast('Entry deleted')
      await reload()
    } catch (e) { toast(String(e), true) }
  }

  const total = entries.reduce((s, e) => s + e.hours, 0)

  return (
    <>
      <div className="page-head">
        <h1>Hours — {current.project.name}</h1>
        <span className="badge neutral">{Math.round(total * 100) / 100}h logged · budget {current.project.total_budget_hours}h</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(380px, 3fr) minmax(300px, 2fr)', alignItems: 'start' }}>
        <div className="card card-pad">
          <h2>Bulk ingest</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            One entry per line: <code>TAG, DATE, HOURS, PERSON, NOTE</code> (comma or tab separated;
            person/note optional; tag prefixes like <code>{current.project.code}-CC8.1</code> resolve
            automatically; lines starting with # are ignored).
          </p>
          <textarea
            className="mono"
            rows={7}
            style={{ width: '100%', resize: 'vertical' }}
            placeholder={`${current.project.code}-CC8.1, 2026-07-20, 3.5, Kevin, configured branch protection\n${current.project.code}-OH-meetings, 2026-07-20, 1, Kevin, weekly sync`}
            value={text}
            onChange={(e) => { setText(e.target.value); setPreview(null) }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn" disabled={!text.trim() || busy} onClick={doPreview}>Preview</button>
            <button className="btn primary" disabled={!preview || preview.valid_count === 0 || busy} onClick={doCommit}>
              Commit {preview ? `${preview.valid_count} entries (${preview.total_hours}h)` : ''}
            </button>
          </div>
          {preview && (
            <table className="data" style={{ marginTop: 12 }}>
              <thead>
                <tr><th>Line</th><th>Tag</th><th>Date</th><th className="num">Hours</th><th>Person</th><th>Result</th></tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line}>
                    <td className="mono">{r.line}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.tag ?? r.raw.split(/[,\t]/)[0]}</td>
                    <td>{r.entry_date ?? '—'}</td>
                    <td className="num">{r.hours ?? '—'}</td>
                    <td>{r.person ?? ''}</td>
                    <td>
                      {r.errors.length
                        ? <span className="error-text">{r.errors.join('; ')}</span>
                        : <span className="badge ok">ok</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card card-pad">
          <h2>Quick add</h2>
          <div className="field">
            <label>Task or overhead bucket</label>
            <select value={qaTarget} onChange={(e) => setQaTarget(e.target.value)}>
              <option value="">Choose…</option>
              <optgroup label="Overhead">
                {current.overhead_categories.map((o) => (
                  <option key={o.id} value={`overhead:${o.id}`}>{o.name}</option>
                ))}
              </optgroup>
              <optgroup label="Tasks">
                {current.tasks.map((t) => (
                  <option key={t.id} value={`task:${t.id}`}>
                    {t.external_key ? `${t.external_key} — ` : ''}{t.title}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Date</label>
              <input type="date" value={qaDate} onChange={(e) => setQaDate(e.target.value)} />
            </div>
            <div className="field" style={{ maxWidth: 90 }}>
              <label>Hours</label>
              <input type="number" step="0.25" min="0" value={qaHours} onChange={(e) => setQaHours(e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Person</label>
              <input value={qaPerson} onChange={(e) => setQaPerson(e.target.value)} />
            </div>
            <div className="field">
              <label>Note</label>
              <input value={qaNote} onChange={(e) => setQaNote(e.target.value)} />
            </div>
          </div>
          <button className="btn primary" onClick={quickAdd}>Log hours</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <table className="data">
          <thead>
            <tr><th>Date</th><th>Tag</th><th>Logged against</th><th className="num">Hours</th><th>Person</th><th>Note</th><th /></tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{e.entry_date}</td>
                <td className="mono" style={{ fontSize: 12 }}>{e.tag}</td>
                <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.target_type === 'overhead' && <span className="badge neutral" style={{ marginRight: 6 }}>OH</span>}
                  {e.target_label}
                </td>
                <td className="num">{e.hours}</td>
                <td>{e.person}</td>
                <td style={{ maxWidth: 320 }}>{e.note}</td>
                <td>
                  <button className="btn ghost sm" title="Delete entry" onClick={() => delEntry(e.id)}>✕</button>
                </td>
              </tr>
            ))}
            {!entries.length && <tr><td colSpan={7} className="empty-note">No hours logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
