import type { VercelRequest, VercelResponse } from '@vercel/node'
import { beginDraft, firstTurnFromRoll } from '../../../src/game/engine.js'
import type { Color, GameState } from '../../../src/game/types.js'
import { json, method, requireAuth, unwrap, unwrapOne, withApiError } from '../../_lib/http.js'
import { readJsonBody, routeParam } from '../../_lib/request.js'

type LotteryBody = { action: 'roll' } | { action: 'start' }

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['POST'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const id = routeParam(req.query.id)
  if (!id) {
    json(res, 400, { error: 'Missing game id' })
    return
  }

  const body = parseBody(req.body)
  if (!body) {
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
    await auth.db
      .from('games')
      .select('id, status, state, created_by, duels_enabled, updated_at')
      .eq('id', id)
      .single(),
  ) as {
    id: string
    status: string
    state: unknown
    created_by: string
    duels_enabled: boolean
    updated_at: string
  }

  if (game.status !== 'active') {
    json(res, 409, { error: 'Game is not active' })
    return
  }

  const state = game.state as GameState
  if (state.phase !== 'lottery' || !state.lottery) {
    json(res, 409, { error: 'Turn lottery is not in progress' })
    return
  }

  if (body.action === 'roll') {
    if (game.created_by !== auth.user.id) {
      json(res, 403, { error: 'Only the host can roll' })
      return
    }
    if (state.lottery.step !== 'await_roll') {
      json(res, 409, { error: 'Dice already rolled' })
      return
    }

    const { count, error: countError } = await auth.db
      .from('game_players')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', id)
    if (countError) throw new Error(countError.message)
    if ((count ?? 0) < 2) {
      json(res, 409, { error: 'Waiting for the second player' })
      return
    }

    const roll = 1 + Math.floor(Math.random() * 6)
    const firstTurn = firstTurnFromRoll(roll)
    const next: GameState = {
      ...state,
      lottery: { step: 'revealed', roll, firstTurn },
      turn: firstTurn,
    }

    const updatedAt = new Date().toISOString()
    const updated = (unwrap(
      await auth.db
        .from('games')
        .update({ state: next, updated_at: updatedAt })
        .eq('id', id)
        .eq('updated_at', game.updated_at)
        .select('id'),
    ) ?? []) as { id: string }[]
    if (updated.length === 0) {
      json(res, 409, { error: 'Lottery state changed; refresh and try again' })
      return
    }

    json(res, 200, {
      game: {
        id: game.id,
        status: 'active',
        state: next,
        duels_enabled: game.duels_enabled !== false,
        updated_at: updatedAt,
      },
    })
    return
  }

  if (state.lottery.step !== 'revealed' || !state.lottery.firstTurn) {
    json(res, 409, { error: 'Roll the dice first' })
    return
  }

  const color = membership.color as Color
  if (color !== state.lottery.firstTurn) {
    json(res, 403, { error: 'Only the first player can start' })
    return
  }

  const next = beginDraft(state.lottery.firstTurn)
  const updatedAt = new Date().toISOString()
  const updated = (unwrap(
    await auth.db
      .from('games')
      .update({ state: next, updated_at: updatedAt })
      .eq('id', id)
      .eq('updated_at', game.updated_at)
      .select('id'),
  ) ?? []) as { id: string }[]
  if (updated.length === 0) {
    json(res, 409, { error: 'Lottery state changed; refresh and try again' })
    return
  }

  json(res, 200, {
    game: {
      id: game.id,
      status: 'active',
      state: next,
      duels_enabled: game.duels_enabled !== false,
      updated_at: updatedAt,
    },
  })
}

function parseBody(body: unknown): LotteryBody | null {
  const record = readJsonBody(body)
  if (!record) return null
  if (record.action === 'roll') return { action: 'roll' }
  if (record.action === 'start') return { action: 'start' }
  return null
}

export default withApiError(handler)
