import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getGame, joinGame, submitGameAction, type ApiGame, type ApiGamePlayer, type SeriesScore } from '@/lib/api'
import { useI18n } from '@/i18n'
import type { DraftPick, DuelEvent } from './useGame'
import { isDuelMove, legalMovesFrom, placePiece, placementCells } from './engine'
import { PIECES, type PieceDef } from './pieces'
import type { Color, GameState, Move } from './types'
import { PICK_CLOSE_MS, PICK_OPEN_DELAY_MS, PICK_REVEAL_MS } from './timing'

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
  series: SeriesScore | null
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
  onCell: (cell: number) => void
  onCellEnter: (cell: number) => void
  clearPreview: () => void
  refresh: () => Promise<void>
}

export function useRemoteGame(gameId: string): UseRemoteGame {
  const { t } = useI18n()
  // Keep the latest translator in a ref so callbacks/effects read current
  // strings without listing `t` in their dependency arrays.
  const tRef = useRef(t)
  tRef.current = t

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [game, setGame] = useState<ApiGame | null>(null)
  const [player, setPlayer] = useState<RemoteGamePlayer | null>(null)
  const [players, setPlayers] = useState<RemotePlayerRow[]>([])
  const [series, setSeries] = useState<SeriesScore | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Mirror of `submitting` for the polling timer, so an in-flight optimistic
  // action isn't clobbered by a stale snapshot from a concurrent refresh.
  const submittingRef = useRef(false)
  submittingRef.current = submitting
  const [duel, setDuel] = useState<DuelEvent | null>(null)
  const [duelPending, setDuelPending] = useState(false)
  // Blind-draw ceremony for your own picks (the opponent's draw stays hidden):
  // `pick` drives the spinning modal, `pickReady` gates placement until it ends.
  const [pick, setPick] = useState<DraftPick | null>(null)
  const [pickReady, setPickReady] = useState(false)
  const pickSlotRef = useRef(-1)
  const revealTimer = useRef<ReturnType<typeof setTimeout>>()
  const openTimer = useRef<ReturnType<typeof setTimeout>>()
  // The last action whose duel we've already shown (or chosen to skip). A ref so
  // applySnapshot stays stable and reads the current value without re-closing.
  const seenActionIdRef = useRef<number | null>(null)
  // Whether we've processed the first snapshot for this game.
  const initializedRef = useRef(false)

  const applySnapshot = useCallback((data: Awaited<ReturnType<typeof getGame>>) => {
    // While our own action is in flight, ignore snapshots — a poll started before
    // the click would otherwise overwrite the optimistic state with a stale board
    // (piece blinks out, then springs back in on the server response).
    if (submittingRef.current && initializedRef.current) return

    setGame(data.game)
    setPlayer(data.player)
    setPlayers(data.players)
    setSeries(data.series)

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
    if (latest && remoteDuel && by && latest.id !== seenActionIdRef.current) {
      seenActionIdRef.current = latest.id
      setDuel({ ...remoteDuel, by })
    }
  }, [])

  const refresh = useCallback(async () => {
    const data = await getGame(gameId)
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
    // pointer and follows it. Only a cancelled game truly stops.
    if (!game || game.status === 'cancelled') return
    const timer = window.setInterval(() => {
      if (submittingRef.current) return // don't overwrite an optimistic update mid-flight
      refresh().catch((e) => setError(e instanceof Error ? e.message : tRef.current('game.errRefresh')))
    }, 700)
    return () => window.clearInterval(timer)
  }, [game?.status, refresh])

  const state = game?.state ?? null
  const isHumanTurn = Boolean(state && player && state.phase !== 'over' && state.turn === player.color)
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

  const movableCells = useMemo(() => {
    if (!state || state.phase !== 'play' || !isHumanTurn) return []
    const out: number[] = []
    for (let i = 0; i < state.board.length; i++) {
      const p = state.board[i]
      if (p && p.color === state.turn && !p.moved && legalMovesFrom(state, i).length > 0) out.push(i)
    }
    return out
  }, [state, isHumanTurn])

  // Only reveal the piece (and allow placement) once the pick ceremony closes.
  const pendingDef =
    state?.phase === 'draft' && isHumanTurn && pickReady && state.pending
      ? PIECES[state.pending]
      : null

  // Settle the spinning portrait on your actually-drawn piece (the tap).
  const confirmDraftPick = useCallback(() => {
    setPick((p) =>
      p && p.settled == null && state?.pending != null ? { ...p, settled: state.pending } : p,
    )
  }, [state?.pending])

  // Start a fresh pick ceremony each time it becomes your turn to draw, after a
  // short beat so the opponent's just-placed piece registers first. While the
  // game is still waiting for the second player, hold the roulette — there's no
  // point drawing a piece you can't place yet.
  const waiting = game?.status === 'waiting'
  const draftSlot =
    state?.phase === 'draft' && isHumanTurn && !waiting && state.pending != null
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
    const open = () => {
      const st = stateRef.current
      const pl = playerRef.current
      if (!st || !pl || st.pending == null) return
      setPick({ by: pl.color, pool: [...st.deck, st.pending], settled: null })
    }
    if (draftSlot >= 1) {
      openTimer.current = setTimeout(open, PICK_OPEN_DELAY_MS)
      return () => clearTimeout(openTimer.current)
    }
    open()
  }, [draftSlot])

  // Once settled, linger on the portrait, then the shrink close, then allow
  // placement.
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

  const onCell = useCallback(
    (cell: number) => {
      if (!state || !isHumanTurn || submitting) return

      if (state.phase === 'draft') {
        if (!pickReady || !placementTargets.includes(cell)) return
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
        setSubmitting(true)
        submitGameAction(gameId, { type: 'place', cell })
          .then((data) => setGame(data.game))
          .catch((e) => {
            if (prevGame) setGame(prevGame) // revert the optimistic placement
            setError(e instanceof Error ? e.message : tRef.current('game.errPlace'))
          })
          .finally(() => setSubmitting(false))
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
            setSubmitting(true)
            setSelected(null)
            // If this strike is contested, open the rolling duel panel right away
            // so the tap feels acknowledged; the server's roll fills it in.
            if (isDuelMove(state.board, move)) setDuelPending(true)
            submitGameAction(gameId, { type: 'move', from: move.from, to: move.to })
              .then((data) => {
                setGame(data.game)
                if (data.duel) {
                  seenActionIdRef.current = data.latestAction.id
                  setDuel({ ...data.duel, by: state.turn })
                }
                setDuelPending(false)
              })
              .catch((e) => {
                setDuelPending(false)
                setError(e instanceof Error ? e.message : tRef.current('game.errMove'))
              })
              .finally(() => setSubmitting(false))
            return
          }
        }
        if (piece && piece.color === state.turn && !piece.moved) setSelected(cell)
        else setSelected(null)
      }
    },
    [game, gameId, isHumanTurn, pickReady, placementTargets, preview, selected, selectedMoves, state, submitting],
  )

  const onCellEnter = useCallback(
    (cell: number) => {
      if (state?.phase === 'draft' && isHumanTurn && pickReady && placementTargets.includes(cell)) {
        setPreview(cell)
      }
    },
    [isHumanTurn, pickReady, placementTargets, state?.phase],
  )

  return {
    loading,
    error,
    game,
    state,
    player,
    players,
    series,
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
    onCell,
    onCellEnter,
    clearPreview: () => setPreview(null),
    refresh,
  }
}
