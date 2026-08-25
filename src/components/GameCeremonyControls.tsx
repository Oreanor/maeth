import { useEffect, useMemo, useRef, useState } from 'react'
import { THREE_PIECE_SPRITE_URL, useBoardView } from '@/boardView'
import { useI18n } from '@/i18n'
import type { DraftPick, DuelEvent } from '@/game/useGame'
import type { Color, LotteryState } from '@/game/types'
import type { PieceKind } from '@/game/pieces'
import { Coin } from './Coin'
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
/** The coin turns on its own for about this long, then it is thrown. */
const COIN_SPIN_MS = 1400
const COIN_SPIN_JITTER_MS = 500
/** And the side it came down on is left up long enough to be read. */
const COIN_READ_MS = 2200

export type CeremonyHint =
  /** The coin is in the air over the first turn, or over a contested strike. */
  | 'coin-lottery'
  | 'coin-duel'
  | 'stop-piece'
  | 'wait-piece'
  | null

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
  const [pieceSpin, setPieceSpin] = useState<PieceKind | null>(null)
  const [duelSettled, setDuelSettled] = useState(false)
  const dismissRef = useRef(onDismissDuel)
  dismissRef.current = onDismissDuel

  const duelOpen = duelPending || duel != null
  const lotteryAwaiting = lottery?.step === 'await_roll'
  /** Whose client actually asks the engine for the throw. */
  const lotteryMine = Boolean(lotteryAwaiting && canRollLottery && !lotteryBusy)

  const draftRunning = Boolean(draftPick && draftPick.settled == null && !draftPick.closing)
  const draftActionable = Boolean(draftRunning && draftPick?.by === human)

  useEffect(() => {
    if (!lotteryMine || duelOpen) return
    const timer = window.setTimeout(
      onRollLottery,
      COIN_SPIN_MS + Math.random() * COIN_SPIN_JITTER_MS,
    )
    return () => window.clearTimeout(timer)
  }, [duelOpen, lotteryMine, onRollLottery])

  const draftPool = draftPick?.pool
  useEffect(() => {
    if (!draftRunning || !draftPool?.length) return
    setPieceSpin((kind) => pickOther(draftPool, kind))
    return spin(() => setPieceSpin((kind) => pickOther(draftPool, kind)))
  }, [draftPool, draftRunning])

  // Nobody stops this coin either. It turns for as long as it takes to watch,
  // and comes down on whatever the engine already decided; on a remote game the
  // roll may still be in the air, and then it simply keeps turning until it
  // lands.
  useEffect(() => {
    if (!duel) {
      setDuelSettled(false)
      return
    }
    const timer = window.setTimeout(
      () => setDuelSettled(true),
      COIN_SPIN_MS + Math.random() * COIN_SPIN_JITTER_MS,
    )
    return () => window.clearTimeout(timer)
  }, [duel])

  // Struck or turned aside, the answer stays up long enough to be read before
  // the board moves on.
  useEffect(() => {
    if (!duel || !duelSettled) return
    const timer = window.setTimeout(() => dismissRef.current(), COIN_READ_MS)
    return () => window.clearTimeout(timer)
  }, [duel, duelSettled])

  // There is no second confirmation panel anymore. Once the server/local engine
  // reveals the first player, that player's client starts the draft automatically.
  useEffect(() => {
    if (duelOpen || lottery?.step !== 'revealed' || !canStartLottery || lotteryBusy) return
    const timer = window.setTimeout(onStartLottery, COIN_READ_MS)
    return () => window.clearTimeout(timer)
  }, [canStartLottery, duelOpen, lottery?.roll, lottery?.step, lotteryBusy, onStartLottery])

  const hint = useMemo<CeremonyHint>(() => {
    if (duelOpen && !duelSettled) return 'coin-duel'
    if (lotteryAwaiting) return 'coin-lottery'
    if (draftRunning) return draftActionable ? 'stop-piece' : 'wait-piece'
    return null
  }, [draftActionable, draftRunning, duelOpen, duelSettled, lotteryAwaiting])

  useEffect(() => onHintChange?.(hint), [hint, onHintChange])

  // The engine rolls a die; the coin shows which way it came out. Side one is
  // the odd roll: the first player in the lottery, the blow landing in a duel.
  const coinSide =
    duel && duelSettled
      ? duel.success
        ? ('one' as const)
        : ('two' as const)
      : !duelOpen && lottery?.step === 'revealed' && lottery.roll != null
        ? lottery.roll % 2 === 1
          ? ('one' as const)
          : ('two' as const)
        : null
  /** Whose colour the frame takes once it has landed: the winner of the throw. */
  const coinWinner: Color | null =
    duel && duelSettled
      ? duel.success
        ? duel.by
        : duel.by === 'white'
          ? 'black'
          : 'white'
      : !duelOpen && lottery?.step === 'revealed'
        ? (lottery.firstTurn ?? null)
        : null
  const shownPiece = draftPick?.settled ?? pieceSpin
  // One control at a time, centred on the board, and only while a ceremony is
  // actually running — the two idle corner buttons are gone. A duel or the
  // lottery cannot coincide with a draft pick, but the die takes precedence if
  // that ever changes.
  const coinVisible = duelOpen || lottery != null
  const pieceVisible = !coinVisible && draftPick != null
  // Resolved, and being looked at before it closes. It keeps the look it had
  // while you were acting on it, minus the pulse — dimming it the instant it
  // settles reads as the button leaving early.
  const pieceSettled = Boolean(draftPick?.settled)
  const coin = useLingering(coinVisible, coinSide, EXIT_MS)
  const winner = useLingering(coinVisible, coinWinner, EXIT_MS)
  const piece = useLingering(pieceVisible, shownPiece, EXIT_MS)
  // A ceremony is running but the button is not yours to press: the opponent is
  // the one acting on it.
  // Whose ceremony this is, which outlives the acting. "The opponent is acting"
  // stops being true the moment it settles, and without the second half the
  // ring would turn from theirs to yours while the result is still on screen.
  const pieceOpponent =
    (draftRunning && !draftActionable) ||
    (pieceSettled && draftPick != null && draftPick.by !== human)

  return (
    <div className="ceremony-controls" aria-live="polite">
      {coin.mounted && (
        <div
          className={`ceremony-control ceremony-control--coin${
            winner.value ? ` ceremony-control--won-${winner.value}` : ''
          }${coin.leaving ? ' ceremony-control--out' : ''}`}
          aria-label={t('lottery.status')}
        >
          <Coin side={coin.value} spinning={coin.value == null} />
        </div>
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
