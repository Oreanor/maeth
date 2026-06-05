import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { LoginScreen } from '@/screens/LoginScreen'
import { LobbyScreen } from '@/screens/LobbyScreen'
import { FriendsScreen } from '@/screens/FriendsScreen'
import { StatsScreen } from '@/screens/StatsScreen'
import { GameScreen } from '@/screens/GameScreen'
import type { JSX } from 'react'

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

export function App() {
  const { user, loading } = useAuth()
  const { t } = useI18n()

  if (loading) {
    return (
      <div className="screen screen--center">
        <p className="muted">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginScreen />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <LobbyScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/friends"
        element={
          <RequireAuth>
            <FriendsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/stats"
        element={
          <RequireAuth>
            <StatsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/play"
        element={
          <RequireAuth>
            <GameScreen />
          </RequireAuth>
        }
      />
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
