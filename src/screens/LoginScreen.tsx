import { useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { isSupabaseConfigured } from '@/lib/supabase'
import logoMaeth from '@/assets/logo-maeth.png'
import './screens.css'

export function LoginScreen() {
  const { login, loading } = useAuth()
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)

  const loginWithGoogle = async () => {
    setError(null)
    try {
      await login('google')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('login.googleError'))
    }
  }

  return (
    <div className="screen screen--center">
      <div className="hero">
        <div className="hero__logo-wrap">
          <img className="hero__wordmark" src={logoMaeth} alt="Maeth" />
          <span className="hero__star" aria-hidden="true">*</span>
        </div>
      </div>

      <div className="stack">
        <button
          className="btn btn--primary"
          disabled={loading || !isSupabaseConfigured}
          onClick={loginWithGoogle}
        >
          {t('login.google')}
        </button>
        <button className="btn btn--ghost" disabled={loading} onClick={() => login('guest')}>
          {t('login.guest')}
        </button>
      </div>

      <p className="login__note muted tiny">
        <span className="login__note-star" aria-hidden="true">*</span> {t('login.subtitle')}
      </p>

      {error && <p className="muted tiny">{error}</p>}
      {!isSupabaseConfigured && <p className="muted tiny">{t('login.needConfig')}</p>}
    </div>
  )
}
