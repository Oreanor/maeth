import { PIECES, isArcher, type PieceKind } from '@/game/pieces'
import { PatternRose } from './PatternRose'

/** Range and direction rose on the piece pill. An archer's rays are dotted,
 *  the same way the rules table draws them — that says "shoots" on its own, so
 *  the badge carries no separate archer mark. */
export function PieceBadge({ kind, roseSize = 13 }: { kind: PieceKind; roseSize?: number }) {
  const def = PIECES[kind]
  return (
    <span className="piece__badge">
      <PatternRose
        pattern={def.pattern}
        dashed={isArcher(kind)}
        size={roseSize}
        className="piece__badge-rose"
      />
      <span className="piece__badge-range">{def.range}</span>
    </span>
  )
}
