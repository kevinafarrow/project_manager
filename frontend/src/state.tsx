import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './api'
import type { FullProject, Project } from './types'

type Theme = 'system' | 'light' | 'dark'

interface Toast { id: number; text: string; error?: boolean }

interface AppState {
  projects: Project[]
  current: FullProject | null
  currentId: number | null
  loading: boolean
  selectProject: (id: number | null) => void
  reload: () => Promise<void>
  reloadProjects: () => Promise<void>
  toast: (text: string, error?: boolean) => void
  theme: Theme
  setTheme: (t: Theme) => void
}

const Ctx = createContext<AppState>(null as unknown as AppState)
export const useApp = () => useContext(Ctx)

/** Wraps an async action: runs it, reloads project data, toasts on failure. */
export function useAction() {
  const { reload, toast } = useApp()
  return useCallback(
    async (fn: () => Promise<unknown>, okMsg?: string) => {
      try {
        await fn()
        await reload()
        if (okMsg) toast(okMsg)
        return true
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true)
        return false
      }
    },
    [reload, toast],
  )
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [currentId, setCurrentId] = useState<number | null>(() => {
    const saved = localStorage.getItem('pm-project')
    return saved ? Number(saved) : null
  })
  const [current, setCurrent] = useState<FullProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem('pm-theme') as Theme) || 'system',
  )

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    localStorage.setItem('pm-theme', theme)
  }, [theme])

  const toast = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts, { id, text, error }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), error ? 6000 : 3000)
  }, [])

  const reloadProjects = useCallback(async () => {
    const list = await api.listProjects()
    setProjects(list)
    setCurrentId((id) => {
      if (id && list.some((p) => p.id === id)) return id
      return list.length ? list[0].id : null
    })
  }, [])

  const reload = useCallback(async () => {
    if (currentId == null) {
      setCurrent(null)
      return
    }
    try {
      setCurrent(await api.fullProject(currentId))
    } catch {
      setCurrent(null)
    }
  }, [currentId])

  useEffect(() => {
    reloadProjects()
      .catch(() => toast('Cannot reach the backend — is the server running?', true))
      .finally(() => setLoading(false))
  }, [reloadProjects, toast])

  useEffect(() => {
    if (currentId != null) localStorage.setItem('pm-project', String(currentId))
    reload()
  }, [currentId, reload])

  const selectProject = useCallback((id: number | null) => setCurrentId(id), [])
  const setTheme = useCallback((t: Theme) => setThemeState(t), [])

  return (
    <Ctx.Provider
      value={{
        projects, current, currentId, loading,
        selectProject, reload, reloadProjects, toast, theme, setTheme,
      }}
    >
      {children}
      <div className="toast-holder">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? ' error' : ''}`}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
