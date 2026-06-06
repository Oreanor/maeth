import { ALL_KINDS, type PieceKind } from '@/game/pieces'
import type { Skin } from './index'

// The 4×4 sprite sheets share the same cell order as ALL_KINDS.
const KIND_INDEX: Record<PieceKind, number> = Object.fromEntries(
  ALL_KINDS.map((k, i) => [k, i]),
) as Record<PieceKind, number>

/** Grid coordinates of a kind's cell in the 4×4 sprite sheet. */
export function spriteCoords(kind: PieceKind): { col: number; row: number } {
  const idx = KIND_INDEX[kind]
  return { col: idx % 4, row: Math.floor(idx / 4) }
}

export const SPRITE_SKINS: Exclude<Skin, 'default'>[] = [
  'engraving',
  'color-engraving',
  'monochrome',
  'fantasy',
  'southpark',
  'simpsons',
]

export function isSpriteSkin(skin: Skin): boolean {
  return skin !== 'default'
}
