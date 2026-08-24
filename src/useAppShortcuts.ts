import { useEffect } from 'react'
import { BOARD_STYLES, useBoardView } from '@/boardView'
import { LANGS, useI18n } from '@/i18n'
import { SKINS, useSkin } from '@/skin'
import { useTheme } from '@/theme'

/** Next value in a list, wrapping around. */
function next<T>(values: readonly T[], current: T): T {
  const index = values.indexOf(current)
  return values[(index + 1) % values.length]
}

/**
 * Single-key shortcuts for the settings that are worth flipping quickly while
 * looking at the board:
 *
 *   B  board style        F  pieces        V  2D / 3D
 *   L  language           T  theme
 *
 * Every one of these is also in the settings menu — this is a faster path to
 * the same state, not a second source of truth.
 */
export function useAppShortcuts(): void {
  const {
    viewMode,
    setViewMode,
    boardStyle,
    setBoardStyle,
    threePieceStyle,
    setThreePieceStyle,
  } = useBoardView()
  const { lang, setLang } = useI18n()
  const { skin, setSkin } = useSkin()
  const { toggle } = useTheme()

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
        case 'KeyB':
          setBoardStyle(next(BOARD_STYLES, boardStyle))
          break
        case 'KeyF':
          // "Pieces" means whichever set the current view actually draws.
          if (viewMode === '3d') {
            setThreePieceStyle(threePieceStyle === 'painted' ? 'classic' : 'painted')
          } else {
            setSkin(next(SKINS, skin))
          }
          break
        case 'KeyV':
          setViewMode(viewMode === '3d' ? '2d' : '3d')
          break
        case 'KeyL':
          setLang(next(LANGS, lang))
          break
        case 'KeyT':
          toggle()
          break
        default:
          return
      }
      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    boardStyle,
    lang,
    setBoardStyle,
    setLang,
    setSkin,
    setThreePieceStyle,
    setViewMode,
    skin,
    threePieceStyle,
    toggle,
    viewMode,
  ])
}
