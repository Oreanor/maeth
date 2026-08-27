// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n'
import { BoardViewProvider } from '@/boardView'
import type { Board as BoardModel } from '@/game/types'
import { Board } from '../Board'

function renderBoard(overrides: Partial<Parameters<typeof Board>[0]> = {}) {
  const board: BoardModel = Array.from({ length: 16 }, () => null)
  board[0] = { kind: 'nazgul', color: 'black', moved: true }
  const onCellClick = vi.fn()

  render(
    <I18nProvider>
      <BoardViewProvider>
        <Board
          board={board}
          selected={null}
          legalTargets={[]}
          selectedMoves={[]}
          placementTargets={[]}
          movable={[]}
          previewCell={null}
          previewKind={null}
          previewOwner="white"
          orientation="white"
          anim={null}
          onCellClick={onCellClick}
          interactive
          {...overrides}
        />
      </BoardViewProvider>
    </I18nProvider>,
  )

  return { onCellClick }
}

describe('Board accessibility and interaction', () => {
  beforeEach(() => localStorage.setItem('maeth.lang', 'en'))
  afterEach(cleanup)

  it('announces a cell piece and its state', () => {
    renderBoard({ selected: 0, legalTargets: [0] })

    const cell = screen.getByRole('button', {
      name: /r1c1: black Nazgul.*selected.*legal destination.*already moved/i,
    })
    expect(cell.getAttribute('aria-pressed')).toBe('true')
  })

  it('blocks keyboard-originated clicks while the board is locked', () => {
    const { onCellClick } = renderBoard({ interactive: false })
    const cell = screen.getAllByRole('button')[0]

    fireEvent.click(cell)

    expect(onCellClick).not.toHaveBeenCalled()
    expect(cell.getAttribute('aria-disabled')).toBe('true')
  })

  it('puts the black-side corner first when oriented for black', () => {
    renderBoard({ orientation: 'black' })

    expect(screen.getAllByRole('button')[0].getAttribute('aria-label')).toMatch(/^r4c4:/)
  })
})
