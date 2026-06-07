import type { Color, GameState, LotteryState } from './types'
import type { LogColor } from './actionLog'

type StatusT = (key: string, vars?: Record<string, string>) => string

/** One-line hint shown below the scrollable event log. */
export function gameLogStatusLine(
  phase: GameState['phase'],
  waiting: boolean,
  isHumanTurn: boolean,
  pendingLabel: string | null,
  t: StatusT,
  lottery?: LotteryState | null,
): string | null {
  if (waiting) return t('game.waitingPlayer')
  if (phase === 'over') return null
  if (phase === 'lottery') {
    if (lottery?.step === 'await_roll') return t('lottery.statusAwaitRoll')
    if (lottery?.step === 'revealed') return t('lottery.statusRevealed')
    return t('lottery.status')
  }
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
  if (waiting || phase === 'lottery') return 'neutral'
  return turn
}
