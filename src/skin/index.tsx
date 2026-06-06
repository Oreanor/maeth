import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

// Visual skin: board colours and piece art. 'default' keeps emoji + the blue/grey
// board; the others use sprite sheets from /public.
export type Skin =
  | 'default'
  | 'engraving'
  | 'color-engraving'
  | 'monochrome'
  | 'fantasy'
  | 'southpark'
  | 'simpsons'

export const SKINS: Skin[] = [
  'default',
  'engraving',
  'color-engraving',
  'monochrome',
  'fantasy',
  'southpark',
  'simpsons',
]

export const SKIN_I18N: Record<Skin, string> = {
  default: 'lobby.styleDefault',
  engraving: 'lobby.styleEngraving',
  'color-engraving': 'lobby.styleColorEngraving',
  monochrome: 'lobby.styleMonochrome',
  fantasy: 'lobby.styleFantasy',
  southpark: 'lobby.styleSouthPark',
  simpsons: 'lobby.styleSimpsons',
}

const STORAGE_KEY = 'maeth.skin'

function detectSkin(): Skin {
  const stored = localStorage.getItem(STORAGE_KEY)
  return SKINS.includes(stored as Skin) ? (stored as Skin) : 'default'
}

interface SkinContextValue {
  skin: Skin
  setSkin: (skin: Skin) => void
}

const SkinContext = createContext<SkinContextValue | null>(null)

export function SkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<Skin>(detectSkin)

  useEffect(() => {
    document.documentElement.setAttribute('data-skin', skin)
    localStorage.setItem(STORAGE_KEY, skin)
  }, [skin])

  const value = useMemo<SkinContextValue>(
    () => ({
      skin,
      setSkin: setSkinState,
    }),
    [skin],
  )

  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>
}

export function useSkin(): SkinContextValue {
  const ctx = useContext(SkinContext)
  if (!ctx) throw new Error('useSkin must be used within SkinProvider')
  return ctx
}
