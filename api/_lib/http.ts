import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Who is asking, as far as the API needs to know: read from the verified
 *  access token's claims, not fetched from Supabase Auth on every request. */
export interface ApiUser {
  id: string
  email?: string
  is_anonymous: boolean
  user_metadata: Record<string, unknown>
}

export interface AuthContext {
  db: SupabaseClient
  user: ApiUser
}

// One pair of clients for the life of the process. On Vercel every request
// built both afresh; a long-running server keeps them, and with them the auth
// client's cache of the project's signing keys.
let clients: { auth: SupabaseClient; db: SupabaseClient } | null = null

function supabaseClients(url: string, anonKey: string, serviceKey: string) {
  clients ??= {
    auth: createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    db: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  }
  return clients
}

/**
 * The user behind a bearer token, or null if it is not a live session of ours.
 *
 * The project signs its access tokens with an asymmetric key (ES256), so
 * `getClaims` checks the signature and expiry here against the published key
 * set — cached after the first request — instead of asking Supabase Auth about
 * every token. That was a full round trip (~330 ms from the home server) in
 * front of every poll. The trade is the usual one for JWTs: a session signed
 * out elsewhere still works here until its token expires, within the hour.
 * A project still on a shared HS256 secret falls back to asking, as before.
 */
async function verifiedUser(auth: SupabaseClient, token: string): Promise<ApiUser | null> {
  const { data, error } = await auth.auth.getClaims(token)
  const claims = data?.claims
  if (error || !claims || typeof claims.sub !== 'string' || claims.role !== 'authenticated') return null
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' && claims.email ? claims.email : undefined,
    is_anonymous: claims.is_anonymous === true,
    user_metadata: (claims.user_metadata as Record<string, unknown> | undefined) ?? {},
  }
}

export function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body)
}

/**
 * Unwrap a Supabase result, throwing on error so `withApiError` turns it into a
 * clean 500 JSON response. Use only where an error should map to 500.
 */
export function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

/**
 * Like `unwrap`, but for `.single()` queries where exactly one row is expected:
 * throws (→ 500) on error or when the row is missing, returning a non-null value.
 */
export function unwrapOne<T>(result: { data: T | null; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message)
  if (result.data == null) throw new Error('Expected a row but none was returned')
  return result.data as NonNullable<T>
}

export type ValidationResult = { ok: true } | { ok: false; status: number; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Basic format check for an email invite to a friend who may not exist yet. */
export function validateInvitedEmail(email: string | undefined, selfEmail: string | undefined): ValidationResult {
  if (!email) return { ok: true }
  if (!EMAIL_RE.test(email)) return { ok: false, status: 400, error: 'Invalid email address' }
  if (selfEmail && email === selfEmail.toLowerCase()) {
    return { ok: false, status: 400, error: 'Cannot invite yourself' }
  }
  return { ok: true }
}

/** Shared validation for an optional invited player on game/invite creation. */
export async function validateInvitedUser(
  db: SupabaseClient,
  invitedUserId: string | undefined,
  selfId: string,
): Promise<ValidationResult> {
  if (!invitedUserId) return { ok: true }
  if (invitedUserId === selfId) return { ok: false, status: 400, error: 'Cannot invite yourself' }

  const { data, error } = await db
    .from('profiles')
    .select('id, provider')
    .eq('id', invitedUserId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.provider !== 'google') {
    return { ok: false, status: 400, error: 'Invited player not found' }
  }
  return { ok: true }
}

export function withApiError(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      await handler(req, res)
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : 'Unexpected API error',
      })
    }
  }
}

export function method(req: VercelRequest, res: VercelResponse, allowed: string[]): boolean {
  if (req.method && allowed.includes(req.method)) return true
  res.setHeader('Allow', allowed.join(', '))
  json(res, 405, { error: 'Method not allowed' })
  return false
}

export async function requireAuth(req: VercelRequest, res: VercelResponse): Promise<AuthContext | null> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceKey) {
    json(res, 500, {
      error: 'Supabase environment variables are not configured',
      missing: [
        !url ? 'SUPABASE_URL or VITE_SUPABASE_URL' : null,
        !anonKey ? 'SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY' : null,
        !serviceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
      ].filter(Boolean),
    })
    return null
  }

  const token = bearerToken(req)
  if (!token) {
    json(res, 401, { error: 'Missing bearer token' })
    return null
  }

  const { auth, db } = supabaseClients(url, anonKey, serviceKey)
  const user = await verifiedUser(auth, token)
  if (!user) {
    json(res, 401, { error: 'Invalid bearer token' })
    return null
  }

  const profileError = await ensureProfile(db, user)
  if (profileError) {
    json(res, 500, { error: profileError })
    return null
  }
  return { db, user }
}

/**
 * How often a user's profile is written back. Every request used to upsert it
 * — a database round trip in front of each 0.7 s poll — when all it carries
 * between sign-ins is the `last_seen` heartbeat, and the presence it feeds
 * only looks 30 s back. A few seconds of staleness there is invisible.
 */
const PROFILE_REFRESH_MS = 15_000
const profileWrittenAt = new Map<string, number>()

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization
  if (!header) return null
  const value = Array.isArray(header) ? header[0] : header
  const [scheme, token] = value.split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : null
}

async function ensureProfile(db: SupabaseClient, user: ApiUser): Promise<string | null> {
  // Only once it has been written successfully in this process, so the first
  // request of a new player still creates the row the game tables point at.
  const written = profileWrittenAt.get(user.id)
  if (written !== undefined && Date.now() - written < PROFILE_REFRESH_MS) return null

  // Anonymous (guest) sessions get a minimal profile marked `guest`, which keeps
  // them out of the leaderboard while still naming them in games.
  const isGuest = user.is_anonymous === true
  const meta = user.user_metadata
  const displayName = isGuest
    ? 'Guest'
    : typeof meta.full_name === 'string'
      ? meta.full_name
      : typeof meta.name === 'string'
        ? meta.name
        : user.email ?? 'Google User'

  const now = new Date().toISOString()
  const { error } = await db.from('profiles').upsert({
    id: user.id,
    display_name: displayName,
    avatar_url: !isGuest && typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
    provider: isGuest ? 'guest' : 'google',
    updated_at: now,
    // Activity heartbeat: every authenticated request marks the user online.
    last_seen: now,
  })

  if (error) return error.message
  if (profileWrittenAt.size > 10_000) profileWrittenAt.clear()
  profileWrittenAt.set(user.id, Date.now())
  return null
}
