import { useI18n } from '@/i18n'
import type { Color, GameState } from '@/game/types'
import { useAnimatedClose } from './useAnimatedClose'

/** End-of-game win/loss/draw modal. Can be dismissed to inspect the board. */
export function ResultModal({
  status,
  human,
  onAgain,
  onClose,
  againLabel,
  againBusy,
}: {
  status: GameState['status']
  human: Color
  onAgain: () => void
  onClose: () => void
  againLabel?: string
  againBusy?: boolean
}) {
  const { t } = useI18n()
  const { closing, close } = useAnimatedClose(onClose)
  const draw = status.kind === 'draw'
  const won = status.kind === 'win' && status.winner === human
  const title = draw ? t('result.draw') : won ? t('result.win') : t('result.loss')
  const sub = draw ? t('result.drawSub') : won ? t('result.winSub') : t('result.lossSub')
  const tone = draw ? 'neutral' : won ? 'good' : 'bad'
  return (
    <div className={`modal-backdrop ${closing ? 'modal-backdrop--out' : ''}`} onClick={close}>
      <div
        className={`modal result-modal result-modal--${tone} ${closing ? 'modal--out' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="result-modal__title">{title}</div>
        <div className="muted">{sub}</div>
        <button className="btn btn--primary" onClick={onAgain} disabled={againBusy}>
          {againLabel ?? t('result.again')}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={close}>
          {t('result.viewBoard')}
        </button>
      </div>
    </div>
  )
}
