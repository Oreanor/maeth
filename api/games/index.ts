import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createInitialState } from '../../src/game/engine.js'
import { json, method, requireAuth, unwrap, unwrapOne, validateInvitedUser, withApiError } from '../_lib/http.js'
import { parseInvitedUserId } from '../_lib/request.js'

interface GameRow {
  id: string
  status: string
  state: unknown
  created_at: string
  updated_at: string
  created_by?: string
}

interface PlayerRow {
  game_id: string
  user_id: string
  color: string
}

interface InviteRow {
  id: string
  game_id: string
  created_by: string
}

interface ProfileRow {
  id: string
  display_name: string
  avatar_url: string | null
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET', 'POST'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  if (req.method === 'GET') {
    await listGames(auth.db, auth.user.id, res)
    return
  }

  await createGame(auth.db, auth.user.id, req.body, res)
}

async function listGames(db: SupabaseClient, userId: string, res: VercelResponse) {
  const playerRows = (unwrap(
    await db
      .from('game_players')
      .select('game_id, user_id, color')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false }),
  ) ?? []) as PlayerRow[]

  const inviteRows = (unwrap(
    await db
      .from('game_invites')
      .select('id, game_id, created_by')
      .eq('invited_user_id', userId)
      .eq('status', 'open'),
  ) ?? []) as InviteRow[]

  const gameIds = unique([...playerRows.map((p) => p.game_id), ...inviteRows.map((i) => i.game_id)])
  const gameRows = await loadGames(db, gameIds)
  const profileIds = unique([
    ...gameRows.flatMap((g) => (g.created_by ? [g.created_by] : [])),
    ...playerRows.map((p) => p.user_id),
    ...inviteRows.map((i) => i.created_by),
  ])
  const profiles = await loadProfiles(db, profileIds)
  const allPlayers = await loadPlayers(db, gameRows.map((g) => g.id))

  const games = playerRows.flatMap((membership) => {
    const game = gameRows.find((row) => row.id === membership.game_id)
    if (!game) return []
    const opponent = allPlayers.find((p) => p.game_id === game.id && p.user_id !== userId)
    const opponentProfile = opponent ? profiles.get(opponent.user_id) : null
    return [
      {
        game: publicGame(game),
        player: { color: membership.color },
        opponentName: opponentProfile?.display_name ?? 'Друг',
      },
    ]
  })

  const incomingInvites = inviteRows.flatMap((invite) => {
    const game = gameRows.find((row) => row.id === invite.game_id)
    if (!game || game.status !== 'waiting') return []
    const creator = profiles.get(invite.created_by)
    return [
      {
        invite: { id: invite.id },
        game: publicGame(game),
        from: {
          id: invite.created_by,
          name: creator?.display_name ?? 'Игрок',
          avatarUrl: creator?.avatar_url ?? null,
        },
      },
    ]
  })

  json(res, 200, { games, invites: incomingInvites })
}

async function createGame(db: SupabaseClient, userId: string, body: unknown, res: VercelResponse) {
  const invitedUserId = parseInvitedUserId(body)
  const validation = await validateInvitedUser(db, invitedUserId, userId)
  if (!validation.ok) {
    json(res, validation.status, { error: validation.error })
    return
  }

  const game = unwrapOne(
    await db
      .from('games')
      .insert({ created_by: userId, status: 'waiting', state: createInitialState() })
      .select('id, status, state, created_at, updated_at')
      .single(),
  ) as GameRow

  unwrap(await db.from('game_players').insert({ game_id: game.id, user_id: userId, color: 'white' }))

  const invite = unwrap(
    await db
      .from('game_invites')
      .insert({ game_id: game.id, created_by: userId, invited_user_id: invitedUserId ?? null })
      .select('id, status')
      .single(),
  )

  json(res, 201, { game, player: { color: 'white' }, invite })
}

async function loadGames(db: SupabaseClient, ids: string[]): Promise<GameRow[]> {
  if (ids.length === 0) return []
  return (unwrap(
    await db.from('games').select('id, status, state, created_at, updated_at, created_by').in('id', ids),
  ) ?? []) as GameRow[]
}

async function loadPlayers(db: SupabaseClient, gameIds: string[]): Promise<PlayerRow[]> {
  if (gameIds.length === 0) return []
  return (unwrap(
    await db.from('game_players').select('game_id, user_id, color').in('game_id', gameIds),
  ) ?? []) as PlayerRow[]
}

async function loadProfiles(db: SupabaseClient, ids: string[]): Promise<Map<string, ProfileRow>> {
  if (ids.length === 0) return new Map()
  const rows = (unwrap(
    await db.from('profiles').select('id, display_name, avatar_url').in('id', ids),
  ) ?? []) as ProfileRow[]
  return new Map(rows.map((profile) => [profile.id, profile]))
}

function publicGame(game: GameRow) {
  return {
    id: game.id,
    status: game.status,
    state: game.state,
    created_at: game.created_at,
    updated_at: game.updated_at,
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export default withApiError(handler)
