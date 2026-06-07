import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import { PIECES, type PieceKind } from '@/game/pieces'
import type { Color } from '@/game/types'
import type { DraftPick } from '@/game/useGame'
import { PieceBadge } from './PieceBadge'
import { PieceIcon } from './PieceIcon'

// The blind-draw reveal: remaining portraits riffle past; on your turn you tap
// anywhere to stop them, then the drawn piece lingers before the modal closes.
export function DraftPickModal({
  pick,
  human,
  opponentName,
  onConfirm,
}: {
  pick: DraftPick | null
  human: Color
  opponentName: string
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const [spin, setSpin] = useState<PieceKind | null>(null)

  const open = !!pick
  const settled = pick?.settled ?? null
  const pool = pick?.pool ?? []

  // Riffle through the remaining pieces until the draw settles.
  useEffect(() => {
    if (!open || settled) return
    const id = setInterval(() => {
      setSpin(pool[Math.floor(Math.random() * pool.length)] ?? null)
    }, 90)
    return () => clearInterval(id)
  }, [open, settled, pool])

  if (!pick) return null
  const isYou = pick.by === human
  const closing = !!pick.closing
  const def = settled ? PIECES[settled] : spin ? PIECES[spin] : null
  // While it's your turn and the carousel is still spinning, the whole modal is
  // a tap target that settles the draw.
  const tappable = isYou && !settled && !closing

  return (
    <div className={`modal-backdrop ${closing ? 'modal-backdrop--closing' : ''}`}>
      <div
        className={`modal pick-modal ${closing ? 'pick-modal--closing' : ''} ${
          tappable ? 'pick-modal--tappable' : ''
        }`}
        onClick={tappable ? onConfirm : (e) => e.stopPropagation()}
        onKeyDown={
          tappable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onConfirm()
                }
              }
            : undefined
        }
        role={tappable ? 'button' : undefined}
        tabIndex={tappable ? 0 : undefined}
        aria-label={tappable ? t('draft.tapToChoose') : undefined}
      >
        <div className="pick-modal__title">
          {settled
            ? isYou
              ? t('draft.yourPiece')
              : t('draft.oppPiece', { name: opponentName })
            : t('draft.picking')}
        </div>
        <div className={`pick-portrait ${settled ? 'pick-portrait--settled' : 'pick-portrait--spin'}`}>
          {def ? (
            <PieceIcon kind={def.kind} className="pick-portrait__icon" />
          ) : (
            <span className="pick-portrait__emoji">🎲</span>
          )}
        </div>
        <div className="pick-modal__name">
          {settled && def ? (
            <span className="pick-modal__badge-line">
              {def.name} · <PieceBadge kind={def.kind} roseSize={13} />
            </span>
          ) : (
            ' '
          )}
        </div>
        <div className="pick-modal__footer">
          {settled ? null : isYou ? (
            <div className="muted tiny">{t('draft.tapToChoose')}</div>
          ) : (
            <div className="muted tiny">{t('draft.opponentPicking', { name: opponentName })}</div>
          )}
        </div>
      </div>
    </div>
  )
}
