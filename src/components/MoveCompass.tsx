import { PIECES, isArcher, type Pattern, type PieceKind } from '@/game/pieces'

/** 3×3 compass: NW N NE / W · E / SW S SE */
const ARROWS = ['↖', '↑', '↗', '←', '·', '→', '↙', '↓', '↘'] as const

const ORTHO = new Set([1, 3, 5, 7])
const DIAG = new Set([0, 2, 6, 8])
const ZH = new Set([0, 1, 2, 6, 7, 8])
const ALL = new Set([0, 1, 2, 3, 5, 6, 7, 8])

/** Board deltas for each compass cell index (center unused). */
const DIR_DELTA: Array<[number, number] | null> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  null,
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

function activeDirs(pattern: Pattern): Set<number> {
  if (pattern === 'ortho') return ORTHO
  if (pattern === 'diag') return DIAG
  if (pattern === 'zh') return ZH
  return ALL
}

function DashArrow({ dr, dc }: { dr: number; dc: number }) {
  const cx = 3
  const cy = 4
  const x2 = cx + dc * 2.2
  const y2 = cy + dr * 2.2
  return (
    <svg className="move-compass__dash" viewBox="0 0 6 8" aria-hidden>
      <line
        x1={cx}
        y1={cy}
        x2={x2}
        y2={y2}
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeDasharray="1.1 0.75"
      />
    </svg>
  )
}

/** Mini 8-way compass highlighting which directions a piece can strike or slide. */
export function MoveCompass({ kind }: { kind: PieceKind }) {
  const { pattern } = PIECES[kind]
  const on = activeDirs(pattern)
  const archer = isArcher(kind)

  return (
    <div className={`move-compass ${archer ? 'move-compass--archer' : ''}`.trim()} aria-hidden>
      {ARROWS.map((arrow, i) => {
        const center = i === 4
        const active = !center && on.has(i)
        const delta = DIR_DELTA[i]
        return (
          <span
            key={i}
            className={[
              'move-compass__cell',
              center ? 'move-compass__cell--hub' : '',
              active ? 'move-compass__cell--on' : 'move-compass__cell--off',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {center ? (
              '·'
            ) : archer && active && delta ? (
              <DashArrow dr={delta[0]} dc={delta[1]} />
            ) : (
              !archer && arrow
            )}
          </span>
        )
      })}
    </div>
  )
}
