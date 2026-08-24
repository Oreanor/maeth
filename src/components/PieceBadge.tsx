import { PIECES, isArcher, type PieceKind } from '@/game/pieces'
import { PatternRose } from './PatternRose'

/** Range and direction rose on the piece pill. An archer's rays are dotted,
 *  the same way the rules table draws them — that says "shoots" on its own, so
 *  the badge carries no separate archer mark. */
export function PieceBadge({
  kind,
  roseSize = 13,
  name,
}: {
  kind: PieceKind
  roseSize?: number
  /** Shown ahead of the pattern where there is room for it — the floating
   *  labels over the 3D board. In a 2D cell the badge stays compact. */
  name?: string
}) {
  const def = PIECES[kind]
  return (
    <span className="piece__badge">
      {name && <span className="piece__badge-name">{name}</span>}
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
