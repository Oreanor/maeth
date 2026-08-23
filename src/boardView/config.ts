export type BoardViewMode = '2d' | '3d'
export type ThreePieceStyle = 'painted' | 'classic'

export const BOARD_STYLES = [
  'board-1',
  'board-2',
  'board-3',
  'board-4',
  'board-5',
  'board-6',
  'board-7',
  'board-8',
  'board-9',
  'board-10',
] as const

export type BoardStyle = (typeof BOARD_STYLES)[number]

export interface BoardStyleConfig {
  id: BoardStyle
  number: number
  top: string
  bottom: string
  side: string
  metalness: number
  roughness: number
}

const SIDE_MATERIALS: Array<Pick<BoardStyleConfig, 'side' | 'metalness' | 'roughness'>> = [
  { side: '#24160f', metalness: 0.04, roughness: 0.78 },
  { side: '#4b2f1d', metalness: 0.08, roughness: 0.7 },
  { side: '#30241e', metalness: 0.08, roughness: 0.76 },
  { side: '#43413e', metalness: 0.16, roughness: 0.62 },
  { side: '#8b8985', metalness: 0.03, roughness: 0.66 },
  { side: '#171513', metalness: 0.12, roughness: 0.7 },
  { side: '#745f43', metalness: 0.04, roughness: 0.76 },
  { side: '#303236', metalness: 0.34, roughness: 0.5 },
  { side: '#38452f', metalness: 0.08, roughness: 0.76 },
  { side: '#4b3a27', metalness: 0.42, roughness: 0.48 },
]

export const BOARD_STYLE_CONFIG = Object.fromEntries(
  BOARD_STYLES.map((id, index) => [
    id,
    {
      id,
      number: index + 1,
      top: `/boards/board-${index + 1}-top.webp`,
      bottom: `/boards/board-${index + 1}-bottom.webp`,
      ...SIDE_MATERIALS[index],
    },
  ]),
) as Record<BoardStyle, BoardStyleConfig>

/** HUD portraits follow the 3D pieces, not the 2D skin: the painted set matches
 * the D&D sheet, the classic set the chess one. */
export const THREE_PIECE_SPRITE_URL: Record<ThreePieceStyle, string> = {
  painted: '/pieces-3d.webp',
  classic: '/pieces-chess.webp',
}

export const DEFAULT_BOARD_VIEW: BoardViewMode = '2d'
export const DEFAULT_BOARD_STYLE: BoardStyle = 'board-1'
export const DEFAULT_THREE_PIECE_STYLE: ThreePieceStyle = 'painted'

export function isBoardViewMode(value: string | null): value is BoardViewMode {
  return value === '2d' || value === '3d'
}

export function isBoardStyle(value: string | null): value is BoardStyle {
  return BOARD_STYLES.includes(value as BoardStyle)
}

export function isThreePieceStyle(value: string | null): value is ThreePieceStyle {
  return value === 'painted' || value === 'classic'
}
