// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n'
import { emptyBoard, piece, playState } from '@/game/__tests__/kit'
import { extractOrder } from '../llm'
import { usePieceChat } from '../usePieceChat'

const askPiece = vi.fn<() => Promise<import('../llm').PieceReply | null>>()

vi.mock('../llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../llm')>()),
  askPiece: () => askPiece(),
  pieceChatAvailable: async () => true,
}))

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>

describe('extractOrder', () => {
  it('takes the square out of the tag and the tag out of the line', () => {
    expect(extractOrder('As you command. [MOVE: C3]')).toEqual({
      text: 'As you command.',
      square: 'C3',
      tell: null,
    })
  })

  it('reads a sloppier tag too', () => {
    expect(extractOrder('Hrum. [move b2]').square).toBe('B2')
  })

  it('reads the tag that names who a message is for', () => {
    const reply = extractOrder('Dwarf, the commander calls you a coward. [TELL: B4]')
    expect(reply.tell).toBe('B4')
    expect(reply.square).toBeNull()
    expect(reply.text).toBe('Dwarf, the commander calls you a coward.')
  })

  it('leaves an ordinary line alone', () => {
    expect(extractOrder('I have already had my move.')).toEqual({
      text: 'I have already had my move.',
      square: null,
      tell: null,
    })
  })
})

describe('orders given to a piece', () => {
  // The queen on A4 can slide onto the orc chief on B3; D1 lies behind it on the
  // same diagonal, so the path is blocked and that order is not playable.
  const board = () => {
    const b = emptyBoard()
    b[0] = piece('elvenQueen', 'white')
    b[5] = piece('orcChief', 'black')
    return b
  }

  const open = async (cell: number, onOrder: (from: number, to: number) => void) => {
    const state = playState(board())
    const hook = renderHook(
      () =>
        usePieceChat({
          state,
          human: 'white',
          youName: 'Alice',
          opponentName: 'Bot',
          gameLog: [],
          onOrder,
        }),
      { wrapper },
    )
    // The board asks the server whether the pieces can speak at all before it
    // offers to open one; nothing happens until that has come back.
    await act(async () => {})
    await act(async () => {
      hook.result.current.open(cell)
      await Promise.resolve()
      await Promise.resolve()
    })
    return hook
  }

  beforeEach(() => {
    localStorage.setItem('maeth.lang', 'en')
    askPiece.mockReset()
  })
  afterEach(cleanup)

  it('plays the move the piece agreed to', async () => {
    const onOrder = vi.fn()
    askPiece.mockResolvedValue({ text: 'As you command.', square: 'B3', tell: null })
    const hook = await open(0, onOrder)

    expect(onOrder).toHaveBeenCalledWith(0, 5)
    // The words stand on their own; the tag never reaches the bubble.
    expect(hook.result.current.speech?.text).toBe('As you command.')
  })

  it('ignores a square the piece cannot actually reach', async () => {
    const onOrder = vi.fn()
    askPiece.mockResolvedValue({ text: 'At once!', square: 'D1', tell: null })
    await open(0, onOrder)
    expect(onOrder).not.toHaveBeenCalled()
  })

  it('takes no orders on behalf of the enemy', async () => {
    const onOrder = vi.fn()
    askPiece.mockResolvedValue({ text: 'Make me, maggot.', square: 'A4', tell: null })
    await open(5, onOrder)
    expect(onOrder).not.toHaveBeenCalled()
  })
})

describe('passing a word to somebody else', () => {
  const board = () => {
    const b = emptyBoard()
    b[0] = piece('elvenQueen', 'white') // A4 — the one being talked to
    b[5] = piece('orcChief', 'black') // B3 — the one the message is for
    return b
  }

  beforeEach(() => {
    localStorage.setItem('maeth.lang', 'en')
    askPiece.mockReset()
  })
  afterEach(cleanup)

  it('lets the addressee answer over its own head', async () => {
    askPiece
      .mockResolvedValueOnce({ text: 'Orc, my lady calls you a worm.', square: null, tell: 'B3' })
      .mockResolvedValueOnce({ text: 'Come and say it closer.', square: null, tell: null })

    const state = playState(board())
    const hook = renderHook(
      () =>
        usePieceChat({
          state,
          human: 'white',
          youName: 'Alice',
          opponentName: 'Bot',
          gameLog: [],
          onOrder: vi.fn(),
        }),
      { wrapper },
    )
    await act(async () => {})
    await act(async () => {
      hook.result.current.open(0)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Two requests: the queen's line, then the orc answering it.
    expect(askPiece).toHaveBeenCalledTimes(2)
    expect(hook.result.current.speech?.text).toBe('Come and say it closer.')
    expect(hook.result.current.speech?.cell).toBe(5)
    // The orc is the enemy, so its bubble is the enemy's colour even though the
    // conversation is with one of the player's own.
    expect(hook.result.current.speech?.hostile).toBe(true)
    expect(hook.result.current.cell).toBe(0)
  })
})
