import { Fragment } from 'react'
import { useI18n } from '@/i18n'
import { ALL_KINDS, PIECES, isArcher, type Pattern, type PieceKind } from '@/game/pieces'
import { MoveCompass } from './MoveCompass'
import { useModalDismiss } from './useModalDismiss'

const PATTERN_RANK: Record<Pattern, number> = { ortho: 0, diag: 1, zh: 2, all: 3 }

const RULES_SORTED_KINDS: PieceKind[] = [...ALL_KINDS].sort((a, b) => {
  const left = PIECES[a]
  const right = PIECES[b]
  const byArcher = Number(isArcher(a)) - Number(isArcher(b))
  if (byArcher !== 0) return byArcher
  const byPattern = PATTERN_RANK[left.pattern] - PATTERN_RANK[right.pattern]
  if (byPattern !== 0) return byPattern
  return left.range - right.range
})

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
  useModalDismiss(onClose)
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

          <section className="rules-modal__pieces">
            <h4 className="rules-modal__pieces-title">{t('rules.piecesTitle')}</h4>
            <div className="rules-pieces" role="table">
              <div className="rules-pieces__head" role="row">
                <span role="columnheader">{t('rules.colPiece')}</span>
                <span role="columnheader">{t('rules.colRange')}</span>
                <span role="columnheader">{t('rules.colDirections')}</span>
                <span role="columnheader">{t('rules.colArcher')}</span>
              </div>
              {RULES_SORTED_KINDS.map((kind: PieceKind) => (
                <div key={kind} className="rules-pieces__row" role="row">
                  <span role="cell">{t(`pieces.${kind}`)}</span>
                  <span className="rules-pieces__range" role="cell">
                    {PIECES[kind].range}
                  </span>
                  <span className="rules-pieces__dirs" role="cell">
                    <MoveCompass kind={kind} />
                  </span>
                  <span className="rules-pieces__archer" role="cell">
                    {isArcher(kind) ? '•' : ''}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <button className="btn btn--primary" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}
