import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n'
import type { Color } from '@/game/types'
import type { DuelEvent } from '@/game/useGame'

const ROLL_MS = 400 // how long each die "shuffles" before settling
const LEAD_MS = 100 // empty dice shown before the first one starts rolling
const CLOSE_MS = 300 // collapse animation duration (matches the CSS keyframe)

// Pip positions on a 3×3 grid (cells 1‑9) for each face value.
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

// A flat die: a single face showing pips, with the values running while rolling.
function Die3D({
  value,
  spinning,
  idle,
}: {
  value: number | null
  spinning: boolean
  idle?: boolean
}) {
  return (
    <div className={`die3d ${spinning ? 'die3d--spin' : ''} ${idle ? 'die3d--idle' : ''}`}>
      <span className="die3d__face">{value ? <Pips value={value} /> : null}</span>
    </div>
  )
}

export function DuelModal({
  duel,
  pending,
  human,
  youName,
  opponentName,
  onClose,
}: {
  duel: DuelEvent | null
  pending: boolean
  human: Color
  youName: string
  opponentName: string
  onClose: () => void
}) {
  const { t } = useI18n()
  // Both dice start empty; once the result is known die 1 rolls and settles,
  // then die 2 rolls and settles. `null` faces render as a blank white die.
  const [stage, setStage] = useState<'lead' | 'roll1' | 'roll2' | 'done'>('lead')
  const [face1, setFace1] = useState<number | null>(null)
  const [face2, setFace2] = useState<number | null>(null)
  const [closing, setClosing] = useState(false)
  // Keep the latest onClose without retriggering the auto-close timer when the
  // parent re-renders (e.g. the remote game's polling churns the callback).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const open = pending || !!duel

  // Reset to blank whenever the modal is fully closed.
  useEffect(() => {
    if (!open) {
      setStage('lead')
      setFace1(null)
      setFace2(null)
      setClosing(false)
    }
  }, [open])

  // Run the sequence once the result is known: a brief empty lead, die 1
  // shuffles then settles, then die 2 shuffles then settles.
  useEffect(() => {
    if (!duel) return
    setStage('lead')
    setFace1(null)
    setFace2(null)
    setClosing(false)
    const ts: ReturnType<typeof setTimeout>[] = []
    ts.push(
      setTimeout(() => {
        setStage('roll1')
        const spin1 = setInterval(() => setFace1(Math.floor(Math.random() * 6)), 80)
        ts.push(spin1)
        ts.push(
          setTimeout(() => {
            clearInterval(spin1)
            setFace1(duel.attacker - 1)
            setStage('roll2')
            const spin2 = setInterval(() => setFace2(Math.floor(Math.random() * 6)), 80)
            ts.push(spin2)
            ts.push(
              setTimeout(() => {
                clearInterval(spin2)
                setFace2(duel.defender - 1)
                setStage('done')
              }, ROLL_MS),
            )
          }, ROLL_MS),
        )
      }, LEAD_MS),
    )
    return () => {
      ts.forEach((tm) => {
        clearTimeout(tm)
        clearInterval(tm)
      })
    }
  }, [duel])

  const dismiss = () => {
    if (stage !== 'done' || closing) return
    setClosing(true)
    setTimeout(() => onCloseRef.current(), CLOSE_MS)
  }

  if (!open) return null
  const attackerIsYou = duel ? duel.by === human : true // a pending duel is always your own strike
  const attackerName = attackerIsYou ? youName : opponentName
  const defenderName = attackerIsYou ? opponentName : youName
  const good = duel ? duel.success === attackerIsYou : false
  const done = stage === 'done'
  const resultTone = done && duel ? (good ? 'duel-modal__result--good' : 'duel-modal__result--bad') : ''

  return (
    <div
      className={`modal-backdrop ${closing ? 'modal-backdrop--closing' : ''} ${
        done ? 'modal-backdrop--dismissible' : ''
      }`.trim()}
      onClick={done ? dismiss : undefined}
    >
      <div
        className={`modal duel-modal ${closing ? 'modal--closing' : ''} ${
          done ? 'duel-modal--done' : ''
        }`.trim()}
        onClick={(e) => {
          e.stopPropagation()
          if (done) dismiss()
        }}
      >
        <div className="duel-modal__title">{t('duel.title')}</div>
        <div className="duel-modal__players">
          <span className="duel-modal__player">{attackerName}</span>
          <span className="duel-modal__player">{defenderName}</span>
        </div>
        <div className="duel-modal__dice">
          <div className="die-box">
            <Die3D value={face1 == null ? null : face1 + 1} spinning={stage === 'roll1'} />
          </div>
          <span className="duel-modal__vs">vs</span>
          <div className="die-box">
            <Die3D value={face2 == null ? null : face2 + 1} spinning={stage === 'roll2'} />
          </div>
        </div>
        <div className="duel-modal__footer">
          <div
            className={`duel-modal__result ${done ? resultTone : 'duel-modal__result--rolling'}`.trim()}
          >
            {done ? (duel?.success ? t('duel.success') : t('duel.miss')) : t('duel.rolling')}
          </div>
          <button
            type="button"
            className={`btn btn--ghost duel-modal__dismiss ${done ? 'duel-modal__dismiss--visible' : ''}`}
            onClick={dismiss}
            disabled={!done}
            tabIndex={done ? 0 : -1}
            aria-hidden={!done}
          >
            {t('duel.tapToClose')}
          </button>
        </div>
      </div>
    </div>
  )
}
