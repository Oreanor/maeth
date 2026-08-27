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

  it('accepts only the two carved sets', () => {
    expect(DEFAULT_THREE_PIECE_STYLE).toBe('dnd')
    expect(isThreePieceStyle('dnd')).toBe(true)
    expect(isThreePieceStyle('lewis')).toBe(true)
    expect(isThreePieceStyle('textured')).toBe(false)
    expect(isThreePieceStyle(null)).toBe(false)
  })

  // A player who had picked one of the retired materials keeps it in local
  // storage; the guard has to send them back to a set that still exists rather
  // than leave the board asking for /models/bone/.
  it('rejects the retired material names', () => {
    for (const retired of ['painted', 'classic', 'wood', 'stone', 'bone', 'metal']) {
      expect(isThreePieceStyle(retired)).toBe(false)
    }
  })
})
