import { useNavigate } from 'react-router-dom'
import { UserMenu } from './UserMenu'
import logoMaeth from '@/assets/logo-maeth.png'

/** The single app header: logo (click → lobby) and the settings menu. */
export function AppHeader({
  name,
  onLogout,
  onHelp,
  onStats,
  className,
}: {
  name?: string
  onLogout: () => void
  onHelp: () => void
  onStats: () => void
  className?: string
}) {
  const navigate = useNavigate()
  return (
    <header className={`topbar${className ? ` ${className}` : ''}`}>
      <button className="topbar__logo-btn" onClick={() => navigate('/')} aria-label="Maeth" title="Maeth">
        <img className="topbar__logo" src={logoMaeth} alt="Maeth" />
      </button>
      <div className="topbar__right">
        <UserMenu name={name} onLogout={onLogout} onHelp={onHelp} onStats={onStats} />
      </div>
    </header>
  )
}
