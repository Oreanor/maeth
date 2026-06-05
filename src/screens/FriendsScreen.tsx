import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { fetchFriends } from '@/auth/mockFriends'
import type { Friend } from '@/auth/types'
import { createGame, listFriends } from '@/lib/api'
import './screens.css'

export function FriendsScreen() {
  const { user } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const isGoogle = user?.provider === 'google'

  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setFriends(null)
    setError(null)
    const request = isGoogle ? listFriends().then(({ friends }) => friends) : fetchFriends()
    request
      .then((f) => {
        if (alive) setFriends(f)
      })
      .catch((e) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : t('friends.errLoad'))
        setFriends([])
      })
    return () => {
      alive = false
    }
  }, [isGoogle, t])

  const invite = async (f: Friend) => {
    if (!isGoogle) return
    setCreatingFor(f.id)
    setError(null)
    try {
      const { game } = await createGame({ invitedUserId: f.id })
      navigate(`/play/${game.id}`, {
        state: { vsBot: false, opponentName: f.name, humanColor: 'white' },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('friends.errCreate'))
    } finally {
      setCreatingFor(null)
    }
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn btn--ghost btn--sm" onClick={() => navigate('/')}>
          {t('common.back')}
        </button>
        <h2 className="topbar__title">{t('friends.title')}</h2>
        <span />
      </header>

      {friends === null ? (
        <p className="muted">{t('friends.loading')}</p>
      ) : error ? (
        <p className="muted">{error}</p>
      ) : friends.length === 0 ? (
        <p className="muted">{isGoogle ? t('friends.emptyGoogle') : t('friends.empty')}</p>
      ) : (
        <ul className="list">
          {friends.map((f) => (
            <li key={f.id} className="list__item">
              <div className="who">
                <div className="avatar">{f.name[0]}</div>
                <div>
                  <div className="who__name">{f.name}</div>
                  <div className="muted tiny">
                    {isGoogle
                      ? t('friends.googlePlayer')
                      : `${f.username ? `@${f.username} · ` : ''}${f.online ? '●' : '○'}`}
                  </div>
                </div>
              </div>
              <div className="row-actions">
                <button
                  className="btn btn--sm"
                  disabled={!isGoogle || creatingFor === f.id}
                  onClick={() => invite(f)}
                >
                  {creatingFor === f.id ? t('friends.inviting') : t('friends.invite')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
