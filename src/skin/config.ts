const SKIN_ENTRIES = [
  { id: 'engraving', i18n: 'lobby.styleEngraving' },
  { id: 'color-engraving', i18n: 'lobby.styleColorEngraving' },
  { id: 'monochrome', i18n: 'lobby.styleMonochrome' },
  { id: 'fantasy', i18n: 'lobby.styleFantasy' },
  { id: 'dnd', i18n: 'lobby.styleDnd' },
  { id: 'southpark', i18n: 'lobby.styleSouthPark' },
  { id: 'southpark-gothic', i18n: 'lobby.styleSouthParkGothic' },
  { id: 'simpsons', i18n: 'lobby.styleSimpsons' },
  { id: 'chess', i18n: 'lobby.styleChess' },
  { id: '8bit', i18n: 'lobby.style8bit' },
  { id: '16bit', i18n: 'lobby.style16bit' },
] as const

export type Skin = (typeof SKIN_ENTRIES)[number]['id']

export const DEFAULT_SKIN: Skin = 'chess'

export const SKINS: Skin[] = SKIN_ENTRIES.map((entry) => entry.id)

export const SKIN_I18N = Object.fromEntries(SKIN_ENTRIES.map((e) => [e.id, e.i18n])) as Record<
  Skin,
  string
>

/** Each sheet in `public/pieces/` is named after its skin id. */
export function skinSpriteUrl(skin: Skin): string {
  return `/pieces/${skin}.webp`
}

export const SKIN_SPRITE_URL = Object.fromEntries(
  SKINS.map((id) => [id, skinSpriteUrl(id)]),
) as Record<Skin, string>

const STORAGE_KEY = 'maeth.skin'

/** Read persisted skin, migrating legacy `default` to chess. */
export function readStoredSkin(): Skin {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'default') return DEFAULT_SKIN
  return SKINS.includes(stored as Skin) ? (stored as Skin) : DEFAULT_SKIN
}

export function applySkinToDocument(skin: Skin): void {
  document.documentElement.setAttribute('data-skin', skin)
  document.documentElement.style.setProperty('--skin-sprite-url', `url('${SKIN_SPRITE_URL[skin]}')`)
  localStorage.setItem(STORAGE_KEY, skin)
}
