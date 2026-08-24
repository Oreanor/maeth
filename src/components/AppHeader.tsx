import { UserMenu } from './UserMenu'

/** The single app header. The lobby carries the wordmark over its own HUD, and
 *  the game screen shows none, so all that remains up here is the settings menu. */
export function AppHeader({
  name,
  onLogout,
  onHelp,
  onStats,
  className,
  onExit,
  onSignIn,
}: {
  name?: string
  /** Omitted while signed out — there is nothing to sign out of. */
  onLogout?: () => void
  onHelp?: () => void
  /** Omitted while signed out: stats belong to an account. */
  onStats?: () => void
  className?: string
  /** Leave the game for the lobby; omitted in the lobby itself. */
  onExit?: () => void
  /** Offered while signed out; it is what unlocks online play and stats. */
  onSignIn?: () => void
}) {
  return (
    <header className={`topbar${className ? ` ${className}` : ''}`}>
      <div className="topbar__right">
        <UserMenu name={name} onLogout={onLogout} onHelp={onHelp} onStats={onStats} onExit={onExit} onSignIn={onSignIn} />
      </div>
    </header>
  )
}
