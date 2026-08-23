import type { CSSProperties } from 'react'
import { useI18n } from '@/i18n'
import { pieceName, type PieceKind } from '@/game/pieces'
import { spriteCoords } from '@/skin/sprites'
import './PieceIcon.css'

/** Piece portrait from the active skin, or an explicitly supplied sprite sheet. */
export function PieceIcon({
  kind,
  className = '',
  spriteUrl,
}: {
  kind: PieceKind
  className?: string
  spriteUrl?: string
}) {
  const { t } = useI18n()
  const { col, row } = spriteCoords(kind)

  return (
    <span
      className={`piece-icon piece-icon--sprite ${className}`.trim()}
      style={
        {
          '--sprite-col': col,
          '--sprite-row': row,
          ...(spriteUrl ? { '--piece-sprite-url': `url('${spriteUrl}')` } : {}),
        } as CSSProperties
      }
      role="img"
      aria-label={pieceName(kind, t)}
    />
  )
}
