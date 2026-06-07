import { useAnimatedClose } from './useAnimatedClose'
import { useI18n } from '@/i18n'

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
  const { closing, close } = useAnimatedClose(onClose)

  return (
    <div className={`modal-backdrop ${closing ? 'modal-backdrop--out' : ''}`} onClick={busy ? undefined : close}>
      <div className={`modal invite-player-modal ${closing ? 'modal--out' : ''}`} onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>
  )
}
