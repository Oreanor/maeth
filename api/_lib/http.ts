import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export interface AuthContext {
  db: SupabaseClient
  user: User
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

  const auth = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data, error } = await auth.auth.getUser(token)
  if (error || !data.user) {
    json(res, 401, { error: 'Invalid bearer token' })
    return null
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const profileError = await ensureProfile(db, data.user)
  if (profileError) {
    json(res, 500, { error: profileError })
    return null
  }
  return { db, user: data.user }
}

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization
  if (!header) return null
  const value = Array.isArray(header) ? header[0] : header
  const [scheme, token] = value.split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : null
}

async function ensureProfile(db: SupabaseClient, user: User): Promise<string | null> {
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

  return error?.message ?? null
}
