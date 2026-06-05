import type { CSSProperties } from 'react'
import { SIZE, colOf, rowOf, type Color } from '@/game/types'
import { PIECES, type PieceKind } from '@/game/pieces'
import './MoveAnimation.css'

export type AnimKind = 'move' | 'capture' | 'duel'

export interface AnimInfo {
  from: number
  to: number
  kind: AnimKind
  attacker: PieceKind
  /** Captured piece (for the shrink), when kind is 'capture'. */
  victim: PieceKind | null
  owner: Color
}

const OWNER_COLOR: Record<Color, string> = { white: '#4a90d9', black: '#d64545' }

/**
 * Plays the move: an arrow is drawn toward the target, then (for a normal move
 * or capture) the attacker slides across, the victim shrinking as it lands. For
 * a duel only the arrow is drawn — the modal then rolls the dice, and the slide
 * happens afterwards if the strike succeeds.
 */
export function MoveAnimation({ anim, orientation }: { anim: AnimInfo; orientation: Color }) {
  const disp = (i: number) => {
    const r = rowOf(i)
    const c = colOf(i)
    return orientation === 'white' ? { r, c } : { r: SIZE - 1 - r, c: SIZE - 1 - c }
  }
  const f = disp(anim.from)
  const t = disp(anim.to)
  const dx = t.c - f.c
  const dy = t.r - f.r
  const cell = 100 / SIZE // percent of the board per cell

  const fcx = f.c + 0.5
  const fcy = f.r + 0.5
  const tcx = t.c + 0.5
  const tcy = t.r + 0.5
  const len = Math.hypot(tcx - fcx, tcy - fcy)
  const color = OWNER_COLOR[anim.owner]

  const box = (r: number, c: number): CSSProperties => ({
    left: `${c * cell}%`,
    top: `${r * cell}%`,
    width: `${cell}%`,
    height: `${cell}%`,
  })

  return (
    <div className="move-anim">
      <svg className="move-anim__arrow" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <line
          className="move-anim__line"
          x1={fcx}
          y1={fcy}
          x2={tcx}
          y2={tcy}
          stroke={color}
          strokeWidth={0.09}
          strokeLinecap="round"
          strokeDasharray={len}
          style={{ ['--len' as string]: len } as CSSProperties}
        />
      </svg>

      {anim.kind !== 'duel' && (
        <div
          className="anim-attacker anim-attacker--move"
          style={
            { ...box(f.r, f.c), ['--dx' as string]: dx, ['--dy' as string]: dy } as CSSProperties
          }
        >
          {PIECES[anim.attacker].emoji}
        </div>
      )}

      {anim.kind === 'capture' && anim.victim && (
        <div className="anim-victim" style={box(t.r, t.c)}>
          {PIECES[anim.victim].emoji}
        </div>
      )}
    </div>
  )
}
