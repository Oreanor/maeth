import { UserMenu } from './UserMenu'

/** The single app header. The lobby carries the wordmark over its own HUD, and
 *  the game screen shows none, so all that remains up here is the settings menu. */
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
  return (
    <header className={`topbar${className ? ` ${className}` : ''}`}>
      <div className="topbar__right">
        <UserMenu name={name} onLogout={onLogout} onHelp={onHelp} onStats={onStats} />
      </div>
    </header>
  )
}
