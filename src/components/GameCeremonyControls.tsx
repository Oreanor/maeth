import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { THREE_PIECE_SPRITE_URL, useBoardView } from '@/boardView'
import { useI18n } from '@/i18n'
import type { DraftPick, DuelEvent } from '@/game/useGame'
import type { Color, LotteryState } from '@/game/types'
import type { PieceKind } from '@/game/pieces'
import { PieceIcon } from './PieceIcon'
import './GameCeremonyControls.css'

const SPIN_MS = 80
/** Matches the ceremony-out animation, so the control finishes shrinking
 *  before it unmounts. */
const EXIT_MS = 220

/**
 * Follows a visibility flag, but lingers for `ms` after it turns off so an
 * exit animation has something to play on. Holds the last value shown too,
 * since the state behind it is already gone by then.
 */
function useLingering<T>(visible: boolean, value: T, ms: number) {
  const [mounted, setMounted] = useState(visible)
  const held = useRef(value)
  if (visible) held.current = value
  useEffect(() => {
    if (visible) {
      setMounted(true)
      return
    }
    const timer = window.setTimeout(() => setMounted(false), ms)
    return () => window.clearTimeout(timer)
  }, [visible, ms])
  return { mounted, leaving: mounted && !visible, value: visible ? value : held.current }
}
const DIE_FACES = [1, 2, 3, 4, 5, 6]

/** Never twice in a row — a repeat reads as the carousel having stalled. */
function pickOther<T>(pool: readonly T[], current: T | null): T {
  const others = pool.filter((value) => value !== current)
  const from = others.length ? others : pool
  return from[Math.floor(Math.random() * from.length)]
}

/**
 * Advance a carousel roughly every SPIN_MS, driven by frames rather than a
 * timer. An interval fires whether or not the page is painting: when the main
 * thread stalls, its callbacks queue up and then run back to back, collapsing
 * several steps into one frame so some faces are never seen. Gating on frames
 * means every step is one the player actually sees, and a stall simply resumes.
 */
function spin(step: () => void): () => void {
  let frame = 0
  let last = performance.now()
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick)
    if (now - last < SPIN_MS) return
    last = now
    step()
  }
  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}
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

