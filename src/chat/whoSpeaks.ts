import { PIECES } from '@/game/pieces'
import { CELLS, colOf, rowOf, type Board, type Color, type Move } from '@/game/types'
import type { BanterFlavour, MoveNews, ReactionFlavour } from './banter'

/**
 * Who opens their mouth, and in what key.
 *
 * All of it is a draw of some sort — which is why it lives away from the hook
 * that runs the clock and the requests: these are ordinary functions over a
 * board, and they can be run a hundred times in a test to see whether the
 * spread is right.
 */

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)]!

function cellsOf(board: Board, color: Color): number[] {
  const out: number[] = []
  for (let i = 0; i < CELLS; i++) if (board[i]?.color === color) out.push(i)
  return out
}

function shuffled<T>(items: T[]): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

/**
 * Who is doing the talking this time. Across the lines it is a quarrel; within
 * one army it is muttering and joint mockery of the other side. Three or four
/**
 * Weighted draw. Complaining is for the ones with something to complain about:
 * a piece that steps one square at a time does most of the grumbling, one with
 * three squares of reach hardly ever bothers.
 */
function pickWeighted(cells: number[], weight: (cell: number) => number): number {
  const total = cells.reduce((sum, cell) => sum + weight(cell), 0)
  let roll = Math.random() * total
  for (const cell of cells) {
    roll -= weight(cell)
    if (roll <= 0) return cell
  }
  return cells[cells.length - 1]!
}

const grumbleWeight = (board: Board) => (cell: number) => {
  const range = PIECES[board[cell]!.kind].range
  return range === 1 ? 6 : range === 2 ? 2 : 0.5
}

/**
 * Who is doing the talking this time: a quarrel across the lines, muttering
 * within one army, or somebody simply sick of the whole business. Two to four
 * of them, fewer only when there are not enough pieces left to fill the lines.
 */
export function pickSpeakers(board: Board): { speakers: number[]; flavour: BanterFlavour } | null {
  const white = cellsOf(board, 'white')
  const black = cellsOf(board, 'black')
  const both = [...white, ...black]
  if (both.length < 2) return null

  // A grumble needs nobody in particular — anyone can be sick of the weather.
  if (Math.random() < 0.3) {
    const first = pickWeighted(both, grumbleWeight(board))
    const rest = shuffled(both.filter((cell) => cell !== first))
    return { speakers: [first, rest[0]!], flavour: 'grumble' }
  }

  const canSquabble = white.length > 0 && black.length > 0
  const gossipSides = [white, black].filter((side) => side.length >= 2)
  const wantSquabble = canSquabble && (gossipSides.length === 0 || Math.random() < 0.6)

  if (wantSquabble) {
    const first = pick(both)
    const other = board[first]!.color === 'white' ? black : white
    const second = pick(other)
    const rest = shuffled(both.filter((cell) => cell !== first && cell !== second))
    const extra = rest.slice(0, rest.length > 1 && Math.random() < 0.45 ? 2 : 1)
    return { speakers: [first, second, ...extra], flavour: 'squabble' }
  }

  if (gossipSides.length === 0) return null
  const side = shuffled(pick(gossipSides))
  return { speakers: side.slice(0, side.length > 2 && Math.random() < 0.5 ? 3 : 2), flavour: 'gossip' }
}

/** Squares next to either end of the move — the ones who watched it happen. */
function neighboursOf(board: Board, ...cells: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < CELLS; i++) {
    if (!board[i]) continue
    const near = cells.some(
      (cell) =>
        Math.max(Math.abs(rowOf(i) - rowOf(cell)), Math.abs(colOf(i) - colOf(cell))) <= 1 &&
        i !== cell,
    )
    if (near) out.push(i)
  }
  return out
}

/** Who speaks up about the move that just landed, and in what key. */
export function pickReaction(
  board: Board,
  human: Color,
  news: MoveNews,
  moverCell: number | null,
  moverColor: Color,
  victimColor: Color | null,
): { speakers: number[]; flavour: ReactionFlavour } | null {
  const side = (color: Color, except: number | null) =>
    cellsOf(board, color).filter((cell) => cell !== except)
  const pair = (first: number, pool: number[]): number[] => {
    const rest = shuffled(pool.filter((cell) => cell !== first))
    return rest.length ? [first, rest[0]!] : [first]
  }

  // The strike missed: the one who was struck at is still standing, and that is
  // the only voice worth hearing.
  if (news.botched && moverCell != null) {
    const defender = board[news.to] ? news.to : null
    if (defender != null) return { speakers: [defender, moverCell], flavour: 'survivor' }
  }

  if (victimColor && moverCell != null) {
    const killers = side(moverColor, moverCell)
    const mourners = side(victimColor, null)
    const roll = Math.random()
    if (roll < 0.4 && killers.length) return { speakers: [moverCell, pick(killers)], flavour: 'cheer' }
    if (roll < 0.75 && mourners.length) {
      return { speakers: pair(pick(mourners), mourners), flavour: 'mourn' }
    }
    if (mourners.length) return { speakers: [moverCell, pick(mourners)], flavour: 'taunt' }
    return { speakers: [moverCell], flavour: 'cheer' }
  }

  if (news.bestPlayed && moverColor === human) {
    const allies = side(human, moverCell)
    if (allies.length) return { speakers: pair(pick(allies), allies), flavour: 'praise' }
  }

  // Otherwise it is whoever it happened next to: a piece two squares away
  // remarking on something it can barely see reads as noise.
  const witnesses = neighboursOf(board, news.from, news.to)
  const all = [...cellsOf(board, 'white'), ...cellsOf(board, 'black')]
  const pool = witnesses.length && Math.random() < 0.75 ? witnesses : all
  return pool.length ? { speakers: [pick(pool)], flavour: 'remark' } : null
}

/** The same move by its ends — enough to tell whether the engine's pick was played. */
export const sameMove = (a: Move | null, b: Move | null): boolean =>
  !!a && !!b && a.from === b.from && a.to === b.to
