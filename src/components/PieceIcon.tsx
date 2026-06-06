import type { CSSProperties } from 'react'
import { PIECES, type PieceKind } from '@/game/pieces'
import { spriteCoords } from '@/skin/sprites'
import { useSkin } from '@/skin'
import './PieceIcon.css'

/** Piece portrait: emoji in the default skin, sprite art otherwise. */
export function PieceIcon({ kind, className = '' }: { kind: PieceKind; className?: string }) {
  const { skin } = useSkin()
  const def = PIECES[kind]

  if (skin === 'default') {
    return <span className={`piece-icon piece-icon--emoji ${className}`.trim()}>{def.emoji}</span>
  }

  const { col, row } = spriteCoords(kind)

  return (
    <span
      className={`piece-icon piece-icon--sprite ${className}`.trim()}
      style={{ '--sprite-col': col, '--sprite-row': row } as CSSProperties}
      role="img"
      aria-label={def.name}
    />
  )
}
