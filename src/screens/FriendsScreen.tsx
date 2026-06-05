import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { fetchFriends } from '@/auth/mockFriends'
import type { Friend } from '@/auth/types'
import { createGame, listFriends } from '@/lib/api'
import './screens.css'

export function FriendsScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // Telegram users see Telegram contacts; everyone else sees Google contacts.
  const source: 'telegram' | 'google' = user?.provider === 'telegram' ? 'telegram' : 'google'

  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setFriends(null)
    setError(null)
    const request =
      user?.provider === 'google'
        ? listFriends().then(({ friends }) => friends)
        : fetchFriends(source)
    request
      .then((f) => {
        if (alive) setFriends(f)
      })
      .catch((e) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Не удалось загрузить друзей')
        setFriends([])
      })
    return () => {
      alive = false
    }
  }, [source, user?.provider])

  const invite = async (f: Friend) => {
    if (user?.provider !== 'google') return
    setCreatingFor(f.id)
    setError(null)
    try {
      const { game } = await createGame({ invitedUserId: f.id })
      navigate(`/play/${game.id}`, {
        state: { vsBot: false, opponentName: f.name, humanColor: 'white' },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать приглашение')
    } finally {
      setCreatingFor(null)
    }
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn btn--ghost btn--sm" onClick={() => navigate('/')}>
          ← Назад
        </button>
        <h2 className="topbar__title">Друзья · {source === 'telegram' ? 'Telegram' : 'Google'}</h2>
        <span />
      </header>

      {friends === null ? (
        <p className="muted">Загрузка контактов…</p>
      ) : error ? (
        <p className="muted">{error}</p>
      ) : friends.length === 0 ? (
        <p className="muted">
          {user?.provider === 'google'
            ? 'Пока нет других Google-игроков. Когда друг войдет в Maeth, он появится здесь.'
            : 'Друзей не найдено.'}
        </p>
      ) : (
        <ul className="list">
          {friends.map((f) => (
            <li key={f.id} className="list__item">
              <div className="who">
                <div className="avatar">{f.name[0]}</div>
                <div>
                  <div className="who__name">{f.name}</div>
                  <div className="muted tiny">
                    {user?.provider === 'google'
                      ? 'Google игрок'
                      : `${f.username ? `@${f.username} · ` : ''}${f.online ? 'в сети' : 'не в сети'}`}
                  </div>
                </div>
              </div>
              <div className="row-actions">
                <button
                  className="btn btn--sm"
                  disabled={user?.provider !== 'google' || creatingFor === f.id}
                  onClick={() => invite(f)}
                >
                  {creatingFor === f.id ? 'Создаю…' : 'Пригласить'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
