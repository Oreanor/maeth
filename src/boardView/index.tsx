import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
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
  THREE_PIECE_SPRITE_URL,
  type BoardStyle,
  type BoardStyleConfig,
  type BoardViewMode,
  type ThreePieceStyle,
} from './config'

const VIEW_STORAGE_KEY = 'maeth.boardView'
const LEGACY_STYLE_STORAGE_KEY = 'maeth.boardStyle'
const STYLE_2D_STORAGE_KEY = 'maeth.boardStyle2d'
const STYLE_3D_STORAGE_KEY = 'maeth.boardStyle3d'
const THREE_PIECE_STYLE_STORAGE_KEY = 'maeth.threePieceStyle'

interface BoardViewContextValue {
  viewMode: BoardViewMode
  setViewMode: (mode: BoardViewMode) => void
  boardStyle: BoardStyle
  setBoardStyle: (style: BoardStyle) => void
  threePieceStyle: ThreePieceStyle
  setThreePieceStyle: (style: ThreePieceStyle) => void
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

export function BoardViewProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<BoardViewMode>(storedView)
  const [boardStyle2d, setBoardStyle2d] = useState<BoardStyle>(() =>
    storedStyle(STYLE_2D_STORAGE_KEY),
  )
  const [boardStyle3d, setBoardStyle3d] = useState<BoardStyle>(() =>
    storedStyle(STYLE_3D_STORAGE_KEY),
  )
  const [threePieceStyle, setThreePieceStyle] =
    useState<ThreePieceStyle>(storedThreePieceStyle)
  const boardStyle = viewMode === '2d' ? boardStyle2d : boardStyle3d
  const setBoardStyle = useCallback(
    (style: BoardStyle) => {
      if (viewMode === '2d') setBoardStyle2d(style)
      else setBoardStyle3d(style)
    },
    [viewMode],
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
  }, [boardStyle])

  useEffect(() => {
    localStorage.setItem(THREE_PIECE_STYLE_STORAGE_KEY, threePieceStyle)
    document.documentElement.setAttribute('data-three-piece-style', threePieceStyle)
  }, [threePieceStyle])

  const value = useMemo(
    () => ({
      viewMode,
      setViewMode,
      boardStyle,
      setBoardStyle,
      threePieceStyle,
      setThreePieceStyle,
    }),
    [boardStyle, setBoardStyle, threePieceStyle, viewMode],
  )

  return <BoardViewContext.Provider value={value}>{children}</BoardViewContext.Provider>
}

export function useBoardView(): BoardViewContextValue {
  const context = useContext(BoardViewContext)
  if (!context) throw new Error('useBoardView must be used within BoardViewProvider')
  return context
}
