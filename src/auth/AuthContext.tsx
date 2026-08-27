import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppUser, AuthProvider } from './types'
import { supabase } from '@/lib/supabase'
import { apiMe } from '@/lib/api'
import type { User as SupabaseUser } from '@supabase/supabase-js'

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  /** True when the user is backed by a Supabase session (Google or anonymous
   *  guest) and can therefore use the networked API. */
  online: boolean
  /** Sign in with the given provider. Google uses Supabase OAuth; guest uses an
   *  anonymous Supabase session (or a local-only user when Supabase is absent). */
  login: (provider: AuthProvider) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'maeth.local-user'

function loadLocalUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AppUser) : null
  } catch {
    return null
  }
}

function storeLocalUser(user: AppUser | null) {
  if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  else localStorage.removeItem(STORAGE_KEY)
}

export function AuthProviderComponent({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  // On startup: prefer a Supabase session, then fall back to local dev users.
  useEffect(() => {
    if (!supabase) {
      setUser(loadLocalUser())
      setLoading(false)
      return
    }

    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      const player = playerOf(data.session?.user)
      setUser(player)
      if (player) void syncProfile()
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const player = playerOf(session?.user)
      setUser(player)
      if (player) void syncProfile()
      setLoading(false)
    })

    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (provider: AuthProvider) => {
    if (provider === 'google') {
      if (!supabase) {
        throw new Error('Supabase is not configured. Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      }
      setLoading(true)
      // A visitor who has been talking to the pieces is carrying the anonymous
      // session the board opened for them. Signing in on top of it is not a
      // plain sign-in as far as Supabase is concerned — it can take the OAuth
      // identity as one to link onto the anonymous account instead — so the
      // session goes first and Google is asked from a clean slate. Nothing is
      // lost with it: a guest has no games and no standing to carry over.
      const { data } = await supabase.auth.getSession()
      if (data.session?.user.is_anonymous) await supabase.auth.signOut()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })
      if (error) {
        setLoading(false)
        throw error
      }
      return
    }

    // Guest: an anonymous Supabase session gives a real id + token so guests can
    // play networked games (they're just kept out of the stats). Without
    // Supabase configured, fall back to a purely local user (bot-only).
    if (supabase) {
      setLoading(true)
      const { error } = await supabase.auth.signInAnonymously()
      if (error) {
        setLoading(false)
        throw error
      }
      return // onAuthStateChange sets the user
    }

    setLoading(true)
    const u: AppUser = { id: `guest-${Date.now()}`, name: 'Guest', provider: 'guest' }
    setUser(u)
    storeLocalUser(u)
    setLoading(false)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    storeLocalUser(null)
    void supabase?.auth.signOut()
  }, [])

  const online = Boolean(supabase) && !!user
  const value = useMemo(
    () => ({ user, loading, online, login, logout }),
    [user, loading, online, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

async function syncProfile() {
  try {
    await apiMe()
  } catch {
    // Auth still works offline; API screens will surface backend errors.
  }
}

/**
 * The player behind a session, if there is one.
 *
 * An anonymous session is plumbing rather than a player: the board opens one so
 * a guest's pieces can be asked to speak, and nothing in the interface should
 * read that as having signed in — the lobby has to go on offering the way in,
 * and the stats have to go on ignoring whoever has not taken it.
 */
function playerOf(user: SupabaseUser | undefined): AppUser | null {
  return user && !user.is_anonymous ? fromSupabaseUser(user) : null
}

function fromSupabaseUser(user: SupabaseUser): AppUser {
  const meta = user.user_metadata
  return {
    id: user.id,
    name:
      typeof meta.full_name === 'string'
        ? meta.full_name
        : typeof meta.name === 'string'
          ? meta.name
          : user.email ?? 'Google User',
    username: user.email,
    avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined,
    provider: 'google',
  }
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProviderComponent')
  return ctx
}
