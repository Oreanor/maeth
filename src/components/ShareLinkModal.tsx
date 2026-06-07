import { useState } from 'react'
import { useI18n } from '@/i18n'
import { useModalDismiss } from './useModalDismiss'

/** Shown after creating an open (link) game: the shareable URL with copy +
 *  close, plus a hint to send it to a friend. */
export function ShareLinkModal({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useI18n()
  useModalDismiss(onClose)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('game.inviteTitle')}</h3>
        <p className="muted tiny">{t('game.inviteHint')}</p>
        <code className="invite-link">{url}</code>
        <button className="btn btn--primary" onClick={copy}>
          {copied ? t('game.copied') : t('game.copyLink')}
        </button>
        <button className="btn btn--ghost" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}
