const DAY_MS = 86_400_000

/** Parse YYYY-MM-DD as UTC noon so timezone shifts never move the day. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  return toISO(new Date(parseISO(iso).getTime() + days * DAY_MS))
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY_MS)
}

export function todayISO(): string {
  return toISO(new Date())
}

export function isWeekend(iso: string): boolean {
  const dow = parseISO(iso).getUTCDay()
  return dow === 0 || dow === 6
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtShort(iso: string): string {
  const d = parseISO(iso)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

export function fmtMonth(iso: string): string {
  const d = parseISO(iso)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function monthStart(iso: string): string {
  return iso.slice(0, 8) + '01'
}
