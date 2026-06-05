import { useI18n } from '@/i18n'

/** Modal showing the game rules, opened from the "?" button in the header. */
export function RulesModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rules-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('rules.title')}</h3>
        <p className="muted rules-modal__body">{t('rules.body')}</p>
        <button className="btn btn--primary" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}
