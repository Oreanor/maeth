import { useI18n } from '@/i18n'
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
}: {
  state: GameState
  human: Color
  bot: Color
  opponentName: string
  youName: string
  opponentPresence?: Presence | null
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
        <span className="score__name">{youName}</span>
        <span className="score__name">
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
    </div>
  )
}
