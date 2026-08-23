import { useI18n } from '@/i18n'
import { Modal } from './Modal'

/** Ask whether to send a game invite to a player from the stats list. */
export function InvitePlayerModal({
  name,
  busy,
  onInvite,
  onClose,
}: {
  name: string
  busy?: boolean
  onInvite: () => void
  onClose: () => void
}) {
  const { t } = useI18n()

  return (
    <Modal className="invite-player-modal" dismissible={!busy} onClose={onClose}>
      {(close) => (
        <>
          <h3 className="invite-player-modal__title">{t('stats.inviteTitle', { name })}</h3>
          <p className="muted tiny invite-player-modal__hint">{t('stats.inviteHint')}</p>
          <div className="create-actions">
            <button type="button" className="btn btn--ghost" onClick={close} disabled={busy}>
              {t('create.cancel')}
            </button>
            <button type="button" className="btn btn--primary" onClick={onInvite} disabled={busy}>
              {busy ? t('friends.inviting') : t('stats.invitePlay')}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
