import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import { listFriends } from '@/lib/api'
import type { Friend } from '@/auth/types'

export type CreateChoice =
  | { mode: 'open'; duels: boolean }
  | { mode: 'friend'; invitedUserId?: string; invitedEmail?: string; duels: boolean }
  | { mode: 'bot'; duels: boolean }

type Mode = 'open' | 'friend' | 'bot'

/** Panel to start a game: open (link), invite a friend (list or email), or bot.
 *  Networked modes need an online account; offline users only get the bot. */
export function CreateGameModal({
  online,
  submitting,
  error,
  onSubmit,
  onClose,
}: {
  online: boolean
  submitting: boolean
  error: string | null
  onSubmit: (choice: CreateChoice) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>(online ? 'open' : 'bot')
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendId, setFriendId] = useState('')
  const [email, setEmail] = useState('')
  const [duels, setDuels] = useState(true)

  useEffect(() => {
    if (!online) return
    let alive = true
    listFriends()
      .then(({ friends }) => {
        if (alive) setFriends(friends)
      })
      .catch(() => {
        /* friends are optional; email invite still works */
      })
    return () => {
      alive = false
    }
  }, [online])

  const emailEntered = email.trim() !== ''
  const canSubmit = mode !== 'friend' || emailEntered || friendId !== ''

  const submit = () => {
    if (mode === 'open') return onSubmit({ mode: 'open', duels })
    if (mode === 'bot') return onSubmit({ mode: 'bot', duels })
    if (emailEntered) return onSubmit({ mode: 'friend', invitedEmail: email.trim(), duels })
    if (friendId) return onSubmit({ mode: 'friend', invitedUserId: friendId, duels })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal create-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('lobby.create')}</h3>

        <div className="create-opts">
          {online && (
            <label className="radio-row">
              <input type="radio" name="create-mode" checked={mode === 'open'} onChange={() => setMode('open')} />
              <span className="radio-row__text">
                <span className="radio-row__title">{t('create.optOpen')}</span>
                <span className="muted tiny">{t('create.optOpenHint')}</span>
              </span>
            </label>
          )}

          {online && (
            <label className="radio-row">
              <input type="radio" name="create-mode" checked={mode === 'friend'} onChange={() => setMode('friend')} />
              <span className="radio-row__title">{t('create.optFriend')}</span>
            </label>
          )}
          {online && mode === 'friend' && (
            <div className="create-friend">
              <select
                className="lang-select create-friend__select"
                value={friendId}
                onChange={(e) => setFriendId(e.target.value)}
                disabled={emailEntered}
              >
                <option value="">{friends.length ? t('create.selectFriend') : t('create.noFriends')}</option>
                {friends.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <span className="muted tiny">{t('create.orEmail')}</span>
              <input
                className="text-input"
                type="email"
                placeholder={t('create.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}

          <label className="radio-row">
            <input type="radio" name="create-mode" checked={mode === 'bot'} onChange={() => setMode('bot')} />
            <span className="radio-row__title">{t('create.optBot')}</span>
          </label>

          <label className="check-row">
            <input type="checkbox" checked={duels} onChange={(e) => setDuels(e.target.checked)} />
            <span className="check-row__text">
              <span className="check-row__title">{t('create.duels')}</span>
              <span className="muted tiny">{t('create.duelsHint')}</span>
            </span>
          </label>
        </div>

        {error && <p className="muted tiny">{error}</p>}

        <div className="create-actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            {t('create.cancel')}
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={submitting || !canSubmit}>
            {submitting ? t('create.creating') : t('create.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
