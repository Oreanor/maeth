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
import { PIECES, type PieceDef, type PieceKind } from './pieces'
import type { AnimInfo, AnimKind } from '@/components/MoveAnimation'
import type { Color, GameState, Move } from './types'
import { PICK_CLOSE_MS, PICK_OPEN_DELAY_MS, PICK_REVEAL_MS } from './timing'
import type { SeriesScore } from '@/lib/api'
import type { StoredAction } from './actionLog'

/** A resolved duel plus who attacked, for the UI banner. */
export type DuelEvent = DuelRoll & { by: Color }

/** The blind draw shown as a spinning-portrait modal before a piece is placed. */
export interface DraftPick {
  /** Whose pick this is. */
  by: Color
  /** Pieces still in the bag (incl. the drawn one) — cycled while spinning. */
  pool: PieceKind[]
  /** The drawn piece once the pick settles; null while still spinning. */
  settled: PieceKind | null
  /** True while the modal plays its shrink-to-a-point close animation. */
  closing?: boolean
}

/** The visual animation plus the not-yet-committed result it will apply. */
type ActiveAnim = AnimInfo & { next: GameState; duelEvent: DuelEvent | null }

/** Enough of a move to replay its slide after a won duel. */
type PendingMove = Pick<AnimInfo, 'from' | 'to' | 'attacker' | 'victim' | 'owner'>

const ANIM_MOVE_MS = 1100
const ANIM_DUEL_MS = 650 // just the arrow; the dice then roll in the modal

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
}

