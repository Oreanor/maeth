import type { Color, GameState } from './types'
import type { LogColor } from './actionLog'

type StatusT = (key: string, vars?: Record<string, string>) => string

/** One-line hint shown below the scrollable event log. */
export function gameLogStatusLine(
  phase: GameState['phase'],
  waiting: boolean,
  isHumanTurn: boolean,
  pendingLabel: string | null,
  t: StatusT,
): string | null {
  if (waiting) return t('game.waitingPlayer')
  if (phase === 'over') return null
  if (phase === 'draft') {
    if (!isHumanTurn) return t('game.opponentPlacing')
    if (pendingLabel) return t('game.placePiece', { piece: pendingLabel })
    return t('game.yourDraft')
  }
  return isHumanTurn ? t('game.yourTurn') : t('game.opponentTurn')
}

/** Accent colour for the status line — matches the side whose turn it is. */
export function gameLogStatusColor(
  phase: GameState['phase'],
  waiting: boolean,
  turn: Color,
): LogColor | null {
  if (phase === 'over') return null
  if (waiting) return 'neutral'
  return turn
}
