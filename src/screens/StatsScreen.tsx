import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { AppHeader } from '@/components/AppHeader'
import { InvitePlayerModal } from '@/components/InvitePlayerModal'
import { RulesModal } from '@/components/RulesModal'
import { createGame, getStats, type PlayerStats } from '@/lib/api'
import './screens.css'

export function StatsScreen() {
  const { user, logout, online } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [rows, setRows] = useState<PlayerStats[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [inviteTarget, setInviteTarget] = useState<PlayerStats | null>(null)
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    let alive = true
    getStats()
      .then(({ players }) => {
        if (alive) setRows(players)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : t('stats.errLoad'))
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openInvite = (row: PlayerStats) => {
    if (!online || row.id === user?.id) return
    setInviteTarget(row)
  }

  const sendInvite = async () => {
    if (!inviteTarget) return
    setInviting(true)
    setError(null)
    try {
      const { game } = await createGame({ invitedUserId: inviteTarget.id })
      setInviteTarget(null)
      navigate(`/play/${game.id}`, {
        state: { vsBot: false, opponentName: inviteTarget.name, humanColor: 'white' },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('friends.errCreate'))
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="screen">
      <AppHeader name={user?.name} onLogout={logout} onHelp={() => setRulesOpen(true)} />

      <h2 className="screen__title">{t('stats.title')}</h2>

      {error ? (
        <p className="muted">{error}</p>
      ) : rows === null ? (
        <p className="muted">{t('stats.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="muted tiny">{t('stats.empty')}</p>
      ) : (
        <div className="card">
          <table className="stats-table">
            <thead>
              <tr>
                <th>{t('stats.player')}</th>
                <th title={t('stats.wins')}>{t('stats.wins')}</th>
                <th title={t('stats.losses')}>{t('stats.losses')}</th>
                <th title={t('stats.draws')}>{t('stats.draws')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const clickable = online && r.id !== user?.id
                return (
                  <tr
                    key={r.id}
                    className={clickable ? 'stats-table__row--clickable' : undefined}
                    onClick={clickable ? () => openInvite(r) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              openInvite(r)
                            }
                          }
                        : undefined
                    }
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? 'button' : undefined}
                    aria-label={clickable ? t('stats.inviteTitle', { name: r.name }) : undefined}
                  >
                    <td className="stats-table__name">{r.name}</td>
                    <td>{r.wins}</td>
                    <td>{r.losses}</td>
                    <td>{r.draws}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {inviteTarget && (
        <InvitePlayerModal
          name={inviteTarget.name}
          busy={inviting}
          onInvite={sendInvite}
          onClose={() => !inviting && setInviteTarget(null)}
        />
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
