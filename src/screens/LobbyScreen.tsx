import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { GAME_DESCRIPTION, GAME_NAME } from '@/game/engine'
import type { Color } from '@/game/types'
import { createGame, deleteGame, joinGame, listGames, type ApiGameListItem, type ApiIncomingInvite } from '@/lib/api'
import { useCallback, useEffect, useState } from 'react'
import './screens.css'

export function LobbyScreen() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [games, setGames] = useState<ApiGameListItem[]>([])
  const [invites, setInvites] = useState<ApiIncomingInvite[]>([])
  const [loadingGames, setLoadingGames] = useState(false)
  const [joining, setJoining] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const loadGameLists = useCallback(async () => {
    if (user?.provider !== 'google') return
    setLoadingGames(true)
    setError(null)
    try {
      const data = await listGames()
      setGames(data.games)
      setInvites(data.invites)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить игры')
    } finally {
      setLoadingGames(false)
    }
  }, [user?.provider])

  useEffect(() => {
    if (user?.provider !== 'google') return
    let alive = true
    setLoadingGames(true)
    setError(null)
    listGames()
      .then((data) => {
        if (!alive) return
        setGames(data.games)
        setInvites(data.invites)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Не удалось загрузить игры')
      })
      .finally(() => {
        if (alive) setLoadingGames(false)
      })
    return () => {
      alive = false
    }
  }, [user?.provider])

  const playBot = () => {
    // Human is white by default; could randomize or let the user choose.
    const humanColor: Color = 'white'
    navigate('/play', {
      state: { vsBot: true, opponentName: 'Бот', humanColor },
    })
  }

  const createNetworkGame = async () => {
    if (user?.provider !== 'google') {
      navigate('/friends')
      return
    }

    setCreating(true)
    setError(null)
    try {
      const { game } = await createGame()
      navigate(`/play/${game.id}`, {
        state: { vsBot: false, opponentName: 'Друг', humanColor: 'white' },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать игру')
    } finally {
      setCreating(false)
    }
  }

  const openGame = (item: ApiGameListItem) => {
    navigate(`/play/${item.game.id}`, {
      state: { vsBot: false, opponentName: item.opponentName, humanColor: item.player.color },
    })
  }

  const removeGame = async (item: ApiGameListItem) => {
    if (!window.confirm('Удалить эту игру? Она исчезнет у обоих игроков.')) return
    setDeleting(item.game.id)
    setError(null)
    try {
      await deleteGame(item.game.id)
      setGames((prev) => prev.filter((g) => g.game.id !== item.game.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить игру')
    } finally {
      setDeleting(null)
    }
  }

  const acceptInvite = async (invite: ApiIncomingInvite) => {
    setJoining(invite.game.id)
    setError(null)
    try {
      const { player } = await joinGame(invite.game.id)
      navigate(`/play/${invite.game.id}`, {
        state: { vsBot: false, opponentName: invite.from.name, humanColor: player.color },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось принять приглашение')
    } finally {
      setJoining(null)
    }
  }

  return (
    <div className="screen">
      <header className="topbar">
        <div className="who">
          <div className="avatar">{user?.name?.[0] ?? '?'}</div>
          <div>
            <div className="who__name">{user?.name}</div>
            <div className="muted tiny">{providerLabel(user?.provider)}</div>
          </div>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={logout}>
          Выйти
        </button>
      </header>

      <section className="card">
        <h2>Новая игра</h2>
        <p className="muted">{GAME_NAME}</p>
        <div className="stack">
          <button className="btn btn--primary" onClick={playBot}>
            🤖 Играть с ботом
          </button>
          <button className="btn" disabled={creating} onClick={createNetworkGame}>
            👥 Пригласить друга
          </button>
        </div>
        {error && <p className="muted tiny">{error}</p>}
      </section>

      {user?.provider === 'google' && (
        <section className="card">
          <div className="section-head">
            <h3>Приглашения</h3>
            <button className="btn btn--ghost btn--sm" disabled={loadingGames} onClick={loadGameLists}>
              Обновить
            </button>
          </div>
          {loadingGames ? (
            <p className="muted tiny">Загрузка игр…</p>
          ) : invites.length === 0 ? (
            <p className="muted tiny">Новых приглашений нет.</p>
          ) : (
            <ul className="list">
              {invites.map((invite) => (
                <li key={invite.invite.id} className="list__item">
                  <div>
                    <div className="who__name">{invite.from.name}</div>
                    <div className="muted tiny">приглашает сыграть</div>
                  </div>
                  <button
                    className="btn btn--sm"
                    disabled={joining === invite.game.id}
                    onClick={() => acceptInvite(invite)}
                  >
                    {joining === invite.game.id ? 'Входим…' : 'Принять'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {user?.provider === 'google' && (
        <section className="card">
          <h3>Ваши игры</h3>
          {loadingGames ? (
            <p className="muted tiny">Загрузка игр…</p>
          ) : games.length === 0 ? (
            <p className="muted tiny">Активных игр пока нет.</p>
          ) : (
            <ul className="list">
              {games.map((item) => (
                <li key={item.game.id} className="list__item">
                  <div>
                    <div className="who__name">vs {item.opponentName}</div>
                    <div className="muted tiny">{gameStatusLabel(item.game.status)}</div>
                  </div>
                  <div className="row-actions">
                    <button className="btn btn--sm" onClick={() => openGame(item)}>
                      Продолжить
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      disabled={deleting === item.game.id}
                      onClick={() => removeGame(item)}
                    >
                      {deleting === item.game.id ? 'Удаляем…' : 'Удалить'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card card--muted">
        <h3>Как играть</h3>
        <p className="muted tiny">{GAME_DESCRIPTION}</p>
      </section>
    </div>
  )
}

function gameStatusLabel(status: string): string {
  switch (status) {
    case 'waiting':
      return 'ожидает друга'
    case 'active':
      return 'идёт партия'
    case 'over':
      return 'завершена'
    default:
      return status
  }
}

function providerLabel(p?: string): string {
  switch (p) {
    case 'telegram':
      return 'Telegram'
    case 'google':
      return 'Google'
    case 'guest':
      return 'Гость'
    default:
      return ''
  }
}
