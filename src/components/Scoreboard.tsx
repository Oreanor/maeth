import { useI18n } from '@/i18n'
import type { LogColor } from '@/game/actionLog'
import type { Color, GameState } from '@/game/types'
import type { Presence } from '@/lib/api'

/** Names + capture tally above the board, with the opponent's presence dot. */
export function Scoreboard({
  state,
  human,
  bot,
  opponentName,
  youName,
  opponentPresence,
  statusLine,
  statusColor,
  statusAction,
}: {
  state: GameState
  human: Color
  bot: Color
  opponentName: string
  youName: string
  opponentPresence?: Presence | null
  /** What to do next. Sits under the score rather than in the log, which is a
   *  record of what already happened. */
  statusLine?: string | null
  statusColor?: LogColor | null
  /** Replaces the hint when there is something to press instead. */
  statusAction?: { label: string; onClick: () => void; disabled?: boolean }
}) {
  const { t } = useI18n()
  const presenceTitle = opponentPresence
    ? { 'in-game': t('presence.inGame'), online: t('presence.online'), offline: t('presence.offline') }[
        opponentPresence
      ]
    : undefined
  return (
    <div className="score">
      <div className="score__names">
        <span className={`score__name score__name--${human}`}>{youName}</span>
        <span className="score__vs">vs</span>
        <span className={`score__name score__name--${bot}`}>
          {opponentPresence && (
            <span className={`presence-dot presence-dot--${opponentPresence}`} title={presenceTitle} />
          )}
          {opponentName}
        </span>
      </div>
      <div className="score__nums">
        <strong>{state.captures[human]}</strong>
        <span className="score__colon">:</span>
        <strong>{state.captures[bot]}</strong>
      </div>
      {statusAction ? (
        <button
          type="button"
          className="btn btn--primary btn--sm score__action"
          onClick={statusAction.onClick}
          disabled={statusAction.disabled}
        >
          {statusAction.label}
        </button>
      ) : statusLine ? (
        <div className={`score__status score__status--${statusColor ?? 'neutral'}`} aria-live="polite">
          {statusLine}
        </div>
      ) : null}
    </div>
  )
}
