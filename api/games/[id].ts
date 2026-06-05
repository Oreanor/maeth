import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, method, requireAuth, unwrap, withApiError } from '../_lib/http.js'
import { routeParam } from '../_lib/request.js'

// A player is "in this game" if they fetched it within this window (polls run
// ~every 0.7s), or "online" if active anywhere within the larger window.
const IN_GAME_MS = 8000
const ONLINE_MS = 30000

type Presence = 'in-game' | 'online' | 'offline'

interface PlayerWithSeen {
  user_id: string
  color: string
  last_seen: string | null
  profiles: { display_name: string; avatar_url: string | null; last_seen: string | null } | null
}

function presenceOf(p: PlayerWithSeen, now: number): Presence {
  const game = p.last_seen ? Date.parse(p.last_seen) : 0
  if (game && now - game < IN_GAME_MS) return 'in-game'
  const site = p.profiles?.last_seen ? Date.parse(p.profiles.last_seen) : 0
  if (site && now - site < ONLINE_MS) return 'online'
  return 'offline'
}

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

  // Mark us as currently in this game (drives the opponent's presence dot).
  unwrap(
    await auth.db
      .from('game_players')
      .update({ last_seen: new Date().toISOString() })
      .eq('game_id', id)
      .eq('user_id', auth.user.id),
  )

  const game = unwrap(
    await auth.db
      .from('games')
      .select('id, status, state, created_at, updated_at, rematch_id')
      .eq('id', id)
      .single(),
  )

  const players = (unwrap(
    await auth.db
      .from('game_players')
      .select('user_id, color, last_seen, profiles(display_name, avatar_url, last_seen)')
      .eq('game_id', id)
      .order('joined_at', { ascending: true }),
  ) ?? []) as unknown as PlayerWithSeen[]

  const now = Date.now()
  const playersWithPresence = players.map((p) => ({
    user_id: p.user_id,
    color: p.color,
    profiles: p.profiles,
    presence: presenceOf(p, now),
  }))

  const latestAction = unwrap(
    await auth.db
      .from('game_actions')
      .select('id, user_id, action_type, payload, created_at')
      .eq('game_id', id)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )

  json(res, 200, { game, player: membership, players: playersWithPresence, latestAction })
}

export default withApiError(handler)
