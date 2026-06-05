import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createInitialState,
  legalMovesFrom,
  placePiece,
  placementCells,
  resolveMove,
  type DuelRoll,
} from './engine'
import { chooseBotMove, chooseBotPlacement } from './bot'
import { PIECES, type PieceDef } from './pieces'
import type { AnimInfo, AnimKind } from '@/components/MoveAnimation'
import type { Color, GameState, Move } from './types'

/** A resolved duel plus who attacked, for the UI banner. */
export type DuelEvent = DuelRoll & { by: Color }

/** The visual animation plus the not-yet-committed result it will apply. */
type ActiveAnim = AnimInfo & { next: GameState; duelEvent: DuelEvent | null }

/** Enough of a move to replay its slide after a won duel. */
type PendingMove = Pick<AnimInfo, 'from' | 'to' | 'attacker' | 'victim' | 'owner'>

const ANIM_MOVE_MS = 1100
const ANIM_DUEL_MS = 650 // just the arrow; the dice then roll in the modal

export interface UseGameOptions {
  /** Color the human plays (the other side is the bot when vsBot). */
  humanColor: Color
  vsBot: boolean
}

export interface UseGame {
  state: GameState
  /** Empty cells the human may drop the pending piece on (draft phase). */
  placementTargets: number[]
  /** Selected piece during the move phase. */
  selected: number | null
  /** Destinations of the selected piece. */
  legalTargets: number[]
  /** Full legal moves of the selected piece (for capture/move arrows). */
  selectedMoves: Move[]
  /** Meta of the piece the human just drew, if it's their turn to place. */
  pendingDef: PieceDef | null
  /** Cell currently previewed during the draft (ghost piece + move arrows). */
  previewCell: number | null
  /** A resolved duel awaiting acknowledgement — shown as a modal; the game is
   *  paused (the bot won't move) until it's dismissed. */
  duel: DuelEvent | null
  /** Dismiss the duel modal and let play continue. */
  dismissDuel: () => void
  /** Move currently being animated (arrow + slide + capture), or null. */
  anim: AnimInfo | null
  isHumanTurn: boolean
  thinking: boolean
  /** Unified board click — branches on phase internally. */
  onCell: (cell: number) => void
  /** Hover/touch a cell to preview the pending piece there (draft only). */
  onCellEnter: (cell: number) => void
  /** Drop the draft preview (e.g. pointer left the board). */
  clearPreview: () => void
  reset: () => void
}

