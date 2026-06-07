import type { Color, GameState } from '@/game/types'
import type { Friend } from '@/auth/types'
import type { DuelRoll } from '@/game/engine'
import type { PieceKind } from '@/game/pieces'
import { supabase } from './supabase'

export interface ApiGame {
  id: string
  status: 'waiting' | 'active' | 'over' | 'cancelled'
  state: GameState
  /** When false, contested captures are clean takes (no dice). */
  duels_enabled?: boolean
  created_at?: string
  updated_at?: string
  /** Host who created the room — rolls for first turn. */
  created_by?: string
  /** Set once a rematch has been started — points to the follow-up game. */
  rematch_id?: string | null
}

export interface ApiPlayer {
  color: Color
}

export type Presence = 'in-game' | 'online' | 'offline'

export interface ApiGamePlayer {
  user_id: string
  color: Color
  /** Server-computed: in this game / online elsewhere / offline. */
  presence?: Presence
  profiles?: {
    display_name?: string
    avatar_url?: string | null
  } | null
}

export interface ApiGameListItem {
  game: ApiGame
  player: ApiPlayer
  /** Joined opponent's name, or the invited friend/email; null for an open game with no one yet. */
  opponentName: string | null
}

export interface ApiIncomingInvite {
  invite: { id: string }
  game: ApiGame
  from: {
    id: string
    name: string
    avatarUrl: string | null
  }
}

export interface ApiGameAction {
  id: number
  user_id: string
  action_type: 'place' | 'move'
  payload: {
    duel?: DuelRoll | null
    by?: Color
    cell?: number
    kind?: PieceKind
    from?: number
    to?: number
    [key: string]: unknown
  }
  created_at: string
}

export type GameAction =
  | { type: 'place'; cell: number }
  | { type: 'move'; from: number; to: number }

export async function apiMe<T = unknown>(): Promise<T> {
  return apiFetch<T>('/api/me')
}

export async function listGames(): Promise<{ games: ApiGameListItem[]; invites: ApiIncomingInvite[] }> {
  return apiFetch('/api/games')
}

export async function listFriends(): Promise<{ friends: Friend[] }> {
  return apiFetch('/api/friends')
}

export interface PlayerStats {
  id: string
  name: string
  avatarUrl: string | null
  wins: number
  losses: number
  draws: number
}

export async function getStats(): Promise<{ players: PlayerStats[] }> {
  return apiFetch('/api/stats')
}

export async function createGame(
  options: { invitedUserId?: string; invitedEmail?: string; duels?: boolean } = {},
): Promise<{
  game: ApiGame
  player: ApiPlayer
  invite: { id: string }
}> {
  return apiFetch('/api/games', {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

/** Running head-to-head tally between the two players, by colour. */
export interface SeriesScore {
  white: number
  black: number
  draws: number
}

export async function getGame(id: string): Promise<{
  game: ApiGame
  player: ApiPlayer
  players: ApiGamePlayer[]
  actions: ApiGameAction[]
  latestAction: ApiGameAction | null
  series: SeriesScore
}> {
  return apiFetch(`/api/games/${id}`)
}

export async function joinGame(id: string): Promise<{ player: ApiPlayer }> {
  return apiFetch(`/api/games/${id}/join`, { method: 'POST' })
}

/** Start (or fetch the existing) rematch of a finished game — a brand-new game
 *  with the same two players, so each match counts on its own in the stats. */
export async function rematchGame(id: string): Promise<{ gameId: string }> {
  return apiFetch(`/api/games/${id}/rematch`, { method: 'POST' })
}

export async function deleteGame(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/games/${id}`, { method: 'DELETE' })
}

export async function createInvite(
  id: string,
  options: { invitedUserId?: string; invitedEmail?: string } = {},
): Promise<{ invite: { id: string; status: string } }> {
  return apiFetch(`/api/games/${id}/invite`, {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export async function submitGameAction(
  id: string,
  action: GameAction,
): Promise<{ game: ApiGame; duel: DuelRoll | null; latestAction: ApiGameAction }> {
  return apiFetch(`/api/games/${id}/actions`, {
    method: 'POST',
    body: JSON.stringify(action),
  })
}

export async function submitLottery(
  id: string,
  action: 'roll' | 'start',
): Promise<{ game: ApiGame }> {
  return apiFetch(`/api/games/${id}/lottery`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Content-Type', 'application/json')

  const response = await fetch(path, { ...init, headers })
  const data = await parseApiResponse(response)
  if (!response.ok) {
    throw new Error(apiErrorMessage(data) ?? `Request failed: ${response.status}`)
  }
  return data as T
}

async function parseApiResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    const preview = text.slice(0, 80).replace(/\s+/g, ' ')
    throw new Error(
      `API returned non-JSON response (${response.status}). ` +
        `Run the app through Vercel dev or deploy the API functions. Response starts with: ${preview}`,
    )
  }
}

function apiErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null

  if ('message' in data && typeof data.message === 'string') {
    return data.message
  }

  if (!('error' in data)) {
    try {
      return JSON.stringify(data)
    } catch {
      return null
    }
  }

  const error = data.error
  if (typeof error !== 'string') return null

  const missing =
    'missing' in data && Array.isArray(data.missing)
      ? data.missing.filter((item): item is string => typeof item === 'string')
      : []

  return missing.length > 0 ? `${error}: ${missing.join(', ')}` : error
}

async function accessToken(): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('Not authenticated')
  return token
}
