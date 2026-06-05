import { useCallback, useEffect, useMemo, useState } from 'react'
import { getGame, joinGame, submitGameAction, type ApiGame, type ApiGamePlayer } from '@/lib/api'
import type { DuelEvent } from './useGame'
import { legalMovesFrom, placementCells } from './engine'
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
  selected: number | null
  legalTargets: number[]
  selectedMoves: Move[]
  placementTargets: number[]
  previewCell: number | null
  pendingDef: PieceDef | null
  duel: DuelEvent | null
  isHumanTurn: boolean
  thinking: boolean
  dismissDuel: () => void
  onCell: (cell: number) => void
  onCellEnter: (cell: number) => void
  clearPreview: () => void
  refresh: () => Promise<void>
}

export function useRemoteGame(gameId: string): UseRemoteGame {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [game, setGame] = useState<ApiGame | null>(null)
  const [player, setPlayer] = useState<RemoteGamePlayer | null>(null)
  const [players, setPlayers] = useState<RemotePlayerRow[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [duel, setDuel] = useState<DuelEvent | null>(null)
  const [seenActionId, setSeenActionId] = useState<number | null>(null)

  const applySnapshot = useCallback(
    (data: Awaited<ReturnType<typeof getGame>>) => {
      setGame(data.game)
      setPlayer(data.player)
      setPlayers(data.players)

      const latest = data.latestAction
      const remoteDuel = latest?.payload.duel
      const by = latest?.payload.by
      if (latest && remoteDuel && by && latest.id !== seenActionId) {
        setSeenActionId(latest.id)
        setDuel({ ...remoteDuel, by })
      }
    },
    [seenActionId],
  )

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
          await joinGame(gameId)
          return getGame(gameId)
        }
        throw e
      })
      .then((data) => {
        if (!alive) return
        applySnapshot(data)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Не удалось загрузить игру')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [gameId])

  useEffect(() => {
    if (!game || game.status === 'over' || game.status === 'cancelled') return
    const timer = window.setInterval(() => {
      refresh().catch((e) => setError(e instanceof Error ? e.message : 'Не удалось обновить игру'))
    }, 700)
    return () => window.clearInterval(timer)
  }, [game?.status, refresh])

  const state = game?.state ?? null
  const isHumanTurn = Boolean(state && player && state.phase !== 'over' && state.turn === player.color)

  const placementTargets = useMemo(
    () => (state?.phase === 'draft' && isHumanTurn ? placementCells(state) : []),
    [isHumanTurn, state],
  )

  const selectedMoves = useMemo(
    () => (state && selected != null ? legalMovesFrom(state, selected) : []),
    [selected, state],
  )
  const legalTargets = useMemo(() => selectedMoves.map((m) => m.to), [selectedMoves])

  const pendingDef =
    state?.phase === 'draft' && isHumanTurn && state.pending ? PIECES[state.pending] : null

  const onCell = useCallback(
    (cell: number) => {
      if (!state || !isHumanTurn || submitting) return

      if (state.phase === 'draft') {
        if (!placementTargets.includes(cell)) return
        if (preview !== cell) {
          setPreview(cell)
          return
        }
        setSubmitting(true)
        submitGameAction(gameId, { type: 'place', cell })
          .then((data) => {
            setGame(data.game)
            setSelected(null)
            setPreview(null)
          })
          .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось поставить фигуру'))
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
            submitGameAction(gameId, { type: 'move', from: move.from, to: move.to })
              .then((data) => {
                setGame(data.game)
                setSelected(null)
                if (data.duel) {
                  setSeenActionId(data.latestAction.id)
                  setDuel({ ...data.duel, by: state.turn })
                }
              })
              .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось сделать ход'))
              .finally(() => setSubmitting(false))
            return
          }
        }
        if (piece && piece.color === state.turn && !piece.moved) setSelected(cell)
        else setSelected(null)
      }
    },
    [gameId, isHumanTurn, placementTargets, preview, selected, selectedMoves, state, submitting],
  )

  const onCellEnter = useCallback(
    (cell: number) => {
      if (state?.phase === 'draft' && isHumanTurn && placementTargets.includes(cell)) {
        setPreview(cell)
      }
    },
    [isHumanTurn, placementTargets, state?.phase],
  )

  return {
    loading,
    error,
    game,
    state,
    player,
    players,
    selected,
    legalTargets,
    selectedMoves,
    placementTargets,
    previewCell: state?.phase === 'draft' && isHumanTurn && preview != null ? preview : null,
    pendingDef,
    duel,
    isHumanTurn,
    thinking: submitting || Boolean(state && player && state.phase !== 'over' && state.turn !== player.color),
    dismissDuel: () => setDuel(null),
    onCell,
    onCellEnter,
    clearPreview: () => setPreview(null),
    refresh,
  }
}
