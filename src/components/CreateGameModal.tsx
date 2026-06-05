import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import { listFriends } from '@/lib/api'
import type { Friend } from '@/auth/types'

export type CreateChoice =
  | { mode: 'open' }
  | { mode: 'friend'; invitedUserId?: string; invitedEmail?: string }
  | { mode: 'bot' }

type Mode = 'open' | 'friend' | 'bot'

/** Panel to start a game: open (link), invite a friend (list or email), or bot. */
export function CreateGameModal({
  isGoogle,
  submitting,
  error,
  onSubmit,
  onClose,
}: {
  isGoogle: boolean
  submitting: boolean
  error: string | null
  onSubmit: (choice: CreateChoice) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('open')
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendId, setFriendId] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (!isGoogle) return
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
  }, [isGoogle])

  const emailEntered = email.trim() !== ''
  const canSubmit = mode !== 'friend' || emailEntered || friendId !== ''

  const submit = () => {
    if (mode === 'open') return onSubmit({ mode: 'open' })
    if (mode === 'bot') return onSubmit({ mode: 'bot' })
    if (emailEntered) return onSubmit({ mode: 'friend', invitedEmail: email.trim() })
    if (friendId) return onSubmit({ mode: 'friend', invitedUserId: friendId })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal create-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('lobby.create')}</h3>

        <div className="create-opts">
          <label className="radio-row">
            <input type="radio" name="create-mode" checked={mode === 'open'} onChange={() => setMode('open')} />
            <span className="radio-row__text">
              <span className="radio-row__title">{t('create.optOpen')}</span>
              <span className="muted tiny">{t('create.optOpenHint')}</span>
            </span>
          </label>

          <label className="radio-row">
            <input type="radio" name="create-mode" checked={mode === 'friend'} onChange={() => setMode('friend')} />
            <span className="radio-row__title">{t('create.optFriend')}</span>
          </label>
          {mode === 'friend' && (
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
