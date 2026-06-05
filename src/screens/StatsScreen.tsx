import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { AppHeader } from '@/components/AppHeader'
import { RulesModal } from '@/components/RulesModal'
import { getStats, type PlayerStats } from '@/lib/api'
import './screens.css'

export function StatsScreen() {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const [rows, setRows] = useState<PlayerStats[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)

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
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="stats-table__name">{r.name}</td>
                  <td>{r.wins}</td>
                  <td>{r.losses}</td>
                  <td>{r.draws}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
