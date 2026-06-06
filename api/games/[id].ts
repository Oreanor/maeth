import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
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
      .select('id, status, state, duels_enabled, created_at, updated_at, rematch_id, root_id')
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

  const actions =
    unwrap(
      await auth.db
        .from('game_actions')
        .select('id, user_id, action_type, payload, created_at')
        .eq('game_id', id)
        .order('id', { ascending: true }),
    ) ?? []

  const latestAction = actions.length > 0 ? actions[actions.length - 1] : null

  // Score for this room only — the chain of rematches sharing a root game.
  const roomKey = (game as { root_id?: string | null } | null)?.root_id ?? id
  const series = await roomSeries(auth.db, roomKey)

  json(res, 200, { game, player: membership, players: playersWithPresence, actions, latestAction, series })
}

interface SeriesScore {
  white: number
  black: number
  draws: number
}

// Win tally for the room: every finished game in the rematch chain (the games
// sharing this root), read straight from each game's final state and keyed by
// colour. Colours stay fixed across rematches, so this reads as the running
// score for the room and lives and dies with the room's games (no separate
// per-opponent record is kept — the leaderboard handles all-time totals).
async function roomSeries(db: SupabaseClient, roomKey: string): Promise<SeriesScore> {
  const score: SeriesScore = { white: 0, black: 0, draws: 0 }
  const roomGames = (unwrap(
    await db.from('games').select('status, state').or(`id.eq.${roomKey},root_id.eq.${roomKey}`),
  ) ?? []) as { status: string; state: { status?: { kind: string; winner?: string } } | null }[]

  for (const g of roomGames) {
    if (g.status !== 'over') continue
    const result = g.state?.status
    if (!result) continue
    if (result.kind === 'draw') score.draws++
    else if (result.kind === 'win') {
      if (result.winner === 'white') score.white++
      else if (result.winner === 'black') score.black++
    }
  }
  return score
}

export default withApiError(handler)
