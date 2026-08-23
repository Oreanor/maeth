import { useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { isSupabaseConfigured } from '@/lib/supabase'
import { LoginIllustration } from '@/components/LoginIllustration'
import { UserMenu } from '@/components/UserMenu'
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
    <div className="screen screen--center screen--login">
      <div className="login-settings">
        <UserMenu appearanceOnly />
      </div>
      <div className="hero">
        <LoginIllustration
          overlay={
            <div className="login-hero__logo">
              <div className="hero__logo-wrap">
                <img className="hero__wordmark hero__wordmark--overlay" src={logoMaeth} alt="Maeth" />
                <span className="hero__star hero__star--overlay" aria-hidden="true">
                  *
                </span>
              </div>
            </div>
          }
        />
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
        {error && <p className="login__status muted tiny">{error}</p>}
        {!isSupabaseConfigured && (
          <p className="login__status muted tiny">{t('login.needConfig')}</p>
        )}
      </div>

      <div className="login__meta">
        <p className="login__note muted tiny">
          <span className="login__note-star" aria-hidden="true">*</span> {t('login.subtitle')}
        </p>
        <a className="screen-copyright" href="mailto:oreanormaeth@gmail.com">
          © 2026 Oreanor Aurgilion
        </a>
      </div>

    </div>
  )
}
