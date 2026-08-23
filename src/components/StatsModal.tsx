import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { createGame, getStats, type PlayerStats } from '@/lib/api'
import { InvitePlayerModal } from './InvitePlayerModal'
import { useAnimatedClose } from './useAnimatedClose'

export function StatsModal({ onClose }: { onClose: () => void }) {
  const { user, online } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { closing, close } = useAnimatedClose(onClose)
  const [rows, setRows] = useState<PlayerStats[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inviteTarget, setInviteTarget] = useState<PlayerStats | null>(null)
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    let alive = true
    getStats()
      .then(({ players }) => {
        if (alive) setRows(players)
      })
      .catch((reason) => {
        if (alive) setError(reason instanceof Error ? reason.message : t('stats.errLoad'))
      })
    return () => {
      alive = false
    }
  }, [t])

  const sendInvite = async () => {
    if (!inviteTarget) return
    setInviting(true)
    setError(null)
    try {
      const { game } = await createGame({ invitedUserId: inviteTarget.id })
      const opponentName = inviteTarget.name
      setInviteTarget(null)
      onClose()
      navigate(`/play/${game.id}`, {
        state: { vsBot: false, opponentName, humanColor: 'white' },
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('friends.errCreate'))
    } finally {
      setInviting(false)
    }
  }

  return createPortal(
    <>
      <div
        className={`modal-backdrop modal-backdrop--app-panel ${closing ? 'modal-backdrop--out' : ''}`}
        onClick={inviting ? undefined : close}
      >
        <div
          className={`modal stats-modal ${closing ? 'modal--out' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="stats-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <h3 id="stats-modal-title">{t('stats.title')}</h3>
          <div className="stats-modal__body">
            {error ? (
              <p className="muted stats-modal__message">{error}</p>
            ) : rows === null ? (
              <p className="muted stats-modal__message">{t('stats.loading')}</p>
            ) : rows.length === 0 ? (
              <p className="muted tiny stats-modal__message">{t('stats.empty')}</p>
            ) : (
              <div className="stats-modal__table">
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
                    {rows.map((row) => {
                      const clickable = online && row.id !== user?.id
                      const openInvite = () => {
                        if (clickable) setInviteTarget(row)
                      }
                      return (
                        <tr
                          key={row.id}
                          className={clickable ? 'stats-table__row--clickable' : undefined}
                          onClick={openInvite}
                          onKeyDown={
                            clickable
                              ? (event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    openInvite()
                                  }
                                }
                              : undefined
                          }
                          tabIndex={clickable ? 0 : undefined}
                          role={clickable ? 'button' : undefined}
                          aria-label={
                            clickable ? t('stats.inviteTitle', { name: row.name }) : undefined
                          }
                        >
                          <td className="stats-table__name">{row.name}</td>
                          <td>{row.wins}</td>
                          <td>{row.losses}</td>
                          <td>{row.draws}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <button className="btn btn--primary" onClick={close} disabled={inviting}>
            {t('common.close')}
          </button>
        </div>
      </div>

      {inviteTarget && (
        <InvitePlayerModal
          name={inviteTarget.name}
          busy={inviting}
          onInvite={sendInvite}
          onClose={() => !inviting && setInviteTarget(null)}
        />
      )}
    </>,
    document.body,
  )
}
