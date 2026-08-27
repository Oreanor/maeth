import { describe, expect, it } from 'vitest'
import { moveArrows } from '../ArrowOverlay'
import { CAPTURE_COLOR, DUEL_COLOR, MOVE_COLOR } from '@/palette'
import { emptyBoard, piece } from '@/game/__tests__/kit'
import type { Move } from '@/game/types'

/**
 * The colour of a capture arrow is a warning, so it has to say the same thing
 * the coin will: red for a capture that cannot be answered, orange for one the
 * piece being taken can answer.
 */
describe('moveArrows capture colours', () => {
  const contested = () => {
    const board = emptyBoard()
    board[5] = piece('rohanWarrior', 'white')
    // A balrog's reach runs up through 9 to 5, so taking it is contested.
    board[13] = piece('balrog', 'black')
    return board
  }

  const takeIt: Move = { from: 5, to: 13, capture: true }

  it('warns in orange when the victim can strike back', () => {
    const [arrow] = moveArrows(5, [takeIt], 'rohanWarrior', contested())
    expect(arrow.color).toBe(DUEL_COLOR)
  })

  it('stays red when the victim cannot reach the attacker', () => {
    const board = emptyBoard()
    board[5] = piece('rohanWarrior', 'white')
    // A farmer reaches one square diagonally, which is not where 5 is.
    board[7] = piece('farmer', 'black')
    const [arrow] = moveArrows(5, [{ from: 5, to: 7, capture: true }], 'rohanWarrior', board)
    expect(arrow.color).toBe(CAPTURE_COLOR)
  })

  it('stays red in a game played without duels, where nothing can be answered', () => {
    const [arrow] = moveArrows(5, [takeIt], 'rohanWarrior', contested(), false)
    expect(arrow.color).toBe(CAPTURE_COLOR)
  })

  it('leaves a move to an empty square green', () => {
    const board = emptyBoard()
    board[5] = piece('rohanWarrior', 'white')
    const [arrow] = moveArrows(5, [{ from: 5, to: 6, capture: false }], 'rohanWarrior', board)
    expect(arrow.color).toBe(MOVE_COLOR)
  })

  it('colours an archer’s shot by the same question', () => {
    const board = emptyBoard()
    board[5] = piece('orcArcher', 'white')
    board[13] = piece('balrog', 'black')
    const [arrow] = moveArrows(5, [{ from: 5, to: 13, capture: true }], 'orcArcher', board)
    expect(arrow.color).toBe(DUEL_COLOR)
    expect(arrow.dashed).toBe(true)
  })
})
