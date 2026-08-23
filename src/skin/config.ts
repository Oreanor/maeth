const SKIN_ENTRIES = [
  { id: 'engraving', i18n: 'lobby.styleEngraving', sprite: '/pieces-engraving.webp' },
  { id: 'color-engraving', i18n: 'lobby.styleColorEngraving', sprite: '/pieces-color-engraving.webp' },
  { id: 'monochrome', i18n: 'lobby.styleMonochrome', sprite: '/pieces-monochrome.webp' },
  { id: 'fantasy', i18n: 'lobby.styleFantasy', sprite: '/pieces-fantasy.webp' },
  { id: 'dnd', i18n: 'lobby.styleDnd', sprite: '/pieces-3d.webp' },
  { id: 'southpark', i18n: 'lobby.styleSouthPark', sprite: '/pieces-southpark.webp' },
  { id: 'southpark-gothic', i18n: 'lobby.styleSouthParkGothic', sprite: '/pieces-southpark-gothic.webp' },
  { id: 'simpsons', i18n: 'lobby.styleSimpsons', sprite: '/pieces-simpsons.webp' },
  { id: 'chess', i18n: 'lobby.styleChess', sprite: '/pieces-chess.webp' },
  { id: '8bit', i18n: 'lobby.style8bit', sprite: '/pieces-8bit.webp' },
  { id: '16bit', i18n: 'lobby.style16bit', sprite: '/pieces-16bit.webp' },
] as const

export type Skin = (typeof SKIN_ENTRIES)[number]['id']

export const DEFAULT_SKIN: Skin = 'chess'

export const SKINS: Skin[] = SKIN_ENTRIES.map((entry) => entry.id)

export const SKIN_I18N = Object.fromEntries(SKIN_ENTRIES.map((e) => [e.id, e.i18n])) as Record<
  Skin,
  string
>

export const SKIN_SPRITE_URL = Object.fromEntries(SKIN_ENTRIES.map((e) => [e.id, e.sprite])) as Record<
  Skin,
  string
>

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
