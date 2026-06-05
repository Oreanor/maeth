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
  /** Sign in with the given provider. Google uses Supabase; guest is local-only. */
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
      const sessionUser = data.session?.user
      setUser(sessionUser ? fromSupabaseUser(sessionUser) : loadLocalUser())
      if (sessionUser) void syncProfile()
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? fromSupabaseUser(session.user) : loadLocalUser())
      if (session?.user) void syncProfile()
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

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
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