export function useGame({ humanColor, vsBot, duels }: UseGameOptions): UseGame {
  const [state, setState] = useState<GameState>(createInitialState)
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [duel, setDuel] = useState<DuelEvent | null>(null)
  const [anim, setAnim] = useState<ActiveAnim | null>(null)
  const [pendingNext, setPendingNext] = useState<GameState | null>(null)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [thinking, setThinking] = useState(false)
  // The blind-draw ceremony: `pick` drives the modal; `pickReady` flips true
  // once the reveal closes, which is when placement is actually allowed.
  const [pick, setPick] = useState<DraftPick | null>(null)
  const [pickReady, setPickReady] = useState(false)
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
  const pickSlotRef = useRef(-1)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const animTimer = useRef<ReturnType<typeof setTimeout>>()
  const pickTimer = useRef<ReturnType<typeof setTimeout>>()
  const revealTimer = useRef<ReturnType<typeof setTimeout>>()
  const openTimer = useRef<ReturnType<typeof setTimeout>>()

  // Begin a move: precompute its outcome (rolling the duel if any) and start the
  // animation. The resulting state is committed only when the animation ends.
  const startMove = useCallback(
    (move: Move) => {
      const attacker = state.board[move.from]
      if (!attacker) return
      const { next, duel: roll } = resolveMove(state, move, { duels })
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
    [state, duels],
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

  // Own un-moved pieces that have at least one legal move right now — the ones
  // the player can pick up. Used to give them a hover "shiver".
  const movableCells = useMemo(() => {
    if (state.phase !== 'play' || !isHumanTurn) return []
    const out: number[] = []
    for (let i = 0; i < state.board.length; i++) {
      const p = state.board[i]
      if (p && p.color === state.turn && !p.moved && legalMovesFrom(state, i).length > 0) out.push(i)
    }
    return out
  }, [state, isHumanTurn])

  // Only reveal the piece (and enable placement) after the pick ceremony closes.
  const pendingDef =
    state.phase === 'draft' && isHumanTurn && pickReady && state.pending
      ? PIECES[state.pending]
      : null

  const onCell = useCallback(
    (cell: number) => {
      if (!isHumanTurn || anim || duel) return

      if (state.phase === 'draft') {
        if (!pickReady || state.pending == null || state.board[cell]) return
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
    [isHumanTurn, anim, duel, state, selected, preview, startMove, pickReady, recordAction],
  )

  const onCellEnter = useCallback(
    (cell: number) => {
      if (!isHumanTurn || state.phase !== 'draft' || !pickReady) return
      if (state.pending != null && !state.board[cell]) setPreview(cell)
    },
    [isHumanTurn, state, pickReady],
  )

  const clearPreview = useCallback(() => setPreview(null), [])

  // Settle the spinning portrait on the actually-drawn piece (human's button, or
  // the bot's auto-pick). The reveal effect then closes the modal after a beat.
  const confirmDraftPick = useCallback(() => {
    setPick((p) =>
      p && p.settled == null && state.pending != null ? { ...p, settled: state.pending } : p,
    )
  }, [state.pending])

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
      setAnim({ ...move, kind: 'capture', next, duelEvent: null })
    } else {
      setState(next)
    }
  }, [duel, pendingMove, pendingNext, recordAction])

  const reset = useCallback(() => {
    clearTimeout(timer.current)
    clearTimeout(animTimer.current)
    clearTimeout(pickTimer.current)
    clearTimeout(revealTimer.current)
    clearTimeout(openTimer.current)
    pickSlotRef.current = -1
    setState(createInitialState())
    setSelected(null)
    setPreview(null)
    setDuel(null)
    setAnim(null)
    setPendingNext(null)
    setPendingMove(null)
    setThinking(false)
    setPick(null)
    setPickReady(false)
    setLastPlaced(null)
    setLocalActions([])
    actionIdRef.current = 0
  }, [])

  // Start a fresh pick ceremony whenever a new piece is drawn (a new draft
  // "slot" — the count of pieces placed so far uniquely identifies each draw).
  const draftSlot =
    state.phase === 'draft' && state.pending != null
      ? state.placed.white + state.placed.black
      : -1
  useEffect(() => {
    if (draftSlot < 0) {
      pickSlotRef.current = -1
      setPick(null)
      setPickReady(false)
      return
    }
    if (pickSlotRef.current === draftSlot) return
    pickSlotRef.current = draftSlot
    setPickReady(false)
    setPick(null)
    const turn = state.turn
    const pool = [...state.deck, state.pending as PieceKind]
    const open = () => setPick({ by: turn, pool, settled: null })
    // After a piece lands, give the human a beat to see where it went before
    // their own pick modal pops up (the bot's pick opens right away).
    const pickIsHuman = !vsBot || turn === humanColor
    if (draftSlot >= 1 && pickIsHuman) {
      openTimer.current = setTimeout(open, PICK_OPEN_DELAY_MS)
      return () => clearTimeout(openTimer.current)
    }
    open()
  }, [draftSlot, state.turn, state.deck, state.pending, vsBot, humanColor])

  // The bot fakes choosing: after a random 2–4s, it "clicks" Choose.
  useEffect(() => {
    if (!vsBot || !pick || pick.settled != null || pick.by === humanColor) return
    pickTimer.current = setTimeout(confirmDraftPick, botPickDelay())
    return () => clearTimeout(pickTimer.current)
  }, [vsBot, pick, humanColor, confirmDraftPick])

  // Once settled, linger on the portrait, then play the shrink-to-a-point close
  // animation, and only then unmount the modal and allow placement.
  useEffect(() => {
    if (!pick || pick.settled == null) return
    if (pick.closing) {
      revealTimer.current = setTimeout(() => {
        setPick(null)
        setPickReady(true)
      }, PICK_CLOSE_MS)
    } else {
      revealTimer.current = setTimeout(() => {
        setPick((p) => (p ? { ...p, closing: true } : p))
      }, PICK_REVEAL_MS)
    }
    return () => clearTimeout(revealTimer.current)
  }, [pick])

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
          recordAction('move', {
            by: anim.owner,
            from: anim.from,
            to: anim.to,
            duel: null,
          })
          setState(anim.next)
        }
        setAnim(null)
      },
      anim.kind === 'duel' ? ANIM_DUEL_MS : ANIM_MOVE_MS,
    )
    return () => clearTimeout(animTimer.current)
  }, [anim, recordAction])

  // Bot turn (draft placement or move), with a short "thinking" delay. The bot
  // waits while a move is animating or a duel modal is open.
  useEffect(() => {
    if (!vsBot) return
    if (anim || duel) return
    if (state.phase === 'over') return
    if (state.turn === humanColor) return
    // In the draft, the bot only places after its reveal ceremony has finished.
    if (state.phase === 'draft' && !pickReady) return

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
  }, [state, vsBot, humanColor, anim, duel, startMove, pickReady, recordAction])

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
  }
}
