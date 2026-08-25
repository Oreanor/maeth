import type { CSSProperties } from 'react'
import { SIZE, opposite, type Color } from '@/game/types'
import { displayCell } from './boardGeometry'
import { isArcher, type PieceKind } from '@/game/pieces'
import type { AnimInfo } from '@/game/presentation'
import { PieceBadge } from './PieceBadge'
import { PieceIcon } from './PieceIcon'
import { OWNER_COLOR } from '@/palette'
import './MoveAnimation.css'

/**
 * Plays the move: an arrow is drawn toward the target, then (for a normal move
 * or capture) the attacker slides across, the victim shrinking as it lands. A
 * contested strike shows an aim arrow first when the opponent attacks, then the
 * duel modal; your own duels skip the pre-roll arrow.
 */
export function MoveAnimation({ anim, orientation }: { anim: AnimInfo; orientation: Color }) {
  const f = displayCell(anim.from, orientation)
  const t = displayCell(anim.to, orientation)
  const dx = t.col - f.col
  const dy = t.row - f.row
  const cell = 100 / SIZE // percent of the board per cell

  const fcx = f.col + 0.5
  const fcy = f.row + 0.5
  const tcx = t.col + 0.5
  const tcy = t.row + 0.5
  const lineLen = Math.hypot(tcx - fcx, tcy - fcy)
  const color = OWNER_COLOR[anim.owner]
  const archer = isArcher(anim.attacker)
  const archerShot = archer && anim.kind === 'capture'
  const slide = anim.kind !== 'duel' && !archerShot

  const box = (r: number, c: number): CSSProperties => ({
    left: `${c * cell}%`,
    top: `${r * cell}%`,
    width: `${cell}%`,
    height: `${cell}%`,
  })

  const animPiece = (kind: PieceKind, color: Color) => (
    <span className={`piece piece--${color}`}>
      <PieceIcon kind={kind} className="piece__icon" />
      <PieceBadge kind={kind} />
    </span>
  )

  return (
    <div className="move-anim">
      <svg className="move-anim__arrow" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <line
          className={`move-anim__line ${archerShot ? 'move-anim__line--archer' : ''}`.trim()}
          x1={fcx}
          y1={fcy}
          x2={tcx}
          y2={tcy}
          stroke={color}
          strokeWidth={0.09}
          strokeLinecap="round"
          strokeDasharray={lineLen}
          style={{ ['--len' as string]: lineLen } as CSSProperties}
        />
      </svg>

      {slide && (
        <div
          className="anim-attacker anim-attacker--move"
          style={
            { ...box(f.row, f.col), ['--dx' as string]: dx, ['--dy' as string]: dy } as CSSProperties
          }
        >
          {animPiece(anim.attacker, anim.owner)}
        </div>
      )}

      {anim.kind === 'capture' && anim.victim && (
        <div
          className={`anim-victim ${archerShot ? 'anim-victim--archer' : ''}`.trim()}
          style={box(t.row, t.col)}
        >
          {animPiece(anim.victim, opposite(anim.owner))}
        </div>
      )}
    </div>
  )
}
