import { useI18n } from '@/i18n'
import type { Color } from '@/game/types'
import type { SeriesScore } from '@/lib/api'

/** Running room score (you : opponent), shown under the board. Always visible,
 *  starting at 0 : 0. Draws, if any, are appended as "· N". */
export function SeriesBar({
  series,
  human,
  opponent,
}: {
  series: SeriesScore
  human: Color
  opponent: Color
}) {
  const { t } = useI18n()
  return (
    <div className="series">
      <span className="series__label">{t('game.series')}</span>
      <span className="series__score">
        {series[human]} : {series[opponent]}
        {series.draws > 0 && <span className="series__draws"> · {series.draws}</span>}
      </span>
    </div>
  )
}
