import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import type { Color, LotteryState } from '@/game/types'

const ROLL_MS = 2200
const SPIN_INTERVAL = 80

const PIP_MAP: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
}

function Pips({ value }: { value: number }) {
  const on = PIP_MAP[value] ?? []
  return (
    <span className="pips">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pip ${on.includes(i + 1) ? 'pip--on' : ''}`} />
      ))}
    </span>
  )
}

function Die3D({ value, spinning }: { value: number | null; spinning: boolean }) {
  return (
    <div className={`die3d ${spinning ? 'die3d--spin' : ''}`}>
      <span className="die3d__face">{value ? <Pips value={value} /> : null}</span>
    </div>
  )
}

function PlayerName({ color, name }: { color: Color; name: string }) {
  return <span className={`turn-lottery-modal__name turn-lottery-modal__name--${color}`}>{name}</span>
}

export function TurnLotteryModal({
  lottery,
  myColor,
  isCreator,
  whiteName,
  blackName,
  onRoll,
  onStart,
  rolling,
  starting,
}: {
  lottery: LotteryState
  myColor: Color
  isCreator: boolean
  whiteName: string
  blackName: string
  onRoll: () => void
  onStart: () => void
  rolling: boolean
  starting: boolean
}) {
  const { t } = useI18n()
  const [face, setFace] = useState<number | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [settled, setSettled] = useState(false)

  const roll = lottery.roll
  const firstTurn = lottery.firstTurn

  useEffect(() => {
    if (lottery.step !== 'revealed' || roll == null) {
      setFace(null)
      setSpinning(false)
      setSettled(false)
      return
    }

    setSpinning(true)
    setSettled(false)
    setFace(null)
    const spin = window.setInterval(
      () => setFace(1 + Math.floor(Math.random() * 6)),
      SPIN_INTERVAL,
    )
    const stop = window.setTimeout(() => {
      window.clearInterval(spin)
      setFace(roll)
      setSpinning(false)
      setSettled(true)
    }, ROLL_MS)

    return () => {
      window.clearInterval(spin)
      window.clearTimeout(stop)
    }
  }, [lottery.step, roll])

  const canStart = settled && firstTurn != null && myColor === firstTurn

  return (
    <div className="modal-backdrop">
      <div className="modal duel-modal turn-lottery-modal">
        {lottery.step === 'await_roll' ? (
          <>
            <div className="duel-modal__title">
              {isCreator ? t('lottery.opponentJoined') : t('lottery.title')}
            </div>
            {isCreator ? (
              <>
                <p className="muted turn-lottery-modal__hint">{t('lottery.rollPrompt')}</p>
                <button type="button" className="btn" onClick={onRoll} disabled={rolling}>
                  {t('lottery.rollButton')}
                </button>
              </>
            ) : (
              <p className="muted turn-lottery-modal__hint">{t('lottery.waitingRoll')}</p>
            )}
          </>
        ) : (
          <>
            <div className="duel-modal__title">{t('lottery.title')}</div>
            <p className="muted tiny turn-lottery-modal__rule">
              {spinning || !settled ? t('lottery.rule') : t('lottery.rolled', { value: String(roll ?? '') })}
            </p>
            <div className="duel-modal__dice turn-lottery-modal__dice">
              <div className="die-box">
                <Die3D value={face} spinning={spinning} />
              </div>
            </div>
            <div className="duel-modal__footer">
              {settled && firstTurn != null ? (
                <>
                  <div className="turn-lottery-modal__result">
                    <PlayerName
                      color={firstTurn}
                      name={firstTurn === 'white' ? whiteName : blackName}
                    />
                  </div>
                  {canStart ? (
                    <button type="button" className="btn" onClick={onStart} disabled={starting}>
                      {t('lottery.startButton')}
                    </button>
                  ) : (
                    <p className="muted tiny">{t('lottery.waitingStart')}</p>
                  )}
                </>
              ) : (
                <div className="muted tiny">{t('lottery.spinning')}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
