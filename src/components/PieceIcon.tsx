import type { CSSProperties } from 'react'
import { useI18n } from '@/i18n'
import { pieceName, type PieceKind } from '@/game/pieces'
import { spriteCoords } from '@/skin/sprites'
import './PieceIcon.css'

/** Piece portrait from the active skin's sprite sheet. */
export function PieceIcon({ kind, className = '' }: { kind: PieceKind; className?: string }) {
  const { t } = useI18n()
  const { col, row } = spriteCoords(kind)

  return (
    <span
      className={`piece-icon piece-icon--sprite ${className}`.trim()}
      style={{ '--sprite-col': col, '--sprite-row': row } as CSSProperties}
      role="img"
      aria-label={pieceName(kind, t)}
    />
  )
}