export function useGame({ humanColor, vsBot }: UseGameOptions): UseGame {
  const [state, setState] = useState<GameState>(createInitialState)
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [duel, setDuel] = useState<DuelEvent | null>(null)
  const [anim, setAnim] = useState<ActiveAnim | null>(null)
  const [pendingNext, setPendingNext] = useState<GameState | null>(null)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [thinking, setThinking] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const animTimer = useRef<ReturnType<typeof setTimeout>>()

  // Begin a move: precompute its outcome (rolling the duel if any) and start the
  // animation. The resulting state is committed only when the animation ends.
  const startMove = useCallback(
    (move: Move) => {
      const attacker = state.board[move.from]
      if (!attacker) return
      const { next, duel: roll } = resolveMove(state, move)
      const kind: AnimKind = roll ? 'duel' : move.capture ? 'capture' : 'move'
      setSelected(null)
      setAnim({
        from: move.from,
        to: move.to,
        kind,
        attacker: attacker.kind,
        victim: move.capture ? (state.board[move.to]?.kind ?? null) : null,
        owner: state.turn,
        next,
        duelEvent: roll ? { ...roll, by: state.turn } : null,
      })
    },
    [state],
  )

  const isHumanTurn = state.phase !== 'over' && (!vsBot || state.turn === humanColor)

  const placementTargets = useMemo(
    () => (state.phase === 'draft' ? placementCells(state) : []),
    [state],
  )

  const selectedMoves = useMemo(
    () => (selected == null ? [] : legalMovesFrom(state, selected)),
    [selected, state],
  )
  const legalTargets = useMemo(() => selectedMoves.map((m) => m.to), [selectedMoves])

  const pendingDef =
    state.phase === 'draft' && isHumanTurn && state.pending ? PIECES[state.pending] : null

  const onCell = useCallback(
    (cell: number) => {
      if (!isHumanTurn || anim || duel) return

      if (state.phase === 'draft') {
        if (state.pending == null || state.board[cell]) return
        // First tap/click previews (ghost + arrows); acting on the already
        // previewed cell confirms placement. On desktop the hover sets the
        // preview first, so a single click still places immediately.
        if (preview === cell) {
          setState((prev) => placePiece(prev, cell))
          setPreview(null)
        } else {
          setPreview(cell)
        }
        return
      }

      if (state.phase === 'play') {
        const piece = state.board[cell]
        // Clicking the already-selected piece again clears the selection.
        if (selected === cell) {
          setSelected(null)
          return
        }
        if (selected != null) {
          const move = legalMovesFrom(state, selected).find((m) => m.to === cell)
          if (move) {
            startMove(move)
            return
          }
        }
        if (piece && piece.color === state.turn && !piece.moved) setSelected(cell)
        else setSelected(null)
      }
    },
    [isHumanTurn, anim, duel, state, selected, preview, startMove],
  )

  const onCellEnter = useCallback(
    (cell: number) => {
      if (!isHumanTurn || state.phase !== 'draft') return
      if (state.pending != null && !state.board[cell]) setPreview(cell)
    },
    [isHumanTurn, state],
  )

  const clearPreview = useCallback(() => setPreview(null), [])

  // Closing the duel modal: on a win, replay the attacker sliding onto the
  // captured cell (then commit); on a miss, just commit (the attacker stays).
  const dismissDuel = useCallback(() => {
    const won = duel?.success
    const move = pendingMove
    const next = pendingNext
    setDuel(null)
    setPendingMove(null)
    setPendingNext(null)
    if (!next) return
    if (won && move) {
      setAnim({ ...move, kind: 'capture', next, duelEvent: null })
    } else {
      setState(next)
    }
  }, [duel, pendingMove, pendingNext])

  const reset = useCallback(() => {
    clearTimeout(timer.current)
    clearTimeout(animTimer.current)
    setState(createInitialState())
    setSelected(null)
    setPreview(null)
    setDuel(null)
    setAnim(null)
    setPendingNext(null)
    setPendingMove(null)
    setThinking(false)
  }, [])

  // When a move animation finishes: commit the result, or (for a duel) reveal
  // the modal and defer committing until it's dismissed.
  useEffect(() => {
    if (!anim) return
    animTimer.current = setTimeout(
      () => {
        if (anim.duelEvent) {
          setPendingNext(anim.next)
          setPendingMove({
            from: anim.from,
            to: anim.to,
            attacker: anim.attacker,
            victim: anim.victim,
            owner: anim.owner,
          })
          setDuel(anim.duelEvent)
        } else {
          setState(anim.next)
        }
        setAnim(null)
      },
      anim.kind === 'duel' ? ANIM_DUEL_MS : ANIM_MOVE_MS,
    )
    return () => clearTimeout(animTimer.current)
  }, [anim])

  // Bot turn (draft placement or move), with a short "thinking" delay. The bot
  // waits while a move is animating or a duel modal is open.
  useEffect(() => {
    if (!vsBot) return
    if (anim || duel) return
    if (state.phase === 'over') return
    if (state.turn === humanColor) return

    setThinking(true)
    timer.current = setTimeout(() => {
      if (state.phase === 'draft') {
        const cell = chooseBotPlacement(state)
        if (cell != null) setState(placePiece(state, cell))
      } else if (state.phase === 'play') {
        const move = chooseBotMove(state)
        if (move) startMove(move)
      }
      setThinking(false)
    }, 550)

    return () => clearTimeout(timer.current)
  }, [state, vsBot, humanColor, anim, duel, startMove])

  // Only show the ghost while the human is actually drafting.
  const previewCell =
    state.phase === 'draft' && isHumanTurn && preview != null && !state.board[preview]
      ? preview
      : null

  return {
    state,
    placementTargets,
    selected,
    legalTargets,
    selectedMoves,
    pendingDef,
    previewCell,
    duel,
    dismissDuel,
    anim,
    isHumanTurn,
    thinking,
    onCell,
    onCellEnter,
    clearPreview,
    reset,
  }
}
