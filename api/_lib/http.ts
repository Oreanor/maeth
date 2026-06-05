import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export interface AuthContext {
  db: SupabaseClient
  user: User
}

export function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body)
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
    json(res, 500, { error: 'Supabase environment variables are not configured' })
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
  await ensureProfile(db, data.user)
  return { db, user: data.user }
}

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization
  if (!header) return null
  const value = Array.isArray(header) ? header[0] : header
  const [scheme, token] = value.split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : null
}

async function ensureProfile(db: SupabaseClient, user: User) {
  const meta = user.user_metadata
  const displayName =
    typeof meta.full_name === 'string'
      ? meta.full_name
      : typeof meta.name === 'string'
        ? meta.name
        : user.email ?? 'Google User'

  await db.from('profiles').upsert({
    id: user.id,
    display_name: displayName,
    avatar_url: typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
    provider: 'google',
    updated_at: new Date().toISOString(),
  })
}
