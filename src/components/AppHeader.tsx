import { useNavigate } from 'react-router-dom'
import { BarChart3, HelpCircle } from 'lucide-react'
import { useI18n } from '@/i18n'
import { UserMenu } from './UserMenu'
import logoMaeth from '@/assets/logo-maeth.png'

/** The single, invariant app header used on every screen: logo (click → lobby),
 *  stats, help and the avatar menu. */
export function AppHeader({
  name,
  onLogout,
  onHelp,
  className,
}: {
  name?: string
  onLogout: () => void
  onHelp: () => void
  className?: string
}) {
  const navigate = useNavigate()
  const { t } = useI18n()
  return (
    <header className={`topbar${className ? ` ${className}` : ''}`}>
      <button className="topbar__logo-btn" onClick={() => navigate('/')} aria-label="Maeth" title="Maeth">
        <img className="topbar__logo" src={logoMaeth} alt="Maeth" />
      </button>
      <div className="topbar__right">
        <button
          className="icon-btn"
          onClick={() => navigate('/stats')}
          aria-label={t('stats.title')}
          title={t('stats.title')}
        >
          <BarChart3 size={18} />
        </button>
        <button className="icon-btn" onClick={onHelp} aria-label={t('lobby.help')} title={t('lobby.help')}>
          <HelpCircle size={18} />
        </button>
        <UserMenu name={name} onLogout={onLogout} />
      </div>
    </header>
  )
}
