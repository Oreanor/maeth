import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  beginDraft,
  createLotteryState,
  firstTurnFromRoll,
  legalMovesFrom,
  movablePieces,
  placePiece,
  placementCells,
  resolveMove,
  type DuelRoll,
} from './engine'
import { chooseBotMove, chooseBotPlacement } from './bot'
import { PIECES, type PieceDef } from './pieces'
import type { AnimInfo, AnimKind } from '@/components/MoveAnimation'
import type { Color, GameState, Move } from './types'
import { useDelayedCeremonySlot } from './useDelayedCeremonySlot'
import { useDraftPick, type DraftPick } from './useDraftPick'
import type { SeriesScore } from '@/lib/api'
import type { StoredAction } from './actionLog'

export type { DraftPick }

/** A resolved duel plus who attacked, for the UI banner. */
export type DuelEvent = DuelRoll & { by: Color }

/** The visual animation plus the not-yet-committed result it will apply. */
type ActiveAnim = AnimInfo & {
  next: GameState
  replay?: boolean
  /** Opponent's pre-duel aim arrow — opens the duel modal when the anim ends. */
  duelEvent?: DuelEvent | null
}

/** Enough of a move to replay its slide after a won duel. */
type PendingMove = Pick<AnimInfo, 'from' | 'to' | 'attacker' | 'victim' | 'owner'>

const ANIM_MOVE_MS = 1100
const ANIM_DUEL_AIM_MS = 650

// The bot fakes deliberation: a random ~1–2s before it "clicks" Choose, a slow
// (~2× the old delay) placement, and a 2–3s idle "think" before each move.
const botPickDelay = () => 1000 + Math.random() * 1000
const botPlaceDelay = () => 900 + Math.random() * 700
const botMoveDelay = () => 1800 + Math.random() * 1300

export interface UseGameOptions {
  /** Color the human plays (the other side is the bot when vsBot). */
  humanColor: Color
  vsBot: boolean
  /** When false, contested captures are clean takes (no dice). */
  duels: boolean
}

export interface UseGame {
  state: GameState
  /** Running score of this local session's games (rematches via reset), by colour. */
  series: SeriesScore
  /** Local play-by-play history (same shape as server actions). */
  actions: StoredAction[]
  /** Empty cells the human may drop the pending piece on (draft phase). */
  placementTargets: number[]
  /** Selected piece during the move phase. */
  selected: number | null
  /** Destinations of the selected piece. */
  legalTargets: number[]
  /** Full legal moves of the selected piece (for capture/move arrows). */
  selectedMoves: Move[]
  /** Own pieces that can be picked up this turn (hover affordance). */
  movableCells: number[]
  /** Meta of the piece the human just drew, if it's their turn to place. */
  pendingDef: PieceDef | null
  /** The blind-draw reveal in progress (spinning portraits), or null. */
  draftPick: DraftPick | null
  /** Settle the human's pick on the drawn piece (tap on the reveal). */
  confirmDraftPick: () => void
  /** The cell a piece was last dropped on, briefly highlighted (draft phase). */
  lastPlaced: number | null
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
  /** Turn lottery before the draft (every local game and rematch). */
  inLottery: boolean
  rollLottery: () => void
  startLottery: () => void
}

