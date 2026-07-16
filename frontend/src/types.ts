export interface Project {
  id: number
  code: string
  name: string
  description: string
  total_budget_hours: number
  created_at: string
}

export interface Phase {
  id: number
  project_id: number
  name: string
  sort_order: number
}

export interface Status {
  id: number
  project_id: number
  name: string
  sort_order: number
  is_done: number
}

export interface ChecklistItem {
  id: number
  task_id: number
  text: string
  done: number
  sort_order: number
}

export interface Task {
  id: number
  project_id: number
  phase_id: number | null
  status_id: number | null
  external_key: string
  title: string
  description: string
  owner: string
  start_date: string | null
  end_date: string | null
  estimated_hours: number
  tag: string
  sort_order: number
  created_at: string
  updated_at: string
  checklist: ChecklistItem[]
  logged_hours: number
}

export interface Milestone {
  id: number
  project_id: number
  external_key: string
  name: string
  date: string
}

export interface OverheadCategory {
  id: number
  project_id: number
  name: string
  tag: string
  sort_order: number
  logged_hours: number
}

export interface Dependency {
  id: number
  project_id: number
  pred_type: 'task' | 'milestone'
  pred_id: number
  succ_type: 'task' | 'milestone'
  succ_id: number
}

export interface FullProject {
  project: Project
  phases: Phase[]
  statuses: Status[]
  tasks: Task[]
  milestones: Milestone[]
  overhead_categories: OverheadCategory[]
  dependencies: Dependency[]
  today: string
}

export interface TimeEntry {
  id: number
  project_id: number
  target_type: 'task' | 'overhead'
  target_id: number
  entry_date: string
  hours: number
  person: string
  note: string
  created_at: string
  tag: string
  target_label: string
}

export interface IngestRow {
  line: number
  raw: string
  errors: string[]
  tag?: string
  target_type?: 'task' | 'overhead'
  target_id?: number
  entry_date?: string
  hours?: number
  person?: string
  note?: string
}

export interface IngestResult {
  rows: IngestRow[]
  valid_count: number
  error_count: number
  total_hours: number
  committed: boolean
}

export interface ImportChange {
  entity: string
  key: string
  action: 'create' | 'update' | 'unchanged' | 'error'
  changes: Record<string, unknown>
}

export interface ImportResult {
  committed: boolean
  project_code: string
  summary: Record<string, Record<string, number>>
  changes: ImportChange[]
}

export interface PhaseStats {
  phase: string
  task_count: number
  done_count: number
  estimated_hours: number
  done_estimated_hours: number
  logged_hours: number
}

export interface SlimTask {
  id: number
  external_key: string
  title: string
  owner: string
  end_date: string | null
  status_name: string | null
  phase_name: string | null
  estimated_hours: number
  logged_hours: number
}

export interface Conflict {
  dependency_id: number
  predecessor: string
  predecessor_end: string
  successor: string
  successor_start: string
}

export interface Stats {
  project: Project
  budget_hours: number
  allocated_hours: number
  reserve_hours: number
  logged_total_hours: number
  logged_task_hours: number
  logged_overhead_hours: number
  remaining_budget_hours: number
  burn_pct: number
  completion_pct: number
  task_count: number
  done_count: number
  by_phase: PhaseStats[]
  by_overhead: { name: string; tag: string; logged_hours: number }[]
  burnup: { date: string; cumulative_hours: number }[]
  overdue: SlimTask[]
  upcoming: SlimTask[]
  conflicts: Conflict[]
  today: string
}
