import { useI18n } from '@/i18n'
import type { ApiIncomingInvite } from '@/lib/api'
import { useAnimatedClose } from './useAnimatedClose'

/** Popup shown when an invited player opens the lobby and has a pending invite. */
export function InvitePopup({
  invite,
  entering,
  onEnter,
  onClose,
}: {
  invite: ApiIncomingInvite
  entering: boolean
  onEnter: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const { closing, close } = useAnimatedClose(onClose)
  return (
    <div className={`modal-backdrop ${closing ? 'modal-backdrop--out' : ''}`} onClick={close}>
      <div className={`modal invite-popup ${closing ? 'modal--out' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="invite-popup__title">🎉 {t('invitePopup.title')}</div>
        <p className="muted">{t('invitePopup.body', { name: invite.from.name })}</p>
        <button className="btn btn--primary" onClick={onEnter} disabled={entering}>
          {entering ? t('lobby.accepting') : t('invitePopup.enter')}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={close}>
          {t('invitePopup.later')}
        </button>
      </div>
    </div>
  )
}
