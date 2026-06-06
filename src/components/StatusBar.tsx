import { useI18n } from '@/i18n'
import type { GameState } from '@/game/types'

// Single, unified status line covering every phase of the game: waiting for an
// opponent, the draft, and the move phase — so it is always clear whose turn it
// is and what is expected next.
export function StatusBar({
  phase,
  isHumanTurn,
  waiting,
  pendingLabel,
}: {
  phase: GameState['phase']
  isHumanTurn: boolean
  waiting: boolean
  pendingLabel: string | null
}) {
  const { t } = useI18n()
  if (phase === 'over') return null // shown as a modal

  let text: string
  if (waiting) {
    text = t('game.waitingPlayer')
  } else if (phase === 'draft') {
    if (!isHumanTurn) text = t('game.opponentPlacing')
    else text = pendingLabel ? t('game.placePiece', { piece: pendingLabel }) : t('game.yourDraft')
  } else {
    text = isHumanTurn ? t('game.yourTurn') : t('game.opponentTurn')
  }

  return <div className="statusbar">{text}</div>
}
