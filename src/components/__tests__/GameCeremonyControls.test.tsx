// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardViewProvider } from '@/boardView'
import type { DraftPick } from '@/game/useGame'
import { I18nProvider } from '@/i18n'
import { GameCeremonyControls } from '../GameCeremonyControls'

function renderControls(
  overrides: Partial<Parameters<typeof GameCeremonyControls>[0]> = {},
) {
  const props: Parameters<typeof GameCeremonyControls>[0] = {
    human: 'white',
    lottery: null,
    canRollLottery: false,
    canStartLottery: false,
    lotteryBusy: false,
    onRollLottery: vi.fn(),
    onStartLottery: vi.fn(),
    draftPick: null,
    onConfirmDraftPick: vi.fn(),
    duel: null,
    duelPending: false,
    onDismissDuel: vi.fn(),
    ...overrides,
  }

  const { container } = render(
    <I18nProvider>
      <BoardViewProvider>
        <GameCeremonyControls {...props} />
      </BoardViewProvider>
    </I18nProvider>,
  )
  return { ...props, container }
}

describe('GameCeremonyControls', () => {
  beforeEach(() => {
    localStorage.setItem('maeth.boardView', '2d')
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('throws the coin by itself — nobody has to stop it', () => {
    vi.useFakeTimers()
    const onRollLottery = vi.fn()
    renderControls({
      lottery: { step: 'await_roll' },
      canRollLottery: true,
      onRollLottery,
    })

    // No die to press: the coin is simply in the air.
    expect(screen.queryByRole('button', { name: 'Dice' })).toBeNull()
    expect(onRollLottery).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(onRollLottery).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('leaves the answer up long enough to read before the draft begins', () => {
    vi.useFakeTimers()
    const onStartLottery = vi.fn()
    renderControls({
      lottery: { step: 'revealed', roll: 3, firstTurn: 'white' },
      canStartLottery: true,
      onStartLottery,
    })

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(onStartLottery).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1_500)
    })
    expect(onStartLottery).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('uses the portrait button to settle a human draft pick', () => {
    const onConfirmDraftPick = vi.fn()
    const draftPick: DraftPick = {
      by: 'white',
      pool: ['ent', 'hobbit'],
      settled: null,
    }
    renderControls({ draftPick, onConfirmDraftPick })

    const piece = screen.getByRole('button', { name: 'Piece' })
    expect(piece.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(piece)
    expect(onConfirmDraftPick).toHaveBeenCalledOnce()
  })

  it('spins the coin over a contested strike and dismisses it on its own', () => {
    const onDismissDuel = vi.fn()
    renderControls({
      duel: { by: 'white', attacker: 5, success: true },
      onDismissDuel,
    })

    // No button to press: the coin turns, lands, and the answer stays up.
    expect(screen.queryByRole('button', { name: 'Dice' })).toBeNull()

    act(() => {
      vi.advanceTimersByTime(2_200)
    })
    expect(onDismissDuel).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(2_400)
    })
    expect(onDismissDuel).toHaveBeenCalledOnce()
  })

  it("wears the winner's colour: the attacker on a hit, the defender on a miss", () => {
    const { container } = renderControls({
      duel: { by: 'black', attacker: 4, success: false },
    })

    act(() => {
      vi.advanceTimersByTime(2_200)
    })
    // Black struck and missed, so the frame belongs to white.
    expect(container.querySelector('.ceremony-control--won-white')).not.toBeNull()
    expect(container.querySelector('.ceremony-control--won-black')).toBeNull()
  })
})
