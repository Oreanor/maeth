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
  'chess',
  '8bit',
  '16bit',
]

export const SKIN_SPRITE_URL: Record<Exclude<Skin, 'default'>, string> = {
  engraving: '/pieces-engraving.png',
  'color-engraving': '/pieces-color-engraving.png',
  monochrome: '/pieces-monochrome.png',
  fantasy: '/pieces-fantasy.png',
  southpark: '/pieces-southpark.png',
  simpsons: '/pieces-simpsons.png',
  chess: '/pieces-chess.png',
  '8bit': '/pieces-8bit.png',
  '16bit': '/pieces-16bit.png',
}

/** Preload a skin's piece sprite sheet before switching `data-skin`. */
export function preloadSkinSprites(skin: Skin): Promise<void> {
  if (skin === 'default') return Promise.resolve()
  const url = SKIN_SPRITE_URL[skin]
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => reject(new Error(`Failed to load ${url}`))
    img.src = url
  })
}

export function isSpriteSkin(skin: Skin): boolean {
  return skin !== 'default'
}
