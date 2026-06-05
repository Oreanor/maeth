import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createInitialState } from '../../src/game/engine'
import { json, method, requireAuth, withApiError } from '../_lib/http'

interface CreateGameBody {
  invitedUserId?: string
}

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
    const { data: memberships, error: membershipError } = await auth.db
      .from('game_players')
      .select('game_id, user_id, color')
      .eq('user_id', auth.user.id)
      .order('joined_at', { ascending: false })

    if (membershipError) {
      json(res, 500, { error: membershipError.message })
      return
    }

    const { data: invites, error: inviteListError } = await auth.db
      .from('game_invites')
      .select('id, game_id, created_by')
      .eq('invited_user_id', auth.user.id)
      .eq('status', 'open')

    if (inviteListError) {
      json(res, 500, { error: inviteListError.message })
      return
    }

    const playerRows = (memberships ?? []) as PlayerRow[]
    const inviteRows = (invites ?? []) as InviteRow[]
    const gameIds = unique([...playerRows.map((p) => p.game_id), ...inviteRows.map((i) => i.game_id)])
    let gameRows: GameRow[]
    let profiles: Map<string, ProfileRow>
    let allPlayers: PlayerRow[]
    try {
      gameRows = await loadGames(auth.db, gameIds)
      const profileIds = unique([
        ...gameRows.flatMap((g) => (g.created_by ? [g.created_by] : [])),
        ...playerRows.map((p) => p.user_id),
        ...inviteRows.map((i) => i.created_by),
      ])
      profiles = await loadProfiles(auth.db, profileIds)
      allPlayers = await loadPlayers(auth.db, gameRows.map((g) => g.id))
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : 'Failed to load games' })
      return
    }

    const games = playerRows
      .map((membership) => {
        const game = gameRows.find((row) => row.id === membership.game_id)
        if (!game) return null
        const opponent = allPlayers.find((p) => p.game_id === game.id && p.user_id !== auth.user.id)
        const opponentProfile = opponent ? profiles.get(opponent.user_id) : null
        return {
          game: withoutCreatedBy(game),
          player: { color: membership.color },
          opponentName: opponentProfile?.display_name ?? 'Друг',
        }
      })
      .filter(Boolean)

    const incomingInvites = inviteRows
      .map((invite) => {
        const game = gameRows.find((row) => row.id === invite.game_id)
        const creator = profiles.get(invite.created_by)
        if (!game || game.status !== 'waiting') return null
        return {
          invite: { id: invite.id },
          game: withoutCreatedBy(game),
          from: {
            id: invite.created_by,
            name: creator?.display_name ?? 'Игрок',
            avatarUrl: creator?.avatar_url ?? null,
          },
        }
      })
      .filter(Boolean)

    json(res, 200, { games, invites: incomingInvites })
    return
  }

  const body = parseBody(req.body)
  if (body?.invitedUserId === auth.user.id) {
    json(res, 400, { error: 'Cannot invite yourself' })
    return
  }

  if (body?.invitedUserId) {
    const { data: invited, error: invitedError } = await auth.db
      .from('profiles')
      .select('id')
      .eq('id', body.invitedUserId)
      .maybeSingle()

    if (invitedError) {
      json(res, 500, { error: invitedError.message })
      return
    }

    if (!invited) {
      json(res, 400, { error: 'Invited player not found' })
      return
    }
  }

  const state = createInitialState()
  const { data: game, error: gameError } = await auth.db
    .from('games')
    .insert({
      created_by: auth.user.id,
      status: 'waiting',
      state,
    })
    .select('id, status, state, created_at, updated_at')
    .single()

  if (gameError) {
    json(res, 500, { error: gameError.message })
    return
  }

  const { error: playerError } = await auth.db.from('game_players').insert({
    game_id: game.id,
    user_id: auth.user.id,
    color: 'white',
  })

  if (playerError) {
    json(res, 500, { error: playerError.message })
    return
  }

  const { data: invite, error: inviteError } = await auth.db
    .from('game_invites')
    .insert({
      game_id: game.id,
      created_by: auth.user.id,
      invited_user_id: body?.invitedUserId ?? null,
    })
    .select('id, status')
    .single()

  if (inviteError) {
    json(res, 500, { error: inviteError.message })
    return
  }

  json(res, 201, { game, player: { color: 'white' }, invite })
}

function parseBody(body: unknown): CreateGameBody | null {
  const value = typeof body === 'string' ? safeJson(body) : body
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return {
    invitedUserId: typeof record.invitedUserId === 'string' ? record.invitedUserId : undefined,
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

async function loadGames(db: SupabaseClient, ids: string[]): Promise<GameRow[]> {
  if (ids.length === 0) return []
  const { data, error } = await db
    .from('games')
    .select('id, status, state, created_at, updated_at, created_by')
    .in('id', ids)
  if (error) throw error
  return (data ?? []) as GameRow[]
}

async function loadPlayers(db: SupabaseClient, gameIds: string[]): Promise<PlayerRow[]> {
  if (gameIds.length === 0) return []
  const { data, error } = await db
    .from('game_players')
    .select('game_id, user_id, color')
    .in('game_id', gameIds)
  if (error) throw error
  return (data ?? []) as PlayerRow[]
}

async function loadProfiles(db: SupabaseClient, ids: string[]): Promise<Map<string, ProfileRow>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await db
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', ids)
  if (error) throw error
  return new Map(((data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]))
}

function withoutCreatedBy(game: GameRow) {
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
