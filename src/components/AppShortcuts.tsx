import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { BOARD_STYLES, THREE_PIECE_STYLES, useBoardView } from '@/boardView'
import { LANGS, useI18n } from '@/i18n'
import { SKINS, SKIN_I18N, useSkin } from '@/skin'
import { useTheme } from '@/theme'
import { useAuth } from '@/auth/AuthContext'
import { useChatSettings } from '@/chat/ChatSettings'
import './AppShortcuts.css'

/** How long the confirmation stays before fading. */
const TOAST_MS = 1100

/**
 * What a shortcut just changed, as translation keys rather than finished text.
 *
 * This matters for the language key above all: the toast is rendered after the
 * change lands, so holding keys lets it come out in the language that was just
 * chosen — a Portuguese speaker reads "Idioma: Português" and knows they got
 * what they wanted, rather than being told so in the language they left.
 */
interface Announcement {
  id: number
  labelKey: string
  valueKey: string
  valueVars?: Record<string, string>
}

const PIECE_STYLE_KEY: Record<string, string> = {
  painted: 'lobby.pieceStyle3dPainted',
  classic: 'lobby.pieceStyle3dClassic',
  wood: 'lobby.pieceStyle3dWood',
  stone: 'lobby.pieceStyle3dStone',
  bone: 'lobby.pieceStyle3dBone',
  metal: 'lobby.pieceStyle3dMetal',
}

/** Next value in a list, wrapping around. */
function next<T>(values: readonly T[], current: T): T {
  const index = values.indexOf(current)
  return values[(index + 1) % values.length]
}

/**
 * Single-key shortcuts for the settings worth flipping while looking at the
 * board, and the confirmation each one shows:
 *
 *   B  board style        F  pieces        V  2D / 3D
 *   L  language           T  theme          C  talking pieces
 *   A  square labels       Q  leave a game   E  sign out
 *
 * Every one is also in the settings menu — this is a faster path to the same
 * thing, not a second source of truth. The last two go somewhere rather than
 * change something, so they show no confirmation: the screen is the answer.
 */
export function AppShortcuts() {
  const {
    viewMode,
    setViewMode,
    boardStyle,
    setBoardStyle,
    threePieceStyle,
    setThreePieceStyle,
    coords,
    toggleCoords,
  } = useBoardView()
  const { t, lang, setLang } = useI18n()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const { skin, setSkin } = useSkin()
  const { theme, toggle } = useTheme()
  const { chatEnabled, toggleChat } = useChatSettings()

  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const idRef = useRef(0)

  const announce = useCallback((labelKey: string, valueKey: string, valueVars?: Record<string, string>) => {
    setAnnouncement({ id: ++idRef.current, labelKey, valueKey, valueVars })
  }, [])

  useEffect(() => {
    if (!announcement) return
    const timer = window.setTimeout(() => {
      setAnnouncement((current) => (current?.id === announcement.id ? null : current))
    }, TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [announcement])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Leave chords to the browser, and never steal a key from a field being
      // typed into — holding a key must not spin through ten board styles.
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable]')) return

      // `code` follows the physical key, so shortcuts keep working when the
      // active keyboard layout produces Cyrillic or any other alphabet.
      switch (event.code) {
        case 'KeyB': {
          const style = next(BOARD_STYLES, boardStyle)
          setBoardStyle(style)
          announce('lobby.boardStyle', 'lobby.boardNumber', {
            number: String(BOARD_STYLES.indexOf(style) + 1),
          })
          break
        }
        case 'KeyF': {
          // "Pieces" means whichever set the current view actually draws.
          if (viewMode === '3d') {
            const style = next(THREE_PIECE_STYLES, threePieceStyle)
            setThreePieceStyle(style)
            announce('lobby.pieceStyle', PIECE_STYLE_KEY[style])
          } else {
            const nextSkin = next(SKINS, skin)
            setSkin(nextSkin)
            announce('lobby.pieceStyle', SKIN_I18N[nextSkin])
          }
          break
        }
        case 'KeyV': {
          const mode = viewMode === '3d' ? '2d' : '3d'
          setViewMode(mode)
          announce('lobby.boardView', mode === '3d' ? 'lobby.boardView3d' : 'lobby.boardView2d')
          break
        }
        case 'KeyL': {
          const nextLang = next(LANGS, lang)
          setLang(nextLang)
          announce('lobby.language', `languages.${nextLang}`)
          break
        }
        case 'KeyC': {
          toggleChat()
          announce('lobby.aiChat', chatEnabled ? 'lobby.aiChatOff' : 'lobby.aiChatOn')
          break
        }
        case 'KeyT': {
          toggle()
          announce('lobby.theme', theme === 'dark' ? 'lobby.themeLight' : 'lobby.themeDark')
          break
        }
        case 'KeyA': {
          toggleCoords()
          announce('lobby.coords', coords ? 'lobby.coordsOff' : 'lobby.coordsOn')
          break
        }
        case 'KeyQ': {
          // Only from a game — in the lobby there is nothing to leave, and the
          // key should go back to whoever else might want it.
          if (!pathname.startsWith('/play')) return
          navigate('/')
          break
        }
        case 'KeyE': {
          if (!user) return
          logout()
          navigate('/')
          break
        }
        default:
          return
      }
      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    announce,
    boardStyle,
    chatEnabled,
    coords,
    lang,
    logout,
    navigate,
    pathname,
    setBoardStyle,
    setLang,
    setSkin,
    setThreePieceStyle,
    setViewMode,
    skin,
    theme,
    threePieceStyle,
    toggle,
    toggleChat,
    toggleCoords,
    user,
    viewMode,
  ])

  if (!announcement) return null

  return createPortal(
    <div className="shortcut-toast" role="status" aria-live="polite">
      <span className="shortcut-toast__label">{t(announcement.labelKey)}:</span>
      <span className="shortcut-toast__value">
        {t(announcement.valueKey, announcement.valueVars)}
      </span>
    </div>,
    document.body,
  )
}
