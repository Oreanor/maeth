import { useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { isSupabaseConfigured } from '@/lib/supabase'
import './screens.css'

export function LoginScreen() {
  const { login, loading } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const loginWithGoogle = async () => {
    setError(null)
    try {
      await login('google')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось войти через Google')
    }
  }

  return (
    <div className="screen screen--center">
      <div className="hero">
        <div className="hero__logo">♚</div>
        <h1>Maeth</h1>
        <p className="muted">Мини-шахматы 4×4 — в браузере и в Telegram</p>
      </div>

      <div className="stack">
        <button
          className="btn btn--primary"
          disabled={loading || !isSupabaseConfigured}
          onClick={loginWithGoogle}
        >
          Войти через Google
        </button>
        <button className="btn" disabled>
          Telegram позже
        </button>
        <button className="btn btn--ghost" disabled={loading} onClick={() => login('guest')}>
          Играть как гость
        </button>
      </div>

      {error && <p className="muted tiny">{error}</p>}
      {!isSupabaseConfigured && (
        <p className="muted tiny">Для Google входа заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.</p>
      )}
      <p className="muted tiny">
        Google вход работает через Supabase Auth. Telegram подключим отдельным этапом.
      </p>
    </div>
  )
}
