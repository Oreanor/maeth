import type { VercelRequest, VercelResponse } from '@vercel/node'
import { legalMovesFrom, placePiece, placementCells, resolveMove } from '../../../src/game/engine.js'
import type { Color, GameState } from '../../../src/game/types.js'
import { json, method, requireAuth, unwrap, unwrapOne, withApiError } from '../../_lib/http.js'
import { readJsonBody, routeParam } from '../../_lib/request.js'

type ActionBody =
  | { type: 'place'; cell: number }
  | { type: 'move'; from: number; to: number }

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['POST'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const id = routeParam(req.query.id)
  if (!id) {
    json(res, 400, { error: 'Missing game id' })
    return
  }

  const action = parseAction(req.body)
  if (!action) {
    json(res, 400, { error: 'Invalid action body' })
    return
  }

  const membership = unwrap(
    await auth.db
      .from('game_players')
      .select('color')
      .eq('game_id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle(),
  )

  if (!membership) {
    json(res, 404, { error: 'Game not found' })
    return
  }

  const game = unwrapOne(
    await auth.db.from('games').select('id, status, state').eq('id', id).single(),
  ) as { id: string; status: string; state: unknown }

  if (game.status !== 'active') {
    json(res, 409, { error: 'Game is not active' })
    return
  }

  const color = membership.color as Color
  const state = game.state as GameState
  if (state.turn !== color || state.phase === 'over') {
    json(res, 409, { error: 'It is not your turn' })
    return
  }

  const result = applyAction(state, action)
  if (!result) {
    json(res, 400, { error: 'Illegal action' })
    return
  }

  const nextStatus = result.state.phase === 'over' ? 'over' : 'active'
  unwrap(
    await auth.db
      .from('games')
      .update({ state: result.state, status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', id),
  )

  const savedAction = unwrap(
    await auth.db
      .from('game_actions')
      .insert({
        game_id: id,
        user_id: auth.user.id,
        action_type: action.type,
        payload: { ...action, duel: result.duel, by: color },
        resulting_state: result.state,
      })
      .select('id, user_id, action_type, payload, created_at')
      .single(),
  )

  json(res, 200, { game: { id, status: nextStatus, state: result.state }, duel: result.duel, latestAction: savedAction })
}

function applyAction(state: GameState, action: ActionBody): { state: GameState; duel: unknown } | null {
  if (action.type === 'place') {
    if (state.phase !== 'draft') return null
    if (!Number.isInteger(action.cell)) return null
    if (!placementCells(state).includes(action.cell)) return null
    return { state: placePiece(state, action.cell), duel: null }
  }

  if (state.phase !== 'play') return null
  if (!Number.isInteger(action.from) || !Number.isInteger(action.to)) return null
  const move = legalMovesFrom(state, action.from).find((m) => m.to === action.to)
  if (!move) return null
  const { next, duel } = resolveMove(state, move)
  return { state: next, duel }
}

function parseAction(body: unknown): ActionBody | null {
  const record = readJsonBody(body)
  if (!record) return null
  if (record.type === 'place' && typeof record.cell === 'number') {
    return { type: 'place', cell: record.cell }
  }
  if (record.type === 'move' && typeof record.from === 'number' && typeof record.to === 'number') {
    return { type: 'move', from: record.from, to: record.to }
  }
  return null
}

export default withApiError(handler)
