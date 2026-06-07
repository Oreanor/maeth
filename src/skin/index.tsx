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
import { createPortal } from 'react-dom'
import { useI18n } from '@/i18n'
import { applySkinToDocument, readStoredSkin, type Skin } from './config'
import { preloadSkinSprites, isSkinSpritesLoaded } from './sprites'

export { DEFAULT_SKIN, SKINS, SKIN_I18N, SKIN_SPRITE_URL, type Skin } from './config'

function waitNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

interface SkinContextValue {
  skin: Skin
  skinLoading: boolean
  setSkin: (skin: Skin) => void
}

const SkinContext = createContext<SkinContextValue | null>(null)

export function SkinProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [skin, setSkinState] = useState<Skin>(readStoredSkin)
  const [skinLoading, setSkinLoading] = useState(false)
  const loadIdRef = useRef(0)

  useEffect(() => {
    applySkinToDocument(skin)
    void preloadSkinSprites(skin)
  }, [skin])

  const setSkin = useCallback(
    (next: Skin) => {
      if (next === skin) return
      if (isSkinSpritesLoaded(next)) {
        setSkinState(next)
        return
      }
      const loadId = ++loadIdRef.current
      setSkinLoading(true)
      void (async () => {
        await waitNextPaint()
        try {
          await preloadSkinSprites(next)
          if (loadIdRef.current === loadId) setSkinState(next)
        } catch {
          if (loadIdRef.current === loadId) setSkinState(next)
        } finally {
          if (loadIdRef.current === loadId) setSkinLoading(false)
        }
      })()
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
      {skinLoading &&
        createPortal(
          <div className="skin-loading" role="status" aria-live="polite" aria-busy="true">
            <div className="skin-loading__card">
              <div className="skin-loading__spinner" aria-hidden />
              <span>{t('lobby.styleLoading')}</span>
            </div>
          </div>,
          document.body,
        )}
    </SkinContext.Provider>
  )
}

export function useSkin(): SkinContextValue {
  const ctx = useContext(SkinContext)
  if (!ctx) throw new Error('useSkin must be used within SkinProvider')
  return ctx
}
