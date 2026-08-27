// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n'
import { BoardViewProvider } from '@/boardView'
import { emptyBoard, piece } from '@/game/__tests__/kit'
import type { Board as BoardModel } from '@/game/types'
import { Board } from '@/components/Board'
import type { PieceChat } from '../usePieceChat'
import { pickSpeakers } from '../whoSpeaks'
import { parseLines } from '../banter'

const silentChat: PieceChat = {
  available: true,
  cell: null,
  kind: null,
  color: null,
  speech: null,
  thinking: false,
  hostile: false,
  open: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
}

function renderBoard(board: BoardModel, overrides: Partial<Parameters<typeof Board>[0]> = {}) {
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
          chat={silentChat}
          onCellClick={vi.fn()}
          interactive
          {...overrides}
        />
      </BoardViewProvider>
    </I18nProvider>,
  )
}

describe('ambient lines on the board', () => {
  beforeEach(() => localStorage.setItem('maeth.lang', 'en'))
  afterEach(cleanup)

  it('hangs a bubble over the piece that spoke', () => {
    const board = emptyBoard()
    board[5] = piece('orcChief', 'black')
    renderBoard(board, { ambient: { cell: 5, text: 'Rat in a helmet!', hostile: true } })
    expect(screen.getByText('Rat in a helmet!')).toBeTruthy()
  })

  it('says nothing when the player has a conversation open', () => {
    const board = emptyBoard()
    board[5] = piece('orcChief', 'black')
    board[9] = piece('hobbit', 'white')
    renderBoard(board, {
      chat: {
        ...silentChat,
        cell: 9,
        kind: 'hobbit',
        color: 'white',
        speech: { cell: 9, text: 'Second breakfast?', hostile: false },
      },
      ambient: { cell: 5, text: 'Rat in a helmet!', hostile: true },
    })
    expect(screen.getByText('Second breakfast?')).toBeTruthy()
    expect(screen.queryByText('Rat in a helmet!')).toBeNull()
  })
})

describe('pickSpeakers', () => {
  it('needs two pieces before anyone can talk', () => {
    const board = emptyBoard()
    board[0] = piece('hobbit', 'white')
    expect(pickSpeakers(board)).toBeNull()
  })

  it('picks three or four distinct pieces that are really on the board', () => {
    const board = emptyBoard()
    board[0] = piece('hobbit', 'white')
    board[1] = piece('dwarf', 'white')
    board[8] = piece('orcChief', 'black')
    board[9] = piece('balrog', 'black')

    for (let i = 0; i < 40; i++) {
      const picked = pickSpeakers(board)!
      expect(picked.speakers.length).toBeGreaterThanOrEqual(2)
      expect(picked.speakers.length).toBeLessThanOrEqual(4)
      expect(new Set(picked.speakers).size).toBe(picked.speakers.length)
      for (const cell of picked.speakers) expect(board[cell]).toBeTruthy()
      if (picked.flavour === 'squabble') {
        expect(board[picked.speakers[0]!]!.color).not.toBe(board[picked.speakers[1]!]!.color)
      } else if (picked.flavour === 'gossip') {
        const colors = new Set(picked.speakers.map((cell: number) => board[cell]!.color))
        expect(colors.size).toBe(1)
      }
      // A grumble is nobody's business in particular: any two will do.
    }
  })

  it('falls back to a quarrel when neither side can gossip alone', () => {
    // 0.5 is past the grumble draw and past the squabble roll, so what is left
    // is the quarrel — and with one piece each it is the only thing possible.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const board = emptyBoard()
    board[0] = piece('hobbit', 'white')
    board[8] = piece('orcChief', 'black')
    expect(pickSpeakers(board)!.flavour).toBe('squabble')
    vi.restoreAllMocks()
  })

  it('lets the short-reach pieces do most of the grumbling', () => {
    // The hobbit steps one square, the queen three: over many draws the
    // complaining should fall to the hobbit far more often.
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // inside the grumble draw
    const board = emptyBoard()
    board[0] = piece('hobbit', 'white')
    board[8] = piece('elvenQueen', 'black')
    const picked = pickSpeakers(board)!
    expect(picked.flavour).toBe('grumble')
    expect(board[picked.speakers[0]!]!.kind).toBe('hobbit')
    vi.restoreAllMocks()
  })
})

describe('parseLines', () => {
  it('digs the array out of whatever the model wrapped it in', () => {
    expect(parseLines('Sure!\n["one", "two", "three"]\n', 3)).toEqual(['one', 'two', 'three'])
  })

  it('drops blanks and never returns more lines than there are speakers', () => {
    expect(parseLines('["one", "", "two", "three"]', 2)).toEqual(['one', 'two'])
  })

  it('gives up on anything that is not an array', () => {
    expect(parseLines('no json here', 3)).toBeNull()
    expect(parseLines('[unclosed', 3)).toBeNull()
  })
})
