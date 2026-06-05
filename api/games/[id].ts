import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, method, requireAuth, unwrap, withApiError } from '../_lib/http.js'
import { routeParam } from '../_lib/request.js'

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET', 'DELETE'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const id = routeParam(req.query.id)
  if (!id) {
    json(res, 400, { error: 'Missing game id' })
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

  if (req.method === 'DELETE') {
    // Cascades remove players, invites, and actions for this game.
    unwrap(await auth.db.from('games').delete().eq('id', id))
    json(res, 200, { ok: true })
    return
  }

  const game = unwrap(
    await auth.db.from('games').select('id, status, state, created_at, updated_at').eq('id', id).single(),
  )

  const players = unwrap(
    await auth.db
      .from('game_players')
      .select('user_id, color, profiles(display_name, avatar_url)')
      .eq('game_id', id)
      .order('joined_at', { ascending: true }),
  )

  const latestAction = unwrap(
    await auth.db
      .from('game_actions')
      .select('id, user_id, action_type, payload, created_at')
      .eq('game_id', id)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )

  json(res, 200, { game, player: membership, players: players ?? [], latestAction })
}

export default withApiError(handler)
