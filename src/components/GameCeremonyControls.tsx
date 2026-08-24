import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { THREE_PIECE_SPRITE_URL, useBoardView } from '@/boardView'
import { useI18n } from '@/i18n'
import type { DraftPick, DuelEvent } from '@/game/useGame'
import { opposite, type Color, type LotteryState } from '@/game/types'
import type { PieceKind } from '@/game/pieces'
import { PieceIcon } from './PieceIcon'
import './GameCeremonyControls.css'

const SPIN_MS = 80
const BOT_STOP_MIN_MS = 500
const BOT_STOP_JITTER_MS = 500
const SETTLED_LINGER_MS = 700

const PIP_MAP: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
}

export type CeremonyHint = 'stop-die' | 'wait-die' | 'stop-piece' | 'wait-piece' | null

function DieFace({ value }: { value: number }) {
  const active = PIP_MAP[value] ?? []
  return (
    <span className="corner-die" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <span
          key={index}
          className={`corner-die__pip${active.includes(index + 1) ? ' corner-die__pip--on' : ''}`}
        />
      ))}
    </span>
  )
}

export function GameCeremonyControls({
  human,
  lottery,
  canRollLottery,
  canStartLottery,
  lotteryBusy,
  onRollLottery,
  onStartLottery,
  draftPick,
  onConfirmDraftPick,
  duel,
  duelPending,
  onDismissDuel,
  onHintChange,
}: {
  human: Color
  lottery: LotteryState | null
  canRollLottery: boolean
  canStartLottery: boolean
  lotteryBusy: boolean
  onRollLottery: () => void
  onStartLottery: () => void
  draftPick: DraftPick | null
  onConfirmDraftPick: () => void
  duel: DuelEvent | null
  duelPending: boolean
  onDismissDuel: () => void
  onHintChange?: (hint: CeremonyHint) => void
}) {
  const { viewMode, threePieceStyle } = useBoardView()
  const { t } = useI18n()
  const [dieSpin, setDieSpin] = useState(1)
  const [pieceSpin, setPieceSpin] = useState<PieceKind | null>(null)
  const [duelStage, setDuelStage] = useState<0 | 1 | 2>(0)
  const [duelFaces, setDuelFaces] = useState<[number | null, number | null]>([null, null])
  const [pendingStopped, setPendingStopped] = useState(false)
  const dismissRef = useRef(onDismissDuel)
  dismissRef.current = onDismissDuel

  const duelOpen = duelPending || duel != null
  const duelRoller = duel && duelStage < 2
    ? duelStage === 0
      ? duel.by
      : opposite(duel.by)
    : null
  const duelActionable = Boolean(duel && duelStage < 2 && duelRoller === human)
  const pendingActionable = duelPending && !duel && !pendingStopped
  const lotteryAwaiting = lottery?.step === 'await_roll'
  const lotteryActionable = Boolean(lotteryAwaiting && canRollLottery && !lotteryBusy)
  const dieRunning = Boolean(
    (duelPending && !pendingStopped) ||
      (duel && duelStage < 2) ||
      (lotteryAwaiting && !lotteryBusy),
  )
  const dieActionable = pendingActionable || duelActionable || (!duelOpen && lotteryActionable)

  const draftRunning = Boolean(draftPick && draftPick.settled == null && !draftPick.closing)
  const draftActionable = Boolean(draftRunning && draftPick?.by === human)

  useEffect(() => {
    if (!dieRunning) return
    const timer = window.setInterval(() => setDieSpin(1 + Math.floor(Math.random() * 6)), SPIN_MS)
    return () => window.clearInterval(timer)
  }, [dieRunning])

  const draftPool = draftPick?.pool
  useEffect(() => {
    if (!draftRunning || !draftPool?.length) return
    setPieceSpin(draftPool[Math.floor(Math.random() * draftPool.length)] ?? null)
    const timer = window.setInterval(() => {
      setPieceSpin(draftPool[Math.floor(Math.random() * draftPool.length)] ?? null)
    }, SPIN_MS)
    return () => window.clearInterval(timer)
  }, [draftPool, draftRunning])

  // A remote duel request can outlive the network round trip. If the player
  // already stopped the cycling die, apply that stop as soon as the true roll arrives.
  useEffect(() => {
    if (!duel) {
      setDuelStage(0)
      setDuelFaces([null, null])
      if (!duelPending) setPendingStopped(false)
      return
    }
    if (pendingStopped && duel.by === human) {
      setDuelFaces([duel.attacker, null])
      setDuelStage(1)
    } else {
      setDuelFaces([null, null])
      setDuelStage(0)
    }
  }, [duel, duelPending, human, pendingStopped])

  const settleDuelStage = useCallback(() => {
    if (!duel || duelStage >= 2) return
    const value = duelStage === 0 ? duel.attacker : duel.defender
    setDuelFaces((faces) => {
      const next: [number | null, number | null] = [...faces]
      if (duelStage === 0) next[0] = value
      else next[1] = value
      return next
    })
    setDuelStage((stage) => (stage === 0 ? 1 : 2))
  }, [duel, duelStage])

  // The other side uses the same cycling control, but its stop is simulated.
  useEffect(() => {
    if (!duel || duelStage >= 2 || duelRoller === human) return
    const timer = window.setTimeout(
      settleDuelStage,
      BOT_STOP_MIN_MS + Math.random() * BOT_STOP_JITTER_MS,
    )
    return () => window.clearTimeout(timer)
  }, [duel, duelRoller, duelStage, human, settleDuelStage])

  useEffect(() => {
    if (!duel || duelStage !== 2) return
    const timer = window.setTimeout(() => dismissRef.current(), SETTLED_LINGER_MS)
    return () => window.clearTimeout(timer)
  }, [duel, duelStage])

  // There is no second confirmation panel anymore. Once the server/local engine
  // reveals the first player, that player's client starts the draft automatically.
  useEffect(() => {
    if (duelOpen || lottery?.step !== 'revealed' || !canStartLottery || lotteryBusy) return
    const timer = window.setTimeout(onStartLottery, SETTLED_LINGER_MS)
    return () => window.clearTimeout(timer)
  }, [canStartLottery, duelOpen, lottery?.roll, lottery?.step, lotteryBusy, onStartLottery])

  const hint = useMemo<CeremonyHint>(() => {
    if (duelPending && !duel) return pendingStopped ? 'wait-die' : 'stop-die'
    if (duel && duelStage < 2) return duelRoller === human ? 'stop-die' : 'wait-die'
    if (lotteryAwaiting) return lotteryActionable ? 'stop-die' : 'wait-die'
    if (draftRunning) return draftActionable ? 'stop-piece' : 'wait-piece'
    return null
  }, [draftActionable, draftRunning, duel, duelPending, duelRoller, duelStage, human, lotteryActionable, lotteryAwaiting, pendingStopped])

  useEffect(() => onHintChange?.(hint), [hint, onHintChange])

  const onDieClick = () => {
    if (duelPending && !duel && !pendingStopped) {
      setPendingStopped(true)
      return
    }
    if (duel && duelActionable) {
      settleDuelStage()
      return
    }
    if (!duelOpen && lotteryActionable) onRollLottery()
  }

  const shownDie = duel && duelStage === 2
    ? (duelFaces[1] ?? duel.defender)
    : duel && duelStage === 1 && duelFaces[0] != null
      ? dieSpin
      : lottery?.step === 'revealed' && lottery.roll != null && !duelOpen
        ? lottery.roll
        : dieSpin
  const shownPiece = draftPick?.settled ?? pieceSpin
  // One control at a time, centred on the board, and only while a ceremony is
  // actually running — the two idle corner buttons are gone. A duel or the
  // lottery cannot coincide with a draft pick, but the die takes precedence if
  // that ever changes.
  const diceVisible = duelOpen || lottery != null
  const pieceVisible = !diceVisible && draftPick != null

  return (
    <div className="ceremony-controls" aria-live="polite">
      {diceVisible && (
        <button
          type="button"
          className={`ceremony-control${dieActionable ? ' ceremony-control--actionable' : ''}`}
          onClick={onDieClick}
          aria-disabled={!dieActionable}
          aria-label={t('game.dieButton')}
        >
          <DieFace value={shownDie} />
        </button>
      )}

      {pieceVisible && (
        <button
          type="button"
          className={`ceremony-control ceremony-control--piece${draftActionable ? ' ceremony-control--actionable' : ''}`}
          onClick={draftActionable ? onConfirmDraftPick : undefined}
          aria-disabled={!draftActionable}
          aria-label={t('game.pieceButton')}
        >
          {shownPiece ? (
            <PieceIcon
              kind={shownPiece}
              className="ceremony-control__piece"
              spriteUrl={viewMode === '3d' ? THREE_PIECE_SPRITE_URL[threePieceStyle] : undefined}
            />
          ) : (
            <span className="ceremony-control__question" aria-hidden="true">?</span>
          )}
        </button>
      )}
    </div>
  )
}
