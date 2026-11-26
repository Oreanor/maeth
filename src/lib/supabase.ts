import { GoTrueClient } from '@supabase/auth-js'

// The browser only ever talks to Supabase Auth — every table is read and
// written by our own API. So the page carries the auth client alone rather
// than all of supabase-js: the database, storage and realtime clients that came
// with it were ~110 KB of the initial bundle and never ran.
//
// Configured exactly as supabase-js configures it, storage key included, so a
// session saved by the old client is picked up by this one.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

function createAuth(url: string, key: string): GoTrueClient {
  const base = new URL(url.endsWith('/') ? url : `${url}/`)
  return new GoTrueClient({
    url: new URL('auth/v1', base).href,
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  })
}

export const supabase = isSupabaseConfigured
  ? { auth: createAuth(supabaseUrl!, supabaseAnonKey!) }
  : null
