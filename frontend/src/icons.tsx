interface IconProps { size?: number }

const S = (size?: number) => ({
  width: size ?? 16,
  height: size ?? 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const IconGantt = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M4 6h8M8 12h10M4 18h6" strokeWidth="3" />
  </svg>
)
export const IconList = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.4" fill="currentColor" stroke="none" />
  </svg>
)
export const IconClock = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
)
export const IconImport = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M12 3v12m0 0-4-4m4 4 4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
)
export const IconChart = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
  </svg>
)
export const IconGear = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v3M12 18.2v3M21.2 12h-3M5.8 12h-3M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1M18.5 18.5l-2.1-2.1M7.6 7.6 5.5 5.5" />
  </svg>
)
export const IconSun = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3" />
  </svg>
)
export const IconMoon = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </svg>
)
export const IconX = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)
export const IconPlus = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const IconDiamond = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <rect x="7" y="7" width="10" height="10" transform="rotate(45 12 12)" />
  </svg>
)
export const IconWarn = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 9.5V14" />
    <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
  </svg>
)
export const IconLogo = ({ size }: IconProps) => (
  <svg width={size ?? 22} height={size ?? 22} viewBox="0 0 32 32" fill="none">
    <rect x="2" y="2" width="28" height="28" rx="7" fill="var(--accent)" />
    <rect x="7" y="9" width="14" height="4" rx="2" fill="var(--accent-ink)" opacity="0.95" />
    <rect x="11" y="15" width="14" height="4" rx="2" fill="var(--accent-ink)" opacity="0.7" />
    <rect x="7" y="21" width="10" height="4" rx="2" fill="var(--accent-ink)" opacity="0.45" />
  </svg>
)
