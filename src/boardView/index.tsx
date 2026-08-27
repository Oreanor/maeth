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
import {
  BOARD_STYLE_CONFIG,
  DEFAULT_BOARD_STYLE,
  DEFAULT_BOARD_VIEW,
  DEFAULT_THREE_PIECE_STYLE,
  isBoardStyle,
  isBoardViewMode,
  isThreePieceStyle,
  type BoardStyle,
  type BoardViewMode,
  type ThreePieceStyle,
} from './config'

export {
  BOARD_STYLES,
  BOARD_STYLE_CONFIG,
  DEFAULT_BOARD_STYLE,
  DEFAULT_BOARD_VIEW,
  DEFAULT_THREE_PIECE_STYLE,
  THREE_PIECE_STYLES,
  THREE_PIECE_SPRITE_URL,
  type BoardStyle,
  type BoardStyleConfig,
  type BoardViewMode,
  type ThreePieceStyle,
} from './config'

/** Held onto so the browser cannot drop a request that nothing references yet,
 *  and so a second request for the same artwork joins the first. */
const preloaded = new Map<string, Promise<void>>()

function preloadImage(src: string): Promise<void> {
  const started = preloaded.get(src)
  if (started) return started
  const done = new Promise<void>((resolve) => {
    const image = new Image()
    // A failed load resolves too: the board should still switch, just bare.
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = src
    if (image.complete) resolve()
  })
  preloaded.set(src, done)
  return done
}

function isPreloaded(src: string): boolean {
  return preloaded.has(src)
}

const VIEW_STORAGE_KEY = 'maeth.boardView'
const LEGACY_STYLE_STORAGE_KEY = 'maeth.boardStyle'
const STYLE_2D_STORAGE_KEY = 'maeth.boardStyle2d'
const STYLE_3D_STORAGE_KEY = 'maeth.boardStyle3d'
const THREE_PIECE_STYLE_STORAGE_KEY = 'maeth.threePieceStyle'
const COORDS_STORAGE_KEY = 'maeth.boardCoords'

interface BoardViewContextValue {
  viewMode: BoardViewMode
  setViewMode: (mode: BoardViewMode) => void
  boardStyle: BoardStyle
  setBoardStyle: (style: BoardStyle) => void
  threePieceStyle: ThreePieceStyle
  setThreePieceStyle: (style: ThreePieceStyle) => void
  /** Whether the A–D / 1–4 ring is drawn around the board. */
  coords: boolean
  toggleCoords: () => void
}

const BoardViewContext = createContext<BoardViewContextValue | null>(null)

const storedView = (): BoardViewMode => {
  const value = localStorage.getItem(VIEW_STORAGE_KEY)
  return isBoardViewMode(value) ? value : DEFAULT_BOARD_VIEW
}

const storedStyle = (storageKey: string): BoardStyle => {
  const value = localStorage.getItem(storageKey) ?? localStorage.getItem(LEGACY_STYLE_STORAGE_KEY)
  return isBoardStyle(value) ? value : DEFAULT_BOARD_STYLE
}

const storedThreePieceStyle = (): ThreePieceStyle => {
  const value = localStorage.getItem(THREE_PIECE_STYLE_STORAGE_KEY)
  return isThreePieceStyle(value) ? value : DEFAULT_THREE_PIECE_STYLE
}

/** On unless it has been turned off: the squares are what the pieces talk in. */
const storedCoords = (): boolean => localStorage.getItem(COORDS_STORAGE_KEY) !== 'off'

export function BoardViewProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<BoardViewMode>(storedView)
  const [boardStyle2d, setBoardStyle2d] = useState<BoardStyle>(() =>
    storedStyle(STYLE_2D_STORAGE_KEY),
  )
  const [boardStyle3d, setBoardStyle3d] = useState<BoardStyle>(() =>
    storedStyle(STYLE_3D_STORAGE_KEY),
  )
  const [threePieceStyle, setThreePieceStyle] =
    useState<ThreePieceStyle>(storedThreePieceStyle)
  const [coords, setCoords] = useState<boolean>(storedCoords)
  const [boardLoading, setBoardLoading] = useState(false)
  const loadIdRef = useRef(0)
  const boardStyle = viewMode === '2d' ? boardStyle2d : boardStyle3d

  const setBoardStyle = useCallback(
    (style: BoardStyle) => {
      if (style === boardStyle) return
      const apply = () => {
        if (viewMode === '2d') setBoardStyle2d(style)
        else setBoardStyle3d(style)
      }
      // Hold the board we are looking at until the next one can replace it in
      // one step. Swapping first would show a bare board while it downloads.
      const config = BOARD_STYLE_CONFIG[style]
      const needed = viewMode === '3d' ? [config.top, config.bottom] : [config.top]
      if (needed.every(isPreloaded)) {
        apply()
        return
      }
      const loadId = ++loadIdRef.current
      setBoardLoading(true)
      void Promise.all(needed.map(preloadImage)).finally(() => {
        if (loadIdRef.current !== loadId) return
        apply()
        setBoardLoading(false)
      })
    },
    [boardStyle, viewMode],
  )

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, viewMode)
    document.documentElement.setAttribute('data-board-view', viewMode)
  }, [viewMode])

  useEffect(() => {
    localStorage.setItem(STYLE_2D_STORAGE_KEY, boardStyle2d)
  }, [boardStyle2d])

  useEffect(() => {
    localStorage.setItem(STYLE_3D_STORAGE_KEY, boardStyle3d)
  }, [boardStyle3d])

  useEffect(() => {
    const config = BOARD_STYLE_CONFIG[boardStyle]
    document.documentElement.setAttribute('data-board-style', boardStyle)
    document.documentElement.style.setProperty('--board-top-url', `url('${config.top}')`)
    // Fetch the artwork now, from the lobby, so the 3D board is textured the
    // moment it mounts. The 2D board shows the top image as its background too;
    // only the underside is exclusive to 3D.
    preloadImage(config.top)
    if (viewMode === '3d') preloadImage(config.bottom)
  }, [boardStyle, viewMode])

  useEffect(() => {
    localStorage.setItem(THREE_PIECE_STYLE_STORAGE_KEY, threePieceStyle)
    document.documentElement.setAttribute('data-three-piece-style', threePieceStyle)
  }, [threePieceStyle])

  const toggleCoords = useCallback(() => {
    setCoords((was) => {
      localStorage.setItem(COORDS_STORAGE_KEY, was ? 'off' : 'on')
      return !was
    })
  }, [])

  const value = useMemo(
    () => ({
      viewMode,
      setViewMode,
      boardStyle,
      setBoardStyle,
      threePieceStyle,
      setThreePieceStyle,
      coords,
      toggleCoords,
    }),
    [boardStyle, coords, setBoardStyle, threePieceStyle, toggleCoords, viewMode],
  )

  return (
    <BoardViewContext.Provider value={value}>
      {children}
      {/* Same overlay the 2D skins use, for the same reason: the board on screen
          stays until its replacement is ready to appear in one step. */}
      {boardLoading &&
        createPortal(
          <div className="skin-loading" role="status" aria-live="polite" aria-busy="true">
            <div className="skin-loading__card">
              <div className="skin-loading__spinner" aria-hidden />
              <span>{t('lobby.styleLoading')}</span>
            </div>
          </div>,
          document.body,
        )}
    </BoardViewContext.Provider>
  )
}

export function useBoardView(): BoardViewContextValue {
  const context = useContext(BoardViewContext)
  if (!context) throw new Error('useBoardView must be used within BoardViewProvider')
  return context
}
