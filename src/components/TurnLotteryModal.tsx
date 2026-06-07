import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import type { Color, LotteryState } from '@/game/types'
import { ModalContentSizer } from './ModalContentSizer'

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
  humanConfirmsStart = false,
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
  /** Local bot game: human confirms start even when the bot moves first. */
  humanConfirmsStart?: boolean
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
  const showStartButton =
    settled && firstTurn != null && (canStart || (humanConfirmsStart && !canStart))

  return (
    <div className="modal-backdrop">
      <div className="modal duel-modal turn-lottery-modal">
        <ModalContentSizer>
        {lottery.step === 'await_roll' ? (
          <>
            <div className="duel-modal__title">{t('lottery.title')}</div>
            {isCreator ? (
              <>
                <p className="muted turn-lottery-modal__hint">{t('lottery.rollPrompt')}</p>
                <button type="button" className="btn" onClick={onRoll} disabled={rolling}>
                  {t('lottery.okButton')}
                </button>
              </>
            ) : (
              <p className="muted turn-lottery-modal__hint">{t('lottery.waitingRoll')}</p>
            )}
          </>
        ) : (
          <>
            <div className="duel-modal__title">{t('lottery.title')}</div>
            <div className="duel-modal__dice turn-lottery-modal__dice">
              <div className="die-box">
                <Die3D value={face} spinning={spinning} />
              </div>
            </div>
            <div className="duel-modal__footer">
              {settled && firstTurn != null ? (
                <>
                  <div className="turn-lottery-modal__result">
                    <div className="muted tiny turn-lottery-modal__first-turn">
                      {t('lottery.firstTurnLabel')}
                    </div>
                    <PlayerName
                      color={firstTurn}
                      name={firstTurn === 'white' ? whiteName : blackName}
                    />
                  </div>
                  {showStartButton ? (
                    <button type="button" className="btn" onClick={onStart} disabled={starting}>
                      {canStart ? t('lottery.startButton') : t('lottery.okButton')}
                    </button>
                  ) : (
                    <p className="muted tiny">{t('lottery.waitingStart')}</p>
                  )}
                </>
              ) : (
                <p className="muted tiny turn-lottery-modal__rule">{t('lottery.rule')}</p>
              )}
            </div>
          </>
        )}
        </ModalContentSizer>
      </div>
    </div>
  )
}
