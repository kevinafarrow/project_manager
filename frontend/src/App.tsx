import { useState } from 'react'
import { useApp } from './state'
import {
  IconChart, IconClock, IconGantt, IconGear, IconImport, IconList, IconLogo,
  IconMoon, IconSun,
} from './icons'
import DashboardPage from './pages/DashboardPage'
import GanttPage from './pages/GanttPage'
import TasksPage from './pages/TasksPage'
import HoursPage from './pages/HoursPage'
import ImportPage from './pages/ImportPage'
import SettingsPage from './pages/SettingsPage'

const PAGES = [
  { key: 'dashboard', label: 'Dashboard', icon: IconChart, el: DashboardPage },
  { key: 'gantt', label: 'Gantt', icon: IconGantt, el: GanttPage },
  { key: 'tasks', label: 'Tasks', icon: IconList, el: TasksPage },
  { key: 'hours', label: 'Hours', icon: IconClock, el: HoursPage },
  { key: 'import', label: 'Import', icon: IconImport, el: ImportPage },
  { key: 'settings', label: 'Settings', icon: IconGear, el: SettingsPage },
] as const

type PageKey = (typeof PAGES)[number]['key']

export default function App() {
  const { projects, currentId, selectProject, loading, theme, setTheme } = useApp()
  const [page, setPage] = useState<PageKey>('gantt')

  const Active = PAGES.find((p) => p.key === page)!.el
  const nextTheme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system'
  const ThemeIcon = theme === 'dark' ? IconMoon : IconSun

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><IconLogo /> Engagement PM</div>
        <select
          className="project-select"
          value={currentId ?? ''}
          onChange={(e) => {
            if (e.target.value === '__new__') {
              setPage('settings')
              selectProject(null)
            } else {
              selectProject(Number(e.target.value))
            }
          }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
          {!projects.length && <option value="">No projects yet</option>}
          <option value="__new__">＋ New project…</option>
        </select>
        {PAGES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`nav-item${page === key ? ' active' : ''}`}
            onClick={() => setPage(key)}
          >
            <Icon size={17} /> {label}
          </button>
        ))}
        <div className="foot">
          <button className="nav-item" onClick={() => setTheme(nextTheme)} title="Cycle theme">
            <ThemeIcon size={17} /> Theme: {theme}
          </button>
        </div>
      </aside>
      <div className="main">
        <div className="page">
          {loading ? <div className="empty-note">Loading…</div> : <Active />}
        </div>
      </div>
    </div>
  )
}
