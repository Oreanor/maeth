import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getGame,
  joinGame,
  submitGameAction,
  submitLottery,
  type ApiGame,
  type ApiGameAction,
  type ApiGamePlayer,
} from '@/lib/api'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import type { DuelEvent } from './useGame'
import { useDelayedCeremonySlot } from './useDelayedCeremonySlot'
import { useDraftPick, type DraftPick } from './useDraftPick'
import { isDuelMove, legalMovesFrom, movablePieces, placePiece, placementCells } from './engine'
import { PIECES, type PieceDef } from './pieces'
import type { Color, GameState, Move } from './types'

export interface RemoteGamePlayer {
  color: Color
}

export type RemotePlayerRow = ApiGamePlayer

export interface UseRemoteGame {
  loading: boolean
  error: string | null
  game: ApiGame | null
  state: GameState | null
  player: RemoteGamePlayer | null
  players: RemotePlayerRow[]
  /** Running win tally between the two players, by colour. */
  /** Full play-by-play history from the server. */
  actions: ApiGameAction[]
  selected: number | null
  legalTargets: number[]
  selectedMoves: Move[]
  movableCells: number[]
  placementTargets: number[]
  previewCell: number | null
  pendingDef: PieceDef | null
  /** The blind-draw reveal in progress (spinning portraits), or null. */
  draftPick: DraftPick | null
  /** Settle your pick on the drawn piece (tap on the reveal). */
  confirmDraftPick: () => void
  duel: DuelEvent | null
  /** A duel move was submitted; show the rolling panel while we await the server. */
  duelPending: boolean
  isHumanTurn: boolean
  thinking: boolean
  dismissDuel: () => void
  /** Turn lottery before the draft (online games only). */
  inLottery: boolean
  isCreator: boolean
  lotteryRolling: boolean
  lotteryStarting: boolean
  rollLottery: () => void
  startLottery: () => void
  onCell: (cell: number) => void
  onCellEnter: (cell: number) => void
  clearPreview: () => void
  refresh: () => Promise<void>
}

