import { describe, expect, it } from 'vitest'
import {
  BOARD_STYLES,
  BOARD_STYLE_CONFIG,
  DEFAULT_THREE_PIECE_STYLE,
  isThreePieceStyle,
} from './config'

describe('board view configuration', () => {
  it('exposes every copied board material', () => {
    expect(BOARD_STYLES).toHaveLength(10)
    expect(BOARD_STYLE_CONFIG['board-1'].top).toBe('/boards/board-1-top.webp')
    expect(BOARD_STYLE_CONFIG['board-10'].bottom).toBe('/boards/board-10-bottom.webp')
  })

  it('accepts only supported 3D piece materials', () => {
    expect(DEFAULT_THREE_PIECE_STYLE).toBe('painted')
    expect(isThreePieceStyle('painted')).toBe(true)
    expect(isThreePieceStyle('classic')).toBe(true)
    expect(isThreePieceStyle('textured')).toBe(false)
    expect(isThreePieceStyle(null)).toBe(false)
  })
})
