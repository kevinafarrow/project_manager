import { useState } from 'react'
import { useApp } from '../state'
import Gantt from '../components/Gantt'
import type { Zoom } from '../components/Gantt'
import TaskDrawer from '../components/TaskDrawer'
import { IconWarn } from '../icons'

export default function GanttPage() {
  const { current } = useApp()
  const [zoom, setZoom] = useState<Zoom>('week')
  const [selected, setSelected] = useState<number | null>(null)

  if (!current) return <div className="empty-note">Select or create a project first.</div>

  const { tasks, dependencies, milestones } = current
  const findEnd = (kind: string, id: number) =>
    kind === 'task' ? tasks.find((t) => t.id === id)?.end_date : milestones.find((m) => m.id === id)?.date
  const findStart = (kind: string, id: number) =>
    kind === 'task' ? tasks.find((t) => t.id === id)?.start_date : milestones.find((m) => m.id === id)?.date
  const conflicts = dependencies.filter((d) => {
    const pe = findEnd(d.pred_type, d.pred_id)
    const ss = findStart(d.succ_type, d.succ_id)
    return pe != null && ss != null && ss < pe
  })

  return (
    <>
      <div className="page-head">
        <h1>Gantt — {current.project.name}</h1>
        {conflicts.length > 0 && (
          <span className="badge danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <IconWarn size={13} /> {conflicts.length} dependency conflict{conflicts.length > 1 ? 's' : ''}
          </span>
        )}
        <div className="spacer" />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['day', 'week', 'month'] as Zoom[]).map((z) => (
            <button key={z} className={`btn sm${zoom === z ? ' primary' : ''}`} onClick={() => setZoom(z)}>
              {z[0].toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {tasks.length === 0 ? (
        <div className="empty-note">
          No tasks yet — add them on the Tasks page or bring in a plan via Import.
        </div>
      ) : (
        <Gantt data={current} zoom={zoom} onSelectTask={(t) => setSelected(t.id)} />
      )}
      <p className="hint" style={{ marginTop: 10 }}>
        Drag a bar to reschedule; drag its edges to change duration. Click a bar for details.
        Bars fill up as hours are logged against their budget; red fill means over budget.
        Arrows show dependencies — red arrows start before their predecessor finishes.
      </p>
      {selected != null && (
        <TaskDrawer data={current} taskId={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
