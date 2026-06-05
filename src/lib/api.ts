import type { Color, GameState } from '@/game/types'
import type { Friend } from '@/auth/types'
import type { DuelRoll } from '@/game/engine'
import { supabase } from './supabase'

export interface ApiGame {
  id: string
  status: 'waiting' | 'active' | 'over' | 'cancelled'
  state: GameState
  created_at?: string
  updated_at?: string
}

export interface ApiPlayer {
  color: Color
}

export interface ApiGameListItem {
  game: ApiGame
  player: ApiPlayer
  opponentName: string
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

export interface ApiLatestAction {
  id: number
  user_id: string
  action_type: 'place' | 'move'
  payload: {
    duel?: DuelRoll | null
    by?: Color
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

export async function createGame(options: { invitedUserId?: string } = {}): Promise<{
  game: ApiGame
  player: ApiPlayer
  invite: { id: string }
}> {
  return apiFetch('/api/games', {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export async function getGame(id: string): Promise<{
  game: ApiGame
  player: ApiPlayer
  players: unknown[]
  latestAction: ApiLatestAction | null
}> {
  return apiFetch(`/api/games/${id}`)
}

export async function joinGame(id: string): Promise<{ player: ApiPlayer }> {
  return apiFetch(`/api/games/${id}/join`, { method: 'POST' })
}

export async function createInvite(
  id: string,
  options: { invitedUserId?: string } = {},
): Promise<{ invite: { id: string; status: string } }> {
  return apiFetch(`/api/games/${id}/invite`, {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export async function submitGameAction(
  id: string,
  action: GameAction,
): Promise<{ game: ApiGame; duel: DuelRoll | null; latestAction: ApiLatestAction }> {
  return apiFetch(`/api/games/${id}/actions`, {
    method: 'POST',
    body: JSON.stringify(action),
  })
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Content-Type', 'application/json')

  const response = await fetch(path, { ...init, headers })
  const data = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(apiErrorMessage(data) ?? `Request failed: ${response.status}`)
  }
  return data as T
}

function apiErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('error' in data)) return null
  const error = data.error
  return typeof error === 'string' ? error : null
}

async function accessToken(): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('Not authenticated')
  return token
}