export function useRemoteGame(gameId: string): UseRemoteGame {
  const { t } = useI18n()
  const { user } = useAuth()
  // Keep the latest translator in a ref so callbacks/effects read current
  // strings without listing `t` in their dependency arrays.
  const tRef = useRef(t)
  tRef.current = t

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [game, setGame] = useState<ApiGame | null>(null)
  const [player, setPlayer] = useState<RemoteGamePlayer | null>(null)
  const [players, setPlayers] = useState<RemotePlayerRow[]>([])
  const [actions, setActions] = useState<ApiGameAction[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Synchronous refs for polling: React state does not update until the next
  // render, while a timer may fire in the same tick as a user action.
  const mutationInFlightRef = useRef(false)
  const mutationEpochRef = useRef(0)
  const refreshIdRef = useRef(0)
  const [duel, setDuel] = useState<DuelEvent | null>(null)
  const [duelPending, setDuelPending] = useState(false)
  const [lotteryRolling, setLotteryRolling] = useState(false)
  const [lotteryStarting, setLotteryStarting] = useState(false)
  // The last action whose duel we've already shown (or chosen to skip). A ref so
  // applySnapshot stays stable and reads the current value without re-closing.
  const seenActionIdRef = useRef<number | null>(null)
  // Whether we've processed the first snapshot for this game.
  const initializedRef = useRef(false)

  const applySnapshot = useCallback((data: Awaited<ReturnType<typeof getGame>>) => {
    // While our own action is in flight, ignore snapshots — a poll started before
    // the click would otherwise overwrite the optimistic state with a stale board
    // (piece blinks out, then springs back in on the server response).
    if (mutationInFlightRef.current && initializedRef.current) return

    setGame(data.game)
    setPlayer(data.player)
    setPlayers(data.players)
    setActions(data.actions ?? [])

    const latest = data.latestAction

    // On first load, adopt the latest action as already seen so reopening a
    // game doesn't replay the duel modal for a move that already happened.
    if (!initializedRef.current) {
      initializedRef.current = true
      if (latest) seenActionIdRef.current = latest.id
      return
    }

    const remoteDuel = latest?.payload.duel
    const by = latest?.payload.by
    if (
      latest &&
      remoteDuel &&
      by &&
      latest.id !== seenActionIdRef.current &&
      data.game.duels_enabled !== false
    ) {
      seenActionIdRef.current = latest.id
      setDuel({ ...remoteDuel, by })
    }
  }, [])

  const refresh = useCallback(async () => {
    const epoch = mutationEpochRef.current
    const refreshId = ++refreshIdRef.current
    const data = await getGame(gameId)
    // A mutation started after this request. Its response is older than the
    // transition we are currently committing, even if it arrives last.
    if (epoch !== mutationEpochRef.current || refreshId !== refreshIdRef.current) return
    applySnapshot(data)
  }, [applySnapshot, gameId])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    getGame(gameId)
      .catch(async (e) => {
        if (e instanceof Error && e.message === 'Game not found') {
          try {
            await joinGame(gameId)
          } catch (joinErr) {
            // A concurrent join (e.g. StrictMode's double-mount, or a quick
            // double-click) may have already seated us. Re-check membership: if
            // we're in, carry on; only surface the error if we truly aren't.
            const recheck = await getGame(gameId).catch(() => null)
            if (recheck) return recheck
            throw joinErr
          }
          return getGame(gameId)
        }
        throw e
      })
      .then((data) => {
        if (!alive) return
        applySnapshot(data)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : tRef.current('game.errLoadGame'))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [gameId])

  useEffect(() => {
    // Keep polling finished games too, so the loser/opponent picks up a rematch
    // pointer and follows it — but slowly, since only a rematch can change them.
    // Only a cancelled game truly stops.
    if (!game || game.status === 'cancelled') return
    const interval = game.status === 'over' ? 3000 : 700
    let stopped = false
    let timer: number | undefined
    const poll = async () => {
      if (!mutationInFlightRef.current) {
        await refresh().catch((e) =>
          setError(e instanceof Error ? e.message : tRef.current('game.errRefresh')),
        )
      }
      if (!stopped) timer = window.setTimeout(() => void poll(), interval)
    }
    timer = window.setTimeout(() => void poll(), interval)
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [game?.status, refresh])

  const state = game?.state ?? null
  const inLottery = state?.phase === 'lottery'
  const isCreator = Boolean(game?.created_by && user?.id && game.created_by === user.id)
  const isHumanTurn = Boolean(
    state && player && state.phase !== 'over' && state.phase !== 'lottery' && state.turn === player.color,
  )
  // Latest state/player for timer callbacks, so the pick effect can key purely
  // on the draft slot (a number) and not re-fire on every poll's new snapshot.
  const stateRef = useRef<GameState | null>(null)
  stateRef.current = state
  const playerRef = useRef<RemoteGamePlayer | null>(null)
  playerRef.current = player

  const placementTargets = useMemo(
    () => (state?.phase === 'draft' && isHumanTurn ? placementCells(state) : []),
    [isHumanTurn, state],
  )

  const selectedMoves = useMemo(
    () => (state && selected != null ? legalMovesFrom(state, selected) : []),
    [selected, state],
  )
  const legalTargets = useMemo(() => selectedMoves.map((m) => m.to), [selectedMoves])

  const movableCells = useMemo(
    () => (state && isHumanTurn ? movablePieces(state) : []),
    [state, isHumanTurn],
  )

  // Blind-draw "roulette" for your own picks only — the opponent's draw stays
  // hidden, so it never opens on their turn. Hold it while the room still waits
  // for the second player (no point drawing a piece you can't place yet).
  const waiting = game?.status === 'waiting'
  const draftSlot =
    state?.phase === 'draft' && isHumanTurn && !waiting && !inLottery && state.pending != null
      ? state.placed.white + state.placed.black
      : -1
  const ceremonySlot = useDelayedCeremonySlot(draftSlot)
  const {
    pick,
    pickReady,
    confirm: confirmDraftPick,
  } = useDraftPick({
    slot: ceremonySlot,
    by: player?.color ?? null,
    pool: () => {
      const st = stateRef.current
      return st?.pending != null ? [...st.deck, st.pending] : []
    },
    drawn: () => stateRef.current?.pending ?? null,
  })
  const canPlace =
    pickReady && ceremonySlot >= 0 && ceremonySlot === draftSlot

  // Only reveal the piece (and allow placement) once the pick ceremony closes.
  const pendingDef =
    state?.phase === 'draft' && isHumanTurn && canPlace && state.pending
      ? PIECES[state.pending]
      : null

  const onCell = useCallback(
    (cell: number) => {
      if (!state || !isHumanTurn || submitting) return

      if (state.phase === 'draft') {
        if (!canPlace || !placementTargets.includes(cell)) return
        if (preview !== cell) {
          setPreview(cell)
          return
        }
        // Placement is deterministic, so apply it locally right away and only
        // reconcile (or revert) once the server responds — no waiting on the network.
        const prevGame = game
        const optimistic = placePiece(state, cell)
        if (prevGame) setGame({ ...prevGame, state: optimistic })
        setSelected(null)
        setPreview(null)
        mutationEpochRef.current += 1
        mutationInFlightRef.current = true
        setSubmitting(true)
        submitGameAction(gameId, { type: 'place', cell })
          .then((data) => setGame((current) => (current ? { ...current, ...data.game } : data.game)))
          .catch((e) => {
            if (prevGame) setGame(prevGame) // revert the optimistic placement
            setError(e instanceof Error ? e.message : tRef.current('game.errPlace'))
          })
          .finally(() => {
            mutationInFlightRef.current = false
            setSubmitting(false)
          })
        return
      }

      if (state.phase === 'play') {
        const piece = state.board[cell]
        if (selected === cell) {
          setSelected(null)
          return
        }
        if (selected != null) {
          const move = selectedMoves.find((m) => m.to === cell)
          if (move) {
            mutationEpochRef.current += 1
            mutationInFlightRef.current = true
            setSubmitting(true)
            setSelected(null)
            // If this strike is contested, open the rolling duel panel right away
            // so the tap feels acknowledged; the server's roll fills it in.
            if (game?.duels_enabled !== false && isDuelMove(state.board, move)) setDuelPending(true)
            submitGameAction(gameId, { type: 'move', from: move.from, to: move.to })
              .then((data) => {
                setGame((current) => (current ? { ...current, ...data.game } : data.game))
                if (data.duel && data.game.duels_enabled !== false) {
                  seenActionIdRef.current = data.latestAction.id
                  setDuel({ ...data.duel, by: state.turn })
                }
                setDuelPending(false)
              })
              .catch((e) => {
                setDuelPending(false)
                setError(e instanceof Error ? e.message : tRef.current('game.errMove'))
              })
              .finally(() => {
                mutationInFlightRef.current = false
                setSubmitting(false)
              })
            return
          }
        }
        if (piece && piece.color === state.turn && !piece.moved) setSelected(cell)
        else setSelected(null)
      }
    },
    [game, gameId, isHumanTurn, canPlace, placementTargets, preview, selected, selectedMoves, state, submitting],
  )

  const onCellEnter = useCallback(
    (cell: number) => {
      if (state?.phase === 'draft' && isHumanTurn && canPlace && placementTargets.includes(cell)) {
        setPreview(cell)
      }
    },
    [isHumanTurn, canPlace, placementTargets, state?.phase],
  )

  const rollLottery = useCallback(() => {
    if (lotteryRolling) return
    mutationEpochRef.current += 1
    mutationInFlightRef.current = true
    setLotteryRolling(true)
    submitLottery(gameId, 'roll')
      .then((data) => setGame((current) => (current ? { ...current, ...data.game } : data.game)))
      .catch((e) => setError(e instanceof Error ? e.message : tRef.current('lottery.errRoll')))
      .finally(() => {
        mutationInFlightRef.current = false
        setLotteryRolling(false)
      })
  }, [gameId, lotteryRolling])

  const startLottery = useCallback(() => {
    if (lotteryStarting) return
    mutationEpochRef.current += 1
    mutationInFlightRef.current = true
    setLotteryStarting(true)
    submitLottery(gameId, 'start')
      .then((data) => setGame((current) => (current ? { ...current, ...data.game } : data.game)))
      .catch((e) => setError(e instanceof Error ? e.message : tRef.current('lottery.errStart')))
      .finally(() => {
        mutationInFlightRef.current = false
        setLotteryStarting(false)
      })
  }, [gameId, lotteryStarting])

  return {
    loading,
    error,
    game,
    state,
    player,
    players,
    actions,
    selected,
    legalTargets,
    selectedMoves,
    movableCells,
    placementTargets,
    previewCell: state?.phase === 'draft' && isHumanTurn && preview != null ? preview : null,
    pendingDef,
    draftPick: pick,
    confirmDraftPick,
    duel,
    duelPending,
    isHumanTurn,
    thinking: submitting || Boolean(state && player && state.phase !== 'over' && state.turn !== player.color),
    dismissDuel: () => {
      setDuel(null)
      setDuelPending(false)
    },
    inLottery,
    isCreator,
    lotteryRolling,
    lotteryStarting,
    rollLottery,
    startLottery,
    onCell,
    onCellEnter,
    clearPreview: () => setPreview(null),
    refresh,
  }
}
