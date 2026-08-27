import {
  applyFailedStrike,
  applyMove,
  createInitialState,
  replayPlace,
  type DuelRoll,
} from './engine'
import { type PieceKind } from './pieces'
import { cellSquare } from './notation'
import type { Color, GameState } from './types'

export interface LogNames {
  white: string
  black: string
}

export interface StoredAction {
  id: number
  action_type: 'place' | 'move'
  payload: {
    cell?: number
    kind?: PieceKind
    from?: number
    to?: number
    by?: Color
    duel?: DuelRoll | null
  }
}

type LogT = (key: string, vars?: Record<string, string | number>) => string

/** Player colour for log styling; neutral for system lines. */
export type LogColor = Color | 'neutral'

export interface LogEntry {
  text: string
  color: LogColor
}

function actorName(color: Color, names: LogNames): string {
  return color === 'white' ? names.white : names.black
}

function pieceLabel(kind: PieceKind, t: LogT): string {
  return t(`pieces.${kind}`)
}

function applyStoredMove(
  state: GameState,
  from: number,
  to: number,
  duel: DuelRoll | null | undefined,
): GameState {
  const move = { from, to, capture: Boolean(state.board[to]) }
  if (duel) return duel.success ? applyMove(state, move) : applyFailedStrike(state, move)
  return applyMove(state, move)
}

/** Rebuild the full event log by replaying stored server/local actions. */
export function buildActionLog(actions: StoredAction[], names: LogNames, t: LogT): LogEntry[] {
  const lines: LogEntry[] = []
  let state = createInitialState()

  for (const action of actions) {
    const by = action.payload.by ?? state.turn

    if (action.action_type === 'place' && typeof action.payload.cell === 'number') {
      const kind = action.payload.kind ?? state.pending
      if (!kind) continue
      lines.push({
        color: by,
        text: t('log.place', {
          name: actorName(by, names),
          piece: pieceLabel(kind, t),
          square: cellSquare(action.payload.cell),
        }),
      })
      state = replayPlace(state, action.payload.cell, kind)
      continue
    }

    if (
      action.action_type === 'move' &&
      typeof action.payload.from === 'number' &&
      typeof action.payload.to === 'number'
    ) {
      const from = action.payload.from
      const to = action.payload.to
      const attacker = state.board[from]
      if (!attacker) continue
      const victim = state.board[to]
      const duel = action.payload.duel
      const fromSq = cellSquare(from)
      const toSq = cellSquare(to)
      const name = actorName(by, names)
      const attackerName = pieceLabel(attacker.kind, t)

      if (duel && victim) {
        // Which way the coin came down is already in the key: side one is the odd
        // roll, and the odd roll is the strike landing. The line says so itself.
        const key = duel.success ? 'log.duelWin' : 'log.duelFail'
        lines.push({
          color: by,
          text: t(key, {
            name,
            attacker: attackerName,
            victim: pieceLabel(victim.kind, t),
          }),
        })
      } else if (victim) {
        lines.push({
          color: by,
          text: t('log.capture', {
            name,
            attacker: attackerName,
            from: fromSq,
            to: toSq,
            victim: pieceLabel(victim.kind, t),
          }),
        })
      } else {
        lines.push({
          color: by,
          text: t('log.move', {
            name,
            piece: attackerName,
            from: fromSq,
            to: toSq,
          }),
        })
      }

      state = applyStoredMove(state, from, to, duel)
    }
  }

  if (state.phase === 'over') {
    if (state.status.kind === 'draw') lines.push({ text: t('log.draw'), color: 'neutral' })
    else if (state.status.kind === 'win') {
      lines.push({
        color: state.status.winner,
        text: t('log.win', { name: actorName(state.status.winner, names) }),
      })
    }
  }

  return lines
}
