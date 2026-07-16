import type {
  Dependency, FullProject, ImportResult, IngestResult, Milestone,
  OverheadCategory, Phase, Project, Stats, Status, Task, TimeEntry, ChecklistItem,
} from './types'

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json()
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch { /* keep statusText */ }
    throw new Error(detail)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  listProjects: () => req<Project[]>('GET', '/api/projects'),
  createProject: (p: { code: string; name: string; description?: string; total_budget_hours?: number }) =>
    req<Project>('POST', '/api/projects', p),
  updateProject: (id: number, patch: Partial<Project>) =>
    req<Project>('PATCH', `/api/projects/${id}`, patch),
  deleteProject: (id: number) => req<void>('DELETE', `/api/projects/${id}`),
  fullProject: (id: number) => req<FullProject>('GET', `/api/projects/${id}/full`),
  stats: (id: number) => req<Stats>('GET', `/api/projects/${id}/stats`),

  createPhase: (pid: number, body: { name: string; sort_order?: number }) =>
    req<Phase>('POST', `/api/projects/${pid}/phases`, body),
  updatePhase: (id: number, patch: Partial<Phase>) => req<Phase>('PATCH', `/api/phases/${id}`, patch),
  deletePhase: (id: number) => req<void>('DELETE', `/api/phases/${id}`),

  createStatus: (pid: number, body: { name: string; sort_order?: number; is_done?: boolean }) =>
    req<Status>('POST', `/api/projects/${pid}/statuses`, body),
  updateStatus: (id: number, patch: Partial<Status>) => req<Status>('PATCH', `/api/statuses/${id}`, patch),
  deleteStatus: (id: number) => req<void>('DELETE', `/api/statuses/${id}`),

  createTask: (pid: number, body: Partial<Task> & { title: string; checklist?: string[] }) =>
    req<Task>('POST', `/api/projects/${pid}/tasks`, body),
  updateTask: (id: number, patch: Partial<Task>) => req<Task>('PATCH', `/api/tasks/${id}`, patch),
  deleteTask: (id: number) => req<void>('DELETE', `/api/tasks/${id}`),

  createChecklistItem: (taskId: number, body: { text: string; sort_order?: number }) =>
    req<ChecklistItem>('POST', `/api/tasks/${taskId}/checklist`, body),
  updateChecklistItem: (id: number, patch: Partial<ChecklistItem> | { done: boolean }) =>
    req<ChecklistItem>('PATCH', `/api/checklist/${id}`, patch),
  deleteChecklistItem: (id: number) => req<void>('DELETE', `/api/checklist/${id}`),

  createMilestone: (pid: number, body: { name: string; date: string; external_key?: string }) =>
    req<Milestone>('POST', `/api/projects/${pid}/milestones`, body),
  updateMilestone: (id: number, patch: Partial<Milestone>) =>
    req<Milestone>('PATCH', `/api/milestones/${id}`, patch),
  deleteMilestone: (id: number) => req<void>('DELETE', `/api/milestones/${id}`),

  createOverhead: (pid: number, body: { name: string; sort_order?: number }) =>
    req<OverheadCategory>('POST', `/api/projects/${pid}/overhead`, body),
  updateOverhead: (id: number, patch: Partial<OverheadCategory>) =>
    req<OverheadCategory>('PATCH', `/api/overhead/${id}`, patch),
  deleteOverhead: (id: number) => req<void>('DELETE', `/api/overhead/${id}`),

  createDependency: (pid: number, body: Omit<Dependency, 'id' | 'project_id'>) =>
    req<Dependency>('POST', `/api/projects/${pid}/dependencies`, body),
  deleteDependency: (id: number) => req<void>('DELETE', `/api/dependencies/${id}`),

  listEntries: (pid: number) => req<TimeEntry[]>('GET', `/api/projects/${pid}/time-entries`),
  createEntry: (pid: number, body: {
    target_type: 'task' | 'overhead'; target_id: number; entry_date: string
    hours: number; person?: string; note?: string
  }) => req<TimeEntry>('POST', `/api/projects/${pid}/time-entries`, body),
  deleteEntry: (id: number) => req<void>('DELETE', `/api/time-entries/${id}`),
  ingest: (pid: number, text: string, commit: boolean) =>
    req<IngestResult>('POST', `/api/projects/${pid}/time-entries/ingest`, { text, commit }),

  importArtifact: (artifact: unknown, commit: boolean) =>
    req<ImportResult>('POST', '/api/import', { artifact, commit }),
}
