import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, method, requireAuth } from '../_lib/http'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const id = routeParam(req.query.id)
  if (!id) {
    json(res, 400, { error: 'Missing game id' })
    return
  }

  const { data: membership, error: membershipError } = await auth.db
    .from('game_players')
    .select('color')
    .eq('game_id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (membershipError) {
    json(res, 500, { error: membershipError.message })
    return
  }

  if (!membership) {
    json(res, 404, { error: 'Game not found' })
    return
  }

  const { data: game, error: gameError } = await auth.db
    .from('games')
    .select('id, status, state, created_at, updated_at')
    .eq('id', id)
    .single()

  if (gameError) {
    json(res, 500, { error: gameError.message })
    return
  }

  const { data: players, error: playersError } = await auth.db
    .from('game_players')
    .select('user_id, color, profiles(display_name, avatar_url)')
    .eq('game_id', id)
    .order('joined_at', { ascending: true })

  if (playersError) {
    json(res, 500, { error: playersError.message })
    return
  }

  const { data: action, error: actionError } = await auth.db
    .from('game_actions')
    .select('id, user_id, action_type, payload, created_at')
    .eq('game_id', id)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (actionError) {
    json(res, 500, { error: actionError.message })
    return
  }

  json(res, 200, { game, player: membership, players: players ?? [], latestAction: action })
}

function routeParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
