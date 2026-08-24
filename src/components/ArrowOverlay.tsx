import { SIZE, colOf, onBoard, rowOf, type Color, type Move } from '@/game/types'
import { PIECES, dirsFor, isArcher, type PieceKind } from '@/game/pieces'
import { CAPTURE_COLOR, MOVE_COLOR } from '@/palette'

// Generic arrow overlay drawn over the board grid. Units are board cells
// (viewBox 0 0 SIZE SIZE). Used for two things:
//   • draft preview — one arrow per movement direction from the hovered cell;
//     the ghost piece itself is drawn inside the grid cell in Board.tsx
//     direction (length capped at the board edge);
//   • move hints — when a piece is selected, red arrows toward captures and
//     green arrows toward empty destinations.

export { OWNER_COLOR } from '@/palette'

/** One arrow: a board-space direction, length in cells, and a colour. */
export interface ArrowSpec {
  dr: number
  dc: number
  len: number
  color: string
  dashed?: boolean
  /** End at this cell centre (archer shots to a specific target). */
  to?: number
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

/** Turn a selected piece's legal moves into aim arrows. Archer shots are dashed
 *  to the target; archer slides and other pieces use solid arrows. */
export function moveArrows(from: number, moves: Move[], kind: PieceKind): ArrowSpec[] {
  const fr = rowOf(from)
  const fc = colOf(from)

  if (isArcher(kind)) {
    const byKey = new Map<string, ArrowSpec>()
    for (const m of moves) {
      const dr = sign(rowOf(m.to) - fr)
      const dc = sign(colOf(m.to) - fc)
      const len = Math.max(Math.abs(rowOf(m.to) - fr), Math.abs(colOf(m.to) - fc))
      const key = `${dr},${dc},${m.capture ? 'c' : 'm'}`
      if (m.capture) {
        byKey.set(key, { dr, dc, len, to: m.to, color: CAPTURE_COLOR, dashed: true })
      } else {
        byKey.set(key, { dr, dc, len, color: MOVE_COLOR })
      }
    }
    return [...byKey.values()]
  }

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
}

export function ArrowOverlay({ cell, arrows, orientation }: Props) {
  const row = rowOf(cell)
  const col = colOf(cell)
  const dRow = orientation === 'white' ? row : SIZE - 1 - row
  const dCol = orientation === 'white' ? col : SIZE - 1 - col
  const cx = dCol + 0.5
  const cy = dRow + 0.5

  return (
    <svg className="arrow-overlay" viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {arrows.map((a, n) => {
        const sdr = orientation === 'white' ? a.dr : -a.dr
        const sdc = orientation === 'white' ? a.dc : -a.dc
        let ex: number
        let ey: number
        if (a.to != null) {
          const tr = rowOf(a.to)
          const tc = colOf(a.to)
          const dtr = orientation === 'white' ? tr : SIZE - 1 - tr
          const dtc = orientation === 'white' ? tc : SIZE - 1 - tc
          ex = dtc + 0.5
          ey = dtr + 0.5
        } else {
          ex = cx + sdc * a.len
          ey = cy + sdr * a.len
        }
        const dx = ex - cx
        const dy = ey - cy
        const mag = Math.hypot(dx, dy) || 1
        const ux = dx / mag
        const uy = dy / mag
        const sx = cx + ux * 0.34
        const sy = cy + uy * 0.34
        const head = 0.2
        const half = 0.13
        const bx = ex - ux * head
        const by = ey - uy * head
        const px = -uy
        const py = ux
        return (
          <g key={n} stroke={a.color} fill={a.color}>
            {/* Stop the shaft at the head's base so its rounded cap doesn't poke
                out past the tip (which made the head look slid-back). */}
            <line
              x1={sx}
              y1={sy}
              x2={bx}
              y2={by}
              strokeWidth={0.07}
              strokeLinecap="round"
              strokeDasharray={a.dashed ? '0.14 0.1' : undefined}
            />
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
