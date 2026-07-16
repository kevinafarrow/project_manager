import { useRef, useState } from 'react'
import { useApp } from '../state'
import { api } from '../api'
import type { ImportResult } from '../types'

const EXAMPLE = `{
  "format": "pm-import/v1",
  "project": {
    "code": "AMBIT",
    "name": "American Binary SOC 2 Type II",
    "description": "Readiness + observation support",
    "total_budget_hours": 167.8
  },
  "phases": ["Remediation", "Observation Support", "Audit Support"],
  "overhead_categories": ["Project management", "Meetings", "Client comms"],
  "milestones": [
    { "external_key": "OBS-START", "name": "Observation period begins", "date": "2026-09-01" }
  ],
  "tasks": [
    {
      "external_key": "CC8.1",
      "title": "Change management controls",
      "description": "Enable branch protection; require PR review.",
      "owner": "Engineering Lead",
      "phase": "Remediation",
      "status": "Not Started",
      "start_date": "2026-07-16",
      "end_date": "2026-07-31",
      "estimated_hours": 6,
      "checklist": ["Enable branch protection on main", "Capture evidence: settings screenshot"],
      "depends_on": []
    }
  ]
}`

function promptText(code: string) {
  return `Produce a JSON artifact for my engagement project manager from the attached source document (gap analysis, pentest scope, SOW, etc.).

Output format "pm-import/v1" (emit ONLY the JSON):
- project: { code: "${code || 'SHORTCODE'}", name, description, total_budget_hours }
- phases: array of phase names in delivery order
- overhead_categories: hour buckets that aren't schedulable tasks (PM, meetings, comms)
- milestones: [{ external_key, name, date: "YYYY-MM-DD" }] for hard calendar anchors
- tasks: one per work item:
  - external_key: stable ref from the source doc (e.g. control ID) — used to match on re-import
  - title, description, owner, phase (name from phases)
  - status: e.g. "Not Started" / "In Progress"
  - start_date / end_date: "YYYY-MM-DD", working back from the source's target dates
  - estimated_hours: MY consulting effort only, not the client's internal effort
  - checklist: concrete accomplishment steps first, then "Capture evidence: …" items
  - depends_on: array of external_keys (tasks or milestones) that must finish first

Rules: keep external keys exactly as they appear in the source; derive dependencies from any sequencing notes; stagger start dates realistically rather than starting everything at once.`
}

export default function ImportPage() {
  const { current, toast, reload, reloadProjects } = useApp()
  const [text, setText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const parse = (): unknown | null => {
    try {
      return JSON.parse(text)
    } catch (e) {
      toast(`Invalid JSON: ${e instanceof Error ? e.message : e}`, true)
      return null
    }
  }

  const doRun = async (commit: boolean) => {
    const artifact = parse()
    if (!artifact) return
    setBusy(true)
    try {
      const res = await api.importArtifact(artifact, commit)
      setResult(res)
      if (commit) {
        toast(`Imported into ${res.project_code}`)
        await reloadProjects()
        await reload()
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true)
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setText(await f.text())
    setResult(null)
  }

  const counts = (entity: string) => {
    const c = result?.summary[entity] ?? {}
    return ['create', 'update', 'unchanged', 'error']
      .filter((k) => c[k])
      .map((k) => `${c[k]} ${k}${c[k]! > 1 && k === 'create' ? 'd' : ''}`)
      .join(', ') || '—'
  }

  const interesting = (result?.changes ?? []).filter((c) => c.action !== 'unchanged')

  return (
    <>
      <div className="page-head">
        <h1>Import plan</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setShowDocs((s) => !s)}>
          {showDocs ? 'Hide' : 'Show'} format docs & AI prompt
        </button>
      </div>

      <p className="hint" style={{ marginTop: -8 }}>
        Paste a <code>pm-import/v1</code> JSON artifact (typically produced by an AI from a gap
        analysis, SOW, or scope doc). Preview shows exactly what would change; existing logged
        hours, checklist ticks, and task statuses are never touched by re-imports — tasks match
        on their <code>external_key</code>.
      </p>

      {showDocs && (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
          <div className="card card-pad">
            <h2>Artifact example</h2>
            <pre className="code-block" style={{ maxHeight: 380, overflow: 'auto' }}>{EXAMPLE}</pre>
          </div>
          <div className="card card-pad">
            <h2>Prompt for your AI</h2>
            <pre className="code-block" style={{ maxHeight: 340, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {promptText(current?.project.code ?? '')}
            </pre>
            <button
              className="btn sm"
              style={{ marginTop: 8 }}
              onClick={() => { navigator.clipboard.writeText(promptText(current?.project.code ?? '')); toast('Prompt copied') }}
            >
              Copy prompt
            </button>
          </div>
        </div>
      )}

      <div className="card card-pad">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>Load file…</button>
          <input ref={fileRef} type="file" accept=".json" hidden
            onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <textarea
          className="mono"
          rows={12}
          style={{ width: '100%', resize: 'vertical' }}
          placeholder='{"format": "pm-import/v1", ...}'
          value={text}
          onChange={(e) => { setText(e.target.value); setResult(null) }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn" disabled={!text.trim() || busy} onClick={() => doRun(false)}>Preview</button>
          <button
            className="btn primary"
            disabled={!result || result.committed || busy}
            onClick={() => doRun(true)}
          >
            Commit import
          </button>
        </div>
      </div>

      {result && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <h2>
            {result.committed ? 'Imported' : 'Preview'} — project {result.project_code}
          </h2>
          <table className="data" style={{ marginBottom: 14, maxWidth: 560 }}>
            <tbody>
              {['project', 'phase', 'status', 'overhead', 'milestone', 'task', 'dependency'].map((e) => (
                <tr key={e}><td style={{ textTransform: 'capitalize' }}>{e}</td><td>{counts(e)}</td></tr>
              ))}
            </tbody>
          </table>
          {interesting.length > 0 && (
            <table className="data">
              <thead><tr><th>Entity</th><th>Key</th><th>Action</th><th>Detail</th></tr></thead>
              <tbody>
                {interesting.map((c, i) => (
                  <tr key={i}>
                    <td>{c.entity}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{c.key}</td>
                    <td>
                      <span className={`badge ${c.action === 'create' ? 'ok' : c.action === 'error' ? 'danger' : 'accent'}`}>
                        {c.action}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 11.5, maxWidth: 420, overflowWrap: 'anywhere' }}>
                      {Object.entries(c.changes)
                        .map(([k, v]) => Array.isArray(v) ? `${k}: ${v[0] ?? '∅'} → ${v[1]}` : `${k}: ${v}`)
                        .join('; ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  )
}
