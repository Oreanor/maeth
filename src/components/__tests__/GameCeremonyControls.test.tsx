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

  render(
    <I18nProvider>
      <BoardViewProvider>
        <GameCeremonyControls {...props} />
      </BoardViewProvider>
    </I18nProvider>,
  )
  return props
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

  it('uses the corner die to stop the first-turn lottery', () => {
    const onRollLottery = vi.fn()
    renderControls({
      lottery: { step: 'await_roll' },
      canRollLottery: true,
      onRollLottery,
    })

    const die = screen.getByRole('button', { name: 'Dice' })
    expect(die.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(die)
    expect(onRollLottery).toHaveBeenCalledOnce()
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

  it('lets the attacking human stop the only duel roll', () => {
    const onDismissDuel = vi.fn()
    renderControls({
      duel: { by: 'white', attacker: 5, success: true },
      onDismissDuel,
    })

    const die = screen.getByRole('button', { name: 'Dice' })
    expect(die.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(die)
    expect(die.getAttribute('aria-disabled')).toBe('true')

    act(() => vi.advanceTimersByTime(700))
    expect(onDismissDuel).toHaveBeenCalledOnce()
  })

  it('simulates the opposing attacker without offering a defence roll', () => {
    const onDismissDuel = vi.fn()
    renderControls({
      duel: { by: 'black', attacker: 4, success: false },
      onDismissDuel,
    })

    const die = screen.getByRole('button', { name: 'Dice' })
    expect(die.getAttribute('aria-disabled')).toBe('true')
    act(() => vi.advanceTimersByTime(1100))
    expect(die.getAttribute('aria-disabled')).toBe('true')
    act(() => vi.advanceTimersByTime(700))
    expect(onDismissDuel).toHaveBeenCalledOnce()
  })
})
