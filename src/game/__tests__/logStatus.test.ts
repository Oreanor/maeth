import { describe, expect, it } from 'vitest'
import { gameLogStatusColor, gameLogStatusLine } from '../logStatus'

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${vars.piece}` : key)

describe('gameLogStatusLine', () => {
  it('prioritises the waiting-for-opponent state', () => {
    expect(gameLogStatusLine('draft', true, true, null, t)).toBe('game.waitingPlayer')
  })

  it('has no line once the game is over', () => {
    expect(gameLogStatusLine('over', false, true, null, t)).toBeNull()
  })

  it('covers the draft phase for both sides', () => {
    expect(gameLogStatusLine('draft', false, false, null, t)).toBe('game.opponentPlacing')
    expect(gameLogStatusLine('draft', false, true, 'Ent · 3+', t)).toBe('game.placePiece:Ent · 3+')
    expect(gameLogStatusLine('draft', false, true, null, t)).toBeNull()
  })

  it('covers the turn lottery phase', () => {
    expect(gameLogStatusLine('lottery', false, false, null, t, { step: 'await_roll' })).toBe(
      'lottery.statusAwaitRoll',
    )
    expect(
      gameLogStatusLine('lottery', false, false, null, t, {
        step: 'revealed',
        roll: 3,
        firstTurn: 'white',
      }),
    ).toBe('lottery.statusRevealed')
  })

  it('covers the move phase for both sides', () => {
    expect(gameLogStatusLine('play', false, true, null, t)).toBe('game.yourTurn')
    expect(gameLogStatusLine('play', false, false, null, t)).toBe('game.opponentTurn')
  })
})

describe('gameLogStatusColor', () => {
  it('is null when the game is over', () => {
    expect(gameLogStatusColor('over', false, 'white')).toBeNull()
  })

  it('is neutral while waiting, else the side to move', () => {
    expect(gameLogStatusColor('play', true, 'white')).toBe('neutral')
    expect(gameLogStatusColor('play', false, 'white')).toBe('white')
    expect(gameLogStatusColor('draft', false, 'black')).toBe('black')
    expect(gameLogStatusColor('lottery', false, 'white')).toBe('neutral')
  })
})