export type CeremonyHint =
  | 'stop-die'
  | 'wait-die'
  | 'stop-lottery'
  | 'wait-lottery'
  | 'stop-piece'
  | 'wait-piece'
  | null

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
  const [duelSettled, setDuelSettled] = useState(false)
  const [pendingStopped, setPendingStopped] = useState(false)
  const dismissRef = useRef(onDismissDuel)
  dismissRef.current = onDismissDuel

  const duelOpen = duelPending || duel != null
  const duelActionable = Boolean(duel && !duelSettled && duel.by === human)
  const pendingActionable = duelPending && !duel && !pendingStopped
  const lotteryAwaiting = lottery?.step === 'await_roll'
  const lotteryActionable = Boolean(lotteryAwaiting && canRollLottery && !lotteryBusy)
  const dieRunning = Boolean(
    (duelPending && !pendingStopped) ||
      (duel && !duelSettled) ||
      (lotteryAwaiting && !lotteryBusy),
  )
  const dieActionable = pendingActionable || duelActionable || (!duelOpen && lotteryActionable)

  const draftRunning = Boolean(draftPick && draftPick.settled == null && !draftPick.closing)
  const draftActionable = Boolean(draftRunning && draftPick?.by === human)

  useEffect(() => {
    if (!dieRunning) return
    return spin(() => setDieSpin((face) => pickOther(DIE_FACES, face)))
  }, [dieRunning])

  const draftPool = draftPick?.pool
  useEffect(() => {
    if (!draftRunning || !draftPool?.length) return
    setPieceSpin((kind) => pickOther(draftPool, kind))
    return spin(() => setPieceSpin((kind) => pickOther(draftPool, kind)))
  }, [draftPool, draftRunning])

  // A remote duel request can outlive the network round trip. If the player
  // already stopped the cycling die, apply that stop as soon as the true roll arrives.
  useEffect(() => {
    if (!duel) {
      setDuelSettled(false)
      if (!duelPending) setPendingStopped(false)
      return
    }
    if (pendingStopped && duel.by === human) {
      setDuelSettled(true)
    } else {
      setDuelSettled(false)
    }
  }, [duel, duelPending, human, pendingStopped])

  const settleDuel = useCallback(() => {
    if (duel) setDuelSettled(true)
  }, [duel])

  // Only the attacker rolls. On the other client's screen its stop is simulated.
  useEffect(() => {
    if (!duel || duelSettled || duel.by === human) return
    const timer = window.setTimeout(
      settleDuel,
      BOT_STOP_MIN_MS + Math.random() * BOT_STOP_JITTER_MS,
    )
    return () => window.clearTimeout(timer)
  }, [duel, duelSettled, human, settleDuel])

  useEffect(() => {
    if (!duel || !duelSettled) return
    const timer = window.setTimeout(() => dismissRef.current(), SETTLED_LINGER_MS)
    return () => window.clearTimeout(timer)
  }, [duel, duelSettled])

  // There is no second confirmation panel anymore. Once the server/local engine
  // reveals the first player, that player's client starts the draft automatically.
  useEffect(() => {
    if (duelOpen || lottery?.step !== 'revealed' || !canStartLottery || lotteryBusy) return
    const timer = window.setTimeout(onStartLottery, SETTLED_LINGER_MS)
    return () => window.clearTimeout(timer)
  }, [canStartLottery, duelOpen, lottery?.roll, lottery?.step, lotteryBusy, onStartLottery])

  const hint = useMemo<CeremonyHint>(() => {
    if (duelPending && !duel) return pendingStopped ? 'wait-die' : 'stop-die'
    if (duel && !duelSettled) return duel.by === human ? 'stop-die' : 'wait-die'
    if (lotteryAwaiting) return lotteryActionable ? 'stop-lottery' : 'wait-lottery'
    if (draftRunning) return draftActionable ? 'stop-piece' : 'wait-piece'
    return null
  }, [draftActionable, draftRunning, duel, duelPending, duelSettled, human, lotteryActionable, lotteryAwaiting, pendingStopped])

  useEffect(() => onHintChange?.(hint), [hint, onHintChange])

  const onDieClick = () => {
    if (duelPending && !duel && !pendingStopped) {
      setPendingStopped(true)
      return
    }
    if (duel && duelActionable) {
      settleDuel()
      return
    }
    if (!duelOpen && lotteryActionable) onRollLottery()
  }

  const shownDie = duel && duelSettled
    ? duel.attacker
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
  // Resolved, and being looked at before it closes. It keeps the look it had
  // while you were acting on it, minus the pulse — dimming it the instant it
  // settles reads as the button leaving early.
  const dieSettled = Boolean((duel && duelSettled) || (!duelOpen && lottery?.step === 'revealed'))
  const pieceSettled = Boolean(draftPick?.settled)
  const die = useLingering(diceVisible, shownDie, EXIT_MS)
  const piece = useLingering(pieceVisible, shownPiece, EXIT_MS)
  // A ceremony is running but the button is not yours to press: the opponent is
  // the one acting on it.
  // Whose ceremony this is, which outlives the acting. "The opponent is acting"
  // stops being true the moment it settles, and without the second half the
  // ring would turn from theirs to yours while the result is still on screen.
  const dieOpponent =
    (dieRunning && !dieActionable) || (dieSettled && duel != null && duel.by !== human)
  const pieceOpponent =
    (draftRunning && !draftActionable) ||
    (pieceSettled && draftPick != null && draftPick.by !== human)

  return (
    <div className="ceremony-controls" aria-live="polite">
      {die.mounted && (
        <button
          type="button"
          className={`ceremony-control${dieActionable ? ' ceremony-control--actionable' : ''}${
            dieSettled ? ' ceremony-control--settled' : ''
          }${dieOpponent ? ' ceremony-control--opponent' : ''}${
            die.leaving ? ' ceremony-control--out' : ''
          }`}
          onClick={onDieClick}
          aria-disabled={!dieActionable}
          aria-label={t('game.dieButton')}
        >
          <DieFace value={die.value} />
        </button>
      )}

      {piece.mounted && (
        <button
          type="button"
          className={`ceremony-control ceremony-control--piece${
            draftActionable ? ' ceremony-control--actionable' : ''
          }${pieceSettled ? ' ceremony-control--settled' : ''}${
            pieceOpponent ? ' ceremony-control--opponent' : ''
          }${piece.leaving ? ' ceremony-control--out' : ''}`}
          onClick={draftActionable ? onConfirmDraftPick : undefined}
          aria-disabled={!draftActionable}
          aria-label={t('game.pieceButton')}
        >
          {piece.value ? (
            <PieceIcon
              kind={piece.value}
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
