import { Fragment } from 'react'
import { useI18n } from '@/i18n'

/** Turn `**emphasis**` markers in rules copy into <strong>. */
function formatRulesLine(line: string) {
  const parts = line.split(/(\*\*.+?\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

/** Modal showing the game rules, opened from the "?" button in the header. The
 *  body is one i18n string with paragraphs separated by blank lines. */
export function RulesModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const paragraphs = t('rules.body').split('\n').filter((line) => line.trim() !== '')
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rules-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('rules.title')}</h3>
        <div className="rules-modal__body">
          {paragraphs.map((line, i) => (
            <p key={i} className="muted">
              {formatRulesLine(line)}
            </p>
          ))}
        </div>
        <button className="btn btn--primary" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}
