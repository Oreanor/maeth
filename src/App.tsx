import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { useAppShortcuts } from '@/useAppShortcuts'
import { LobbyScreen } from '@/screens/LobbyScreen'
import { FriendsScreen } from '@/screens/FriendsScreen'
import { GameScreen } from '@/screens/GameScreen'
import type { JSX } from 'react'

/** Guards the screens that genuinely need an account. The lobby and a game
 *  against the bot do not: signed out, they simply offer less. */
function RequireAuth({ children }: { children: JSX.Element }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/" replace />
}

export function App() {
  const { loading } = useAuth()
  const { t } = useI18n()

  useAppShortcuts()

  if (loading) {
    return (
      <div className="screen screen--center">
        <p className="muted">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <Routes>
      {/* The lobby absorbed the login screen: signing in is an option there,
          not a gate in front of it. */}
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/" element={<LobbyScreen />} />
      <Route
        path="/friends"
        element={
          <RequireAuth>
            <FriendsScreen />
          </RequireAuth>
        }
      />
      {/* A local game against the bot needs no account. */}
      <Route path="/play" element={<GameScreen />} />
      <Route
        path="/play/:gameId"
        element={
          <RequireAuth>
            <GameScreen />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
