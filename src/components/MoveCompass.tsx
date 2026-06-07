import { PIECES, isArcher, type PieceKind } from '@/game/pieces'
import { PatternRose } from './PatternRose'

/** Direction preview in the rules table (same rose as on the piece badge). */
export function MoveCompass({ kind }: { kind: PieceKind }) {
  const { pattern } = PIECES[kind]
  return (
    <PatternRose
      pattern={pattern}
      size={20}
      dashed={isArcher(kind)}
      className="move-compass__rose"
    />
  )
}
