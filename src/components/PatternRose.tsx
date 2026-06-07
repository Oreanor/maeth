import type { Pattern } from '@/game/pieces'
import './PatternRose.css'

/** Eight compass rays: NW N NE W E SW S SE. */
const RAYS: Array<{ dx: number; dy: number }> = [
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
]

const PATTERN_RAYS: Record<Pattern, number[]> = {
  ortho: [1, 3, 4, 6],
  diag: [0, 2, 5, 7],
  zh: [0, 1, 2, 5, 6, 7],
  all: [0, 1, 2, 3, 4, 5, 6, 7],
}

const ACTIVE = Object.fromEntries(
  (Object.entries(PATTERN_RAYS) as Array<[Pattern, number[]]>).map(([pattern, rays]) => [
    pattern,
    new Set(rays),
  ]),
) as Record<Pattern, Set<number>>

/** Radial direction icon on a square grid: ortho, diag, 6-ray Ж (no E/W), or 8-ray. */
export function PatternRose({
  pattern,
  size = 12,
  dashed = false,
  className = '',
}: {
  pattern: Pattern
  size?: number
  dashed?: boolean
  className?: string
}) {
  const on = ACTIVE[pattern]
  const cx = 10
  const cy = 10
  /** Tips on a square (L∞), like the Ж letter — not on a circle. */
  const hOuter = 7.5
  const hInner = 2.2

  return (
    <svg
      className={`pattern-rose ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden
    >
      <circle className="pattern-rose__hub" cx={cx} cy={cy} r={1.6} />
      {RAYS.map((ray, i) => {
        if (!on.has(i)) return null
        return (
          <line
            key={i}
            className="pattern-rose__ray"
            x1={cx + ray.dx * hInner}
            y1={cy + ray.dy * hInner}
            x2={cx + ray.dx * hOuter}
            y2={cy + ray.dy * hOuter}
            strokeWidth={2.2}
            strokeLinecap="butt"
            strokeDasharray={dashed ? '2 1.4' : undefined}
          />
        )
      })}
    </svg>
  )
}
