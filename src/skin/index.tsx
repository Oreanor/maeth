import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useI18n } from '@/i18n'
import { preloadSkinSprites } from './sprites'

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
  | 'chess'
  | '8bit'
  | '16bit'

export const SKINS: Skin[] = [
  'default',
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

export const SKIN_I18N: Record<Skin, string> = {
  default: 'lobby.styleDefault',
  engraving: 'lobby.styleEngraving',
  'color-engraving': 'lobby.styleColorEngraving',
  monochrome: 'lobby.styleMonochrome',
  fantasy: 'lobby.styleFantasy',
  southpark: 'lobby.styleSouthPark',
  simpsons: 'lobby.styleSimpsons',
  chess: 'lobby.styleChess',
  '8bit': 'lobby.style8bit',
  '16bit': 'lobby.style16bit',
}

const STORAGE_KEY = 'maeth.skin'

function detectSkin(): Skin {
  const stored = localStorage.getItem(STORAGE_KEY)
  return SKINS.includes(stored as Skin) ? (stored as Skin) : 'default'
}

interface SkinContextValue {
  skin: Skin
  skinLoading: boolean
  setSkin: (skin: Skin) => void
}

const SkinContext = createContext<SkinContextValue | null>(null)

export function SkinProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [skin, setSkinState] = useState<Skin>(detectSkin)
  const [skinLoading, setSkinLoading] = useState(false)
  const loadIdRef = useRef(0)

  useEffect(() => {
    if (skin !== 'default') return
    setSkinLoading(false)
  }, [skin])

  useEffect(() => {
    const initial = detectSkin()
    if (initial === 'default') return
    const loadId = ++loadIdRef.current
    setSkinLoading(true)
    preloadSkinSprites(initial).finally(() => {
      if (loadIdRef.current === loadId) setSkinLoading(false)
    })
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-skin', skin)
    localStorage.setItem(STORAGE_KEY, skin)
  }, [skin])

  const setSkin = useCallback(
    (next: Skin) => {
      if (next === skin) return
      if (next === 'default') {
        setSkinState('default')
        return
      }
      const loadId = ++loadIdRef.current
      setSkinLoading(true)
      preloadSkinSprites(next)
        .then(() => {
          if (loadIdRef.current === loadId) setSkinState(next)
        })
        .catch(() => {
          if (loadIdRef.current === loadId) setSkinState(next)
        })
        .finally(() => {
          if (loadIdRef.current === loadId) setSkinLoading(false)
        })
    },
    [skin],
  )

  const value = useMemo<SkinContextValue>(
    () => ({
      skin,
      skinLoading,
      setSkin,
    }),
    [skin, skinLoading, setSkin],
  )

  return (
    <SkinContext.Provider value={value}>
      {children}
      {skinLoading && (
        <div className="skin-loading" role="status" aria-live="polite">
          <div className="skin-loading__card">
            <div className="skin-loading__spinner" aria-hidden />
            <span>{t('lobby.styleLoading')}</span>
          </div>
        </div>
      )}
    </SkinContext.Provider>
  )
}

export function useSkin(): SkinContextValue {
  const ctx = useContext(SkinContext)
  if (!ctx) throw new Error('useSkin must be used within SkinProvider')
  return ctx
}
