import { ALL_KINDS, type PieceKind } from '@/game/pieces'
import { SKIN_SPRITE_URL, type Skin } from './config'

// The 4×4 sprite sheets share the same cell order as ALL_KINDS.
const KIND_INDEX: Record<PieceKind, number> = Object.fromEntries(
  ALL_KINDS.map((k, i) => [k, i]),
) as Record<PieceKind, number>

/** Grid coordinates of a kind's cell in the 4×4 sprite sheet. */
export function spriteCoords(kind: PieceKind): { col: number; row: number } {
  const idx = KIND_INDEX[kind]
  return { col: idx % 4, row: Math.floor(idx / 4) }
}

const loadedSpriteSkins = new Set<Skin>()

export function isSkinSpritesLoaded(skin: Skin): boolean {
  return loadedSpriteSkins.has(skin)
}

/** Preload a skin's piece sprite sheet before switching `data-skin`. */
export function preloadSkinSprites(skin: Skin): Promise<void> {
  if (loadedSpriteSkins.has(skin)) return Promise.resolve()

  const url = SKIN_SPRITE_URL[skin]
  return new Promise((resolve, reject) => {
    const img = new Image()
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      void img.decode?.().then(markLoaded).catch(markLoaded)
    }

    const markLoaded = () => {
      loadedSpriteSkins.add(skin)
      resolve()
    }

    img.onload = finish
    img.onerror = () => reject(new Error(`Failed to load ${url}`))
    img.src = url
    if (img.complete) finish()
  })
}