export function useGame({ humanColor, vsBot, duels }: UseGameOptions): UseGame {
  const [state, setState] = useState<GameState>(createLotteryState)
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [duel, setDuel] = useState<DuelEvent | null>(null)
  const [anim, setAnim] = useState<ActiveAnim | null>(null)
  const [pendingNext, setPendingNext] = useState<GameState | null>(null)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [thinking, setThinking] = useState(false)
  const [lastPlaced, setLastPlaced] = useState<number | null>(null)
  // Per-session room score. Persists across `reset()` (a local rematch) and only
  // clears when the screen unmounts (i.e. you leave the room).
  const [series, setSeries] = useState<SeriesScore>({ white: 0, black: 0, draws: 0 })
  const [localActions, setLocalActions] = useState<StoredAction[]>([])
  const actionIdRef = useRef(0)
  const countedOverRef = useRef(false)

  const recordAction = useCallback(
    (action_type: StoredAction['action_type'], payload: StoredAction['payload']) => {
      actionIdRef.current += 1
      setLocalActions((prev) => [...prev, { id: actionIdRef.current, action_type, payload }])
    },
    [],
  )
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const animTimer = useRef<ReturnType<typeof setTimeout>>()

  // The blind-draw "roulette" — opens when a piece is drawn, the bot auto-picks,
  // and `pickReady` flips true once the reveal closes (placement allowed then).
  const draftSlot =
    state.phase === 'draft' && state.pending != null
      ? state.placed.white + state.placed.black
      : -1
  const ceremonySlot = useDelayedCeremonySlot(draftSlot)
  const {
    pick,
    pickReady,
    confirm: confirmDraftPick,
    reset: resetPick,
  } = useDraftPick({
    slot: ceremonySlot,
    by: state.phase === 'draft' ? state.turn : null,
    pool: () => (state.pending != null ? [...state.deck, state.pending] : []),
    drawn: () => state.pending,
    autoConfirmMs: (by) => (vsBot && by !== humanColor ? botPickDelay() : null),
  })
  // Ignore stale pickReady while ceremonySlot catches up to draftSlot (post-placement pause).
  const canPlace =
    pickReady && ceremonySlot >= 0 && ceremonySlot === draftSlot

  // Begin a move: precompute its outcome (rolling the duel if any). Human duels
  // open the modal at once; the bot shows an aim arrow first so you see the line.
  const startMove = useCallback(
    (move: Move) => {
      const attacker = state.board[move.from]
      if (!attacker) return
      const { next, duel: roll } = resolveMove(state, move, { duels })
      const opponentTurn = vsBot && state.turn !== humanColor
      setSelected(null)
      if (roll) {
        const duelEvent = { ...roll, by: state.turn }
        if (opponentTurn) {
          setAnim({
            from: move.from,
            to: move.to,
            kind: 'duel',
            attacker: attacker.kind,
            victim: move.capture ? (state.board[move.to]?.kind ?? null) : null,
            owner: state.turn,
            next,
            duelEvent,
          })
          return
        }
        setPendingNext(next)
        setPendingMove({
          from: move.from,
          to: move.to,
          attacker: attacker.kind,
          victim: move.capture ? (state.board[move.to]?.kind ?? null) : null,
          owner: state.turn,
        })
        setDuel(duelEvent)
        return
      }
      const kind: AnimKind = move.capture ? 'capture' : 'move'
      setAnim({
        from: move.from,
        to: move.to,
        kind,
        attacker: attacker.kind,
        victim: move.capture ? (state.board[move.to]?.kind ?? null) : null,
        owner: state.turn,
        next,
      })
    },
    [state, duels, vsBot, humanColor],
  )

  const isHumanTurn =
    state.phase !== 'over' &&
    state.phase !== 'lottery' &&
    (!vsBot || state.turn === humanColor)
  const inLottery = state.phase === 'lottery'

  const placementTargets = useMemo(
    () => (state.phase === 'draft' ? placementCells(state) : []),
    [state],
  )

  const selectedMoves = useMemo(
    () => (selected == null ? [] : legalMovesFrom(state, selected)),
    [selected, state],
  )
  const legalTargets = useMemo(() => selectedMoves.map((m) => m.to), [selectedMoves])

  // Own pieces the player can pick up right now — used for the hover "shiver".
  const movableCells = useMemo(
    () => (isHumanTurn ? movablePieces(state) : []),
    [state, isHumanTurn],
  )

  // Only reveal the piece (and enable placement) after the pick ceremony closes.
  const pendingDef =
    state.phase === 'draft' && isHumanTurn && canPlace && state.pending
      ? PIECES[state.pending]
      : null

  const onCell = useCallback(
    (cell: number) => {
      if (!isHumanTurn || anim || duel) return

      if (state.phase === 'draft') {
        if (!canPlace || state.pending == null || state.board[cell]) return
        // First tap/click previews (ghost + arrows); acting on the already
        // previewed cell confirms placement. On desktop the hover sets the
        // preview first, so a single click still places immediately.
        if (preview === cell) {
          recordAction('place', { by: state.turn, cell, kind: state.pending })
          setState((prev) => placePiece(prev, cell))
          setPreview(null)
          setLastPlaced(cell)
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
    [isHumanTurn, anim, duel, state, selected, preview, startMove, canPlace, recordAction],
  )

  const onCellEnter = useCallback(
    (cell: number) => {
      if (!isHumanTurn || state.phase !== 'draft' || !canPlace) return
      if (state.pending != null && !state.board[cell]) setPreview(cell)
    },
    [isHumanTurn, state, canPlace],
  )

  const clearPreview = useCallback(() => setPreview(null), [])

  const rollLottery = useCallback(() => {
    setState((prev) => {
      if (prev.phase !== 'lottery' || prev.lottery?.step !== 'await_roll') return prev
      const roll = 1 + Math.floor(Math.random() * 6)
      const firstTurn = firstTurnFromRoll(roll)
      return {
        ...prev,
        lottery: { step: 'revealed', roll, firstTurn },
        turn: firstTurn,
      }
    })
  }, [])

  const startLottery = useCallback(() => {
    setState((prev) => {
      if (prev.phase !== 'lottery' || prev.lottery?.step !== 'revealed' || !prev.lottery.firstTurn) {
        return prev
      }
      if (!vsBot && prev.lottery.firstTurn !== humanColor) return prev
      return beginDraft(prev.lottery.firstTurn)
    })
  }, [humanColor, vsBot])

  // Settle the spinning portrait on the actually-drawn piece (human's button, or
  // the bot's auto-pick). The reveal effect then closes the modal after a beat.
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
    if (move) {
      recordAction('move', {
        by: move.owner,
        from: move.from,
        to: move.to,
        duel: duel ?? null,
      })
    }
    if (won && move) {
      setAnim({ ...move, kind: 'capture', next, replay: true })
    } else {
      setState(next)
    }
  }, [duel, pendingMove, pendingNext, recordAction])

  const reset = useCallback(() => {
    clearTimeout(timer.current)
    clearTimeout(animTimer.current)
    resetPick()
    setState(createLotteryState())
    setSelected(null)
    setPreview(null)
    setDuel(null)
    setAnim(null)
    setPendingNext(null)
    setPendingMove(null)
    setThinking(false)
    setLastPlaced(null)
    setLocalActions([])
    actionIdRef.current = 0
  }, [resetPick])

  // When a move animation finishes: commit, or (bot pre-duel aim) open the modal.
  useEffect(() => {
    if (!anim) return
    const ms = anim.duelEvent ? ANIM_DUEL_AIM_MS : ANIM_MOVE_MS
    animTimer.current = setTimeout(() => {
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
        setAnim(null)
        return
      }
      if (!anim.replay) {
        recordAction('move', {
          by: anim.owner,
          from: anim.from,
          to: anim.to,
          duel: null,
        })
      }
      setState(anim.next)
      setAnim(null)
    }, ms)
    return () => clearTimeout(animTimer.current)
  }, [anim, recordAction])

  // Bot turn (draft placement or move), with a short "thinking" delay. The bot
  // waits while a move is animating or a duel modal is open.
  useEffect(() => {
    if (!vsBot) return
    if (anim || duel) return
    if (state.phase === 'lottery' || state.phase === 'over') return
    if (state.turn === humanColor) return
    // In the draft, the bot only places after its reveal ceremony has finished.
    if (state.phase === 'draft' && !canPlace) return

    setThinking(true)
    timer.current = setTimeout(
      () => {
        if (state.phase === 'draft') {
          const cell = chooseBotPlacement(state)
          if (cell != null) {
            recordAction('place', { by: state.turn, cell, kind: state.pending! })
            setState(placePiece(state, cell))
            setLastPlaced(cell)
          }
        } else if (state.phase === 'play') {
          const move = chooseBotMove(state)
          if (move) startMove(move)
        }
        setThinking(false)
      },
      state.phase === 'draft' ? botPlaceDelay() : botMoveDelay(),
    )

    return () => clearTimeout(timer.current)
  }, [state, vsBot, humanColor, anim, duel, startMove, canPlace, recordAction])

  // Tally the room score once per finished game (the count survives reset()).
  useEffect(() => {
    if (state.phase !== 'over') {
      countedOverRef.current = false
      return
    }
    if (countedOverRef.current) return
    countedOverRef.current = true
    setSeries((s) => {
      if (state.status.kind === 'draw') return { ...s, draws: s.draws + 1 }
      if (state.status.kind === 'win') {
        return state.status.winner === 'white'
          ? { ...s, white: s.white + 1 }
          : { ...s, black: s.black + 1 }
      }
      return s
    })
  }, [state.phase, state.status])

  // Only show the ghost while the human is actually drafting.
  const previewCell =
    state.phase === 'draft' && isHumanTurn && preview != null && !state.board[preview]
      ? preview
      : null

  return {
    state,
    series,
    actions: localActions,
    placementTargets,
    selected,
    legalTargets,
    selectedMoves,
    movableCells,
    pendingDef,
    draftPick: pick,
    confirmDraftPick,
    lastPlaced,
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
    inLottery,
    rollLottery,
    startLottery,
  }
}
