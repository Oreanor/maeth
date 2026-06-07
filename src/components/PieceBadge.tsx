import { PIECES, isArcher, type PieceKind } from '@/game/pieces'
import { PatternRose } from './PatternRose'

/** Range + direction rose (+ archer mark) on the piece pill. */
export function PieceBadge({ kind, roseSize = 13 }: { kind: PieceKind; roseSize?: number }) {
  const def = PIECES[kind]
  return (
    <span className="piece__badge">
      {isArcher(kind) && (
        <span className="piece__badge-archer" aria-hidden>
          ↗
        </span>
      )}
      <span className="piece__badge-range">{def.range}</span>
      <PatternRose pattern={def.pattern} size={roseSize} className="piece__badge-rose" />
    </span>
  )
}
