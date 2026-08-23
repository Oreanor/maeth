import { useI18n } from '@/i18n'
import type { ApiIncomingInvite } from '@/lib/api'
import { Modal } from './Modal'

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
  return (
    <Modal className="invite-popup" onClose={onClose}>
      {(close) => (
        <>
          <div className="invite-popup__title">🎉 {t('invitePopup.title')}</div>
          <p className="muted">{t('invitePopup.body', { name: invite.from.name })}</p>
          <button className="btn btn--primary" onClick={onEnter} disabled={entering}>
            {entering ? t('lobby.accepting') : t('invitePopup.enter')}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={close}>
            {t('invitePopup.later')}
          </button>
        </>
      )}
    </Modal>
  )
}
