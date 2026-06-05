import { SIZE, colOf, onBoard, rowOf, type Color, type Move } from '@/game/types'
import { PIECES, dirsFor, type PieceKind } from '@/game/pieces'

// Generic arrow overlay drawn over the board grid. Units are board cells
// (viewBox 0 0 SIZE SIZE). Used for two things:
//   • draft preview — a translucent ghost piece + one arrow per movement
//     direction (length capped at the board edge);
//   • move hints — when a piece is selected, red arrows toward captures and
//     green arrows toward empty destinations.

export const OWNER_COLOR: Record<Color, string> = { white: '#4a90d9', black: '#d64545' }
export const CAPTURE_COLOR = '#e23b34'
export const MOVE_COLOR = '#3fae5a'

/** One arrow: a board-space direction, length in cells, and a colour. */
export interface ArrowSpec {
  dr: number
  dc: number
  len: number
  color: string
}

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0)

/** Geometric reach of a piece kind: one arrow per direction, capped at the edge. */
export function edgeArrows(cell: number, kind: PieceKind, color: string): ArrowSpec[] {
  const row = rowOf(cell)
  const col = colOf(cell)
  const def = PIECES[kind]
  const out: ArrowSpec[] = []
  for (const [dr, dc] of dirsFor(def.pattern)) {
    let len = 0
    for (let k = 1; k <= def.range; k++) {
      if (onBoard(row + dr * k, col + dc * k)) len = k
      else break
    }
    if (len > 0) out.push({ dr, dc, len, color })
  }
  return out
}

/** Turn a selected piece's legal moves into one arrow per direction (farthest
 *  reachable cell), red if that direction ends in a capture, green otherwise. */
export function moveArrows(from: number, moves: Move[]): ArrowSpec[] {
  const fr = rowOf(from)
  const fc = colOf(from)
  const byDir = new Map<string, { dr: number; dc: number; len: number; capture: boolean }>()
  for (const m of moves) {
    const dr = sign(rowOf(m.to) - fr)
    const dc = sign(colOf(m.to) - fc)
    const len = Math.max(Math.abs(rowOf(m.to) - fr), Math.abs(colOf(m.to) - fc))
    const key = `${dr},${dc}`
    const cur = byDir.get(key)
    if (!cur || len > cur.len) byDir.set(key, { dr, dc, len, capture: m.capture })
  }
  return [...byDir.values()].map(({ dr, dc, len, capture }) => ({
    dr,
    dc,
    len,
    color: capture ? CAPTURE_COLOR : MOVE_COLOR,
  }))
}

interface Props {
  cell: number
  arrows: ArrowSpec[]
  orientation: Color
  /** Optional ghost piece (draft preview). */
  ghost?: { kind: PieceKind; color: Color }
}

export function ArrowOverlay({ cell, arrows, orientation, ghost }: Props) {
  const row = rowOf(cell)
  const col = colOf(cell)
  const dRow = orientation === 'white' ? row : SIZE - 1 - row
  const dCol = orientation === 'white' ? col : SIZE - 1 - col
  const cx = dCol + 0.5
  const cy = dRow + 0.5

  return (
    <svg className="arrow-overlay" viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {ghost && (
        <>
          <rect
            x={dCol + 0.09}
            y={dRow + 0.09}
            width={0.82}
            height={0.82}
            rx={0.14}
            fill={OWNER_COLOR[ghost.color]}
            opacity={0.28}
            stroke={OWNER_COLOR[ghost.color]}
            strokeWidth={0.04}
          />
          <text
            x={cx}
            y={cy}
            fontSize={0.5}
            textAnchor="middle"
            dominantBaseline="central"
            opacity={0.85}
          >
            {PIECES[ghost.kind].emoji}
          </text>
        </>
      )}

      {arrows.map((a, n) => {
        const sdr = orientation === 'white' ? a.dr : -a.dr
        const sdc = orientation === 'white' ? a.dc : -a.dc
        const mag = Math.hypot(sdc, sdr) || 1
        const ux = sdc / mag
        const uy = sdr / mag
        const sx = cx + ux * 0.34
        const sy = cy + uy * 0.34
        const ex = cx + sdc * a.len
        const ey = cy + sdr * a.len
        const head = 0.2
        const half = 0.13
        const bx = ex - ux * head
        const by = ey - uy * head
        const px = -uy
        const py = ux
        return (
          <g key={n} stroke={a.color} fill={a.color}>
            <line x1={sx} y1={sy} x2={ex} y2={ey} strokeWidth={0.07} strokeLinecap="round" />
            <polygon
              points={`${ex},${ey} ${bx + px * half},${by + py * half} ${bx - px * half},${by - py * half}`}
              stroke="none"
            />
          </g>
        )
      })}
    </svg>
  )
}
