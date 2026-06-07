import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createLotteryState } from '../../../src/game/engine.js'
import { json, method, requireAuth, unwrap, unwrapOne, withApiError } from '../../_lib/http.js'
import { routeParam } from '../../_lib/request.js'

interface PlayerRow {
  user_id: string
  color: string
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['POST'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const id = routeParam(req.query.id)
  if (!id) {
    json(res, 400, { error: 'Missing game id' })
    return
  }

  const db = auth.db

  const membership = unwrap(
    await db.from('game_players').select('color').eq('game_id', id).eq('user_id', auth.user.id).maybeSingle(),
  )
  if (!membership) {
    json(res, 404, { error: 'Game not found' })
    return
  }

  const game = unwrapOne(
    await db
      .from('games')
      .select('id, status, created_by, rematch_id, root_id, duels_enabled')
      .eq('id', id)
      .single(),
  ) as {
    id: string
    status: string
    created_by: string
    rematch_id: string | null
    root_id: string | null
    duels_enabled: boolean
  }

  if (game.status !== 'over') {
    json(res, 409, { error: 'Game is not finished' })
    return
  }

  // Idempotent: whoever clicks first creates the rematch; everyone else (and
  // repeated clicks) gets the same follow-up game.
  if (game.rematch_id) {
    json(res, 200, { gameId: game.rematch_id })
    return
  }

  const players = (unwrap(
    await db.from('game_players').select('user_id, color').eq('game_id', id),
  ) ?? []) as PlayerRow[]

  // Both players are already known, so the rematch starts active right away.
  // Inherit the room root (the original game) so the whole chain groups together.
  const fresh = unwrapOne(
    await db
      .from('games')
      .insert({
        created_by: game.created_by,
        status: 'waiting',
        state: createLotteryState(),
        root_id: game.root_id ?? game.id,
        duels_enabled: game.duels_enabled !== false,
      })
      .select('id')
      .single(),
  ) as { id: string }

  unwrap(
    await db
      .from('game_players')
      .insert(players.map((p) => ({ game_id: fresh.id, user_id: p.user_id, color: p.color }))),
  )

  // Link the old game to the new one, but only if nobody beat us to it.
  const linked = unwrap(
    await db.from('games').update({ rematch_id: fresh.id }).eq('id', id).is('rematch_id', null).select('id'),
  ) as { id: string }[]

  if (linked.length === 0) {
    // Lost the race: drop our extra game and use the winner's.
    unwrap(await db.from('games').delete().eq('id', fresh.id))
    const current = unwrapOne(
      await db.from('games').select('rematch_id').eq('id', id).single(),
    ) as { rematch_id: string | null }
    json(res, 200, { gameId: current.rematch_id })
    return
  }

  json(res, 201, { gameId: fresh.id })
}

export default withApiError(handler)
