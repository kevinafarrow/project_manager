import { useRef, useState } from 'react'
import { diffDays, fmtShort, todayISO } from '../dates'

const W = 720
const H = 250
const M = { l: 46, r: 96, t: 14, b: 30 }

interface Pt { date: string; cumulative_hours: number }

export default function BurnupChart({
  points, budget, allocated, today,
}: {
  points: Pt[]
  budget: number
  allocated: number
  today: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  if (!points.length) {
    return <div className="empty-note">No hours logged yet — the burn-up appears once time entries exist.</div>
  }

  const t = today || todayISO()
  const x0 = points[0].date
  const x1 = points[points.length - 1].date > t ? points[points.length - 1].date : t
  const spanDays = Math.max(1, diffDays(x0, x1))
  const maxY = Math.max(budget, allocated, points[points.length - 1].cumulative_hours) * 1.08

  const px = (iso: string) => M.l + (diffDays(x0, iso) / spanDays) * (W - M.l - M.r)
  const py = (v: number) => M.t + (1 - v / maxY) * (H - M.t - M.b)

  const linePath = points
    .map((p, i) => `${i ? 'L' : 'M'} ${px(p.date).toFixed(1)} ${py(p.cumulative_hours).toFixed(1)}`)
    .join(' ')
  const last = points[points.length - 1]
  const areaPath = `${linePath} L ${px(last.date).toFixed(1)} ${py(0)} L ${px(points[0].date).toFixed(1)} ${py(0)} Z`

  // y gridlines: 4 nice steps
  const step = niceStep(maxY / 4)
  const gridVals: number[] = []
  for (let v = step; v <= maxY; v += step) gridVals.push(v)

  // x tick dates: start, ~1/3, ~2/3, end — deduped for short spans
  const ticks = [...new Set(
    [0, 1 / 3, 2 / 3, 1].map((f) => addDaysISO(points[0].date, Math.round(spanDays * f))),
  )]

  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    let bestD = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(px(p.date) - sx)
      if (d < bestD) { bestD = d; best = i }
    })
    setHover(best)
  }

  const hp = hover != null ? points[hover] : null
  const prev = hover != null && hover > 0 ? points[hover - 1] : null
  const dayHours = hp ? Math.round((hp.cumulative_hours - (prev?.cumulative_hours ?? 0)) * 100) / 100 : 0

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Cumulative hours logged over time: ${last.cumulative_hours} of ${budget} budgeted hours as of ${last.date}`}
      >
        {/* grid */}
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={M.l} y1={py(v)} x2={W - M.r} y2={py(v)} stroke="var(--line-2)" />
            <text x={M.l - 6} y={py(v) + 3.5} fontSize={11} textAnchor="end" fill="var(--ink-3)">
              {v}
            </text>
          </g>
        ))}
        <line x1={M.l} y1={py(0)} x2={W - M.r} y2={py(0)} stroke="var(--line)" />
        {ticks.map((iso, i) => (
          <text key={i} x={px(iso)} y={H - 8} fontSize={11} fill="var(--ink-3)"
            textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}>
            {fmtShort(iso)}
          </text>
        ))}

        {/* budget & allocated reference lines with direct labels */}
        <line x1={M.l} y1={py(budget)} x2={W - M.r} y2={py(budget)}
          stroke="var(--ink-2)" strokeDasharray="5 4" strokeWidth={1.4} />
        <text x={W - M.r + 6} y={py(budget) + 3.5} fontSize={11} fontWeight={600} fill="var(--ink-2)">
          Budget {round1(budget)}h
        </text>
        {allocated > 0 && Math.abs(py(allocated) - py(budget)) > 12 && (
          <>
            <line x1={M.l} y1={py(allocated)} x2={W - M.r} y2={py(allocated)}
              stroke="var(--ink-3)" strokeDasharray="2 4" strokeWidth={1.2} />
            <text x={W - M.r + 6} y={py(allocated) + 3.5} fontSize={11} fill="var(--ink-3)">
              Allocated {round1(allocated)}h
            </text>
          </>
        )}

        {/* series */}
        <path d={areaPath} fill="var(--chart-mark)" opacity={0.12} />
        <path d={linePath} fill="none" stroke="var(--chart-mark)" strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
        <text x={px(last.date) + 6} y={py(last.cumulative_hours) - 6} fontSize={11}
          fontWeight={600} fill="var(--ink)">
          {round1(last.cumulative_hours)}h
        </text>

        {/* crosshair + hover marker */}
        {hp && (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={px(hp.date)} y1={M.t} x2={px(hp.date)} y2={py(0)}
              stroke="var(--ink-3)" strokeWidth={1} opacity={0.5} />
            <circle cx={px(hp.date)} cy={py(hp.cumulative_hours)} r={4.5}
              fill="var(--chart-mark)" stroke="var(--panel)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && (
        <div
          style={{
            position: 'absolute',
            left: `${(px(hp.date) / W) * 100}%`,
            top: 0,
            transform: px(hp.date) > W * 0.72 ? 'translate(-105%, 0)' : 'translate(10px, 0)',
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            boxShadow: 'var(--shadow)',
            padding: '6px 10px',
            fontSize: 12,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <b>{fmtShort(hp.date)}</b><br />
          {round1(hp.cumulative_hours)}h total · +{dayHours}h that day
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="hint" style={{ cursor: 'pointer' }}>View data table</summary>
        <table className="data" style={{ maxWidth: 320, marginTop: 6 }}>
          <thead><tr><th>Date</th><th className="num">Cumulative h</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}><td>{p.date}</td><td className="num">{p.cumulative_hours}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 0.1))))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (raw <= m * mag) return m * mag
  }
  return 10 * mag
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
