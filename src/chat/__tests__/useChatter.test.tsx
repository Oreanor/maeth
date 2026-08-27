// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n'
import { emptyBoard, piece, playState } from '@/game/__tests__/kit'
import { applyMove } from '@/game/engine'
import { useChatter } from '../useChatter'

// The board's own chatter is all timing and plumbing; the model behind it is
// stubbed so the test can watch the lines come out in order.
const complete = vi.fn<(system: string, user: string, max?: number) => Promise<string | null>>()

// Only the network call is stubbed: the text tidying around it is the real
// thing, so the test sees exactly what a player would.
vi.mock('../llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../llm')>()),
  complete: (system: string, user: string, max?: number) => complete(system, user, max),
  pieceChatAvailable: async () => true,
}))

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>

function twoArmies() {
  const board = emptyBoard()
  board[0] = piece('elvenQueen', 'white')
  board[5] = piece('orcChief', 'black')
  board[15] = piece('hobbit', 'white')
  return board
}

describe('useChatter', () => {
  beforeEach(() => {
    localStorage.setItem('maeth.lang', 'en')
    complete.mockReset()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    cleanup()
  })

  const flush = async (ms: number) => {
    await act(async () => {
      vi.advanceTimersByTime(ms)
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('starts a squabble after a spell of quiet and plays it out line by line', async () => {
    // Fixed so the pick is a three-hand quarrel rather than a two-hand mutter.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    complete.mockResolvedValue('["Pointy-eared filth.", "Charming.", "Enough, both of you."]')
    const state = playState(twoArmies())
    const { result } = renderHook(
      () => useChatter({ state, human: 'white', youName: 'Alice', busy: false, enabled: true }),
      { wrapper },
    )

    expect(result.current).toBeNull()
    await flush(16_000)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(result.current?.text).toBe('Pointy-eared filth.')

    // Each line hangs its couple of seconds and gives way to the next.
    await flush(2_300)
    expect(result.current?.text).toBe('Charming.')
    await flush(2_300)
    expect(result.current?.text).toBe('Enough, both of you.')
    await flush(2_300)
    expect(result.current).toBeNull()
  })

  it('keeps quiet while the player is talking to a piece', async () => {
    complete.mockResolvedValue('["Pointy-eared filth.", "Charming."]')
    const state = playState(twoArmies())
    const { result } = renderHook(
      () => useChatter({ state, human: 'white', youName: 'Alice', busy: true, enabled: true }),
      { wrapper },
    )

    await flush(61_000)
    expect(complete).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it('says nothing at all without a model or before the draft is done', async () => {
    complete.mockResolvedValue('["…"]')
    const state = playState(twoArmies())
    renderHook(
      () => useChatter({ state, human: 'white', youName: 'Alice', busy: false, enabled: false }),
      { wrapper },
    )

    await flush(61_000)
    expect(complete).not.toHaveBeenCalled()
  })

  it('shouts about a move that just landed', async () => {
    complete.mockResolvedValue('["For the Shire!", "Well struck!"]')
    const board = twoArmies()
    const before = playState(board)
    const props = { state: before, human: 'white' as const, youName: 'Alice', busy: false, enabled: true }
    const { result, rerender } = renderHook((p: typeof props) => useChatter(p), {
      wrapper,
      initialProps: props,
    })

    // The queen takes the orc chief; somebody is bound to have a word about it.
    const after = applyMove(before, { from: 0, to: 5, capture: true })
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // under the reaction chance
    rerender({ ...props, state: after })
    await flush(50)

    expect(complete).toHaveBeenCalledTimes(1)
    const [, user] = complete.mock.calls[0]!
    expect(user).toContain('WHAT JUST HAPPENED')
    expect(result.current?.text).toBe('For the Shire!')
  })

  it('keeps a reaction on screen when the next move has nothing to say', async () => {
    // Against the bot the answer comes a second after your move, and the bot
    // replies at once: a silent move must not wipe what is being said.
    complete.mockResolvedValue('["For the Shire!"]')
    const board = twoArmies()
    const before = playState(board)
    const props = { state: before, human: 'white' as const, youName: 'Alice', busy: false, enabled: true }
    const { result, rerender } = renderHook((p: typeof props) => useChatter(p), {
      wrapper,
      initialProps: props,
    })

    vi.spyOn(Math, 'random').mockReturnValue(0.1) // the move speaks
    const after = applyMove(before, { from: 0, to: 5, capture: true })
    rerender({ ...props, state: after })
    await flush(50)
    expect(result.current?.text).toBe('For the Shire!')

    vi.spyOn(Math, 'random').mockReturnValue(0.99) // the reply says nothing
    rerender({ ...props, state: applyMove(after, { from: 15, to: 11, capture: false }) })
    await flush(50)
    expect(result.current?.text).toBe('For the Shire!')
  })

  it('lets most moves pass in silence', async () => {
    complete.mockResolvedValue('["For the Shire!"]')
    const board = twoArmies()
    const before = playState(board)
    const props = { state: before, human: 'white' as const, youName: 'Alice', busy: false, enabled: true }
    const { rerender } = renderHook((p: typeof props) => useChatter(p), {
      wrapper,
      initialProps: props,
    })

    vi.spyOn(Math, 'random').mockReturnValue(0.99) // over the reaction chance
    rerender({ ...props, state: applyMove(before, { from: 0, to: 5, capture: true }) })
    await flush(50)

    expect(complete).not.toHaveBeenCalled()
  })
})
