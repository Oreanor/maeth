import { useCallback, useEffect, useRef, useState } from 'react'
import type { Color } from './types'
import type { PieceKind } from './pieces'
import { PICK_CLOSE_MS, PICK_OPEN_DELAY_MS, PICK_REVEAL_MS } from './timing'

/** The blind-draw reveal: spinning portraits that settle on the drawn piece. */
export interface DraftPick {
  /** Whose pick this is. */
  by: Color
  /** Pieces still in the bag (incl. the drawn one) — cycled while spinning. */
  pool: PieceKind[]
  /** The drawn piece once the pick settles; null while still spinning. */
  settled: PieceKind | null
  /** True while the modal plays its shrink-to-a-point close animation. */
  closing?: boolean
}

export interface DraftPickConfig {
  /** Draft slot (count of placed pieces); -1 when no pick should be active. */
  slot: number
  /** Whose pick this is (for the modal), or null. */
  by: Color | null
  /** Candidate pieces (deck + drawn) at open time — read fresh. */
  pool: () => PieceKind[]
  /** The actually-drawn piece at confirm time — read fresh. */
  drawn: () => PieceKind | null
  /** Delay the modal opening so a just-placed piece is seen first. */
  openDelay: boolean
  /** Bot only: ms before auto-confirming a pick of `by`; null/absent = manual. */
  autoConfirmMs?: (by: Color) => number | null
}

export interface DraftPickState {
  /** The reveal in progress, or null. */
  pick: DraftPick | null
  /** True once the reveal has fully closed — placement may begin. */
  pickReady: boolean
  /** Settle the spinning portrait on the drawn piece (tap, or bot auto). */
  confirm: () => void
  /** Cancel any in-flight ceremony and clear state (for a local rematch). */
  reset: () => void
}

/**
 * Drives the draft "roulette": when a new piece is drawn (the slot changes), the
 * modal opens (optionally after a beat), spins until confirmed (by a tap or a
 * bot timer), lingers on the drawn piece, then shrinks closed — only then is
 * `pickReady` true and the piece may be placed. Shared by the bot and the
 * networked game; the caller supplies fresh `pool`/`drawn` closures and, for the
 * bot, an `autoConfirmMs`.
 */
export function useDraftPick(cfg: DraftPickConfig): DraftPickState {
  const [pick, setPick] = useState<DraftPick | null>(null)
  const [pickReady, setPickReady] = useState(false)
  const slotRef = useRef(-1)
  const openTimer = useRef<ReturnType<typeof setTimeout>>()
  const revealTimer = useRef<ReturnType<typeof setTimeout>>()
  const autoTimer = useRef<ReturnType<typeof setTimeout>>()
  // Latest closures so the effects can key purely on `slot`/`pick` and still read
  // fresh state when a timer eventually fires.
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const confirm = useCallback(() => {
    const drawn = cfgRef.current.drawn()
    setPick((p) => (p && p.settled == null && drawn != null ? { ...p, settled: drawn } : p))
  }, [])

  const reset = useCallback(() => {
    clearTimeout(openTimer.current)
    clearTimeout(revealTimer.current)
    clearTimeout(autoTimer.current)
    slotRef.current = -1
    setPick(null)
    setPickReady(false)
  }, [])

  // Start a fresh ceremony each time the slot changes.
  useEffect(() => {
    if (cfg.slot < 0) {
      slotRef.current = -1
      setPick(null)
      setPickReady(false)
      return
    }
    if (slotRef.current === cfg.slot) return
    slotRef.current = cfg.slot
    setPickReady(false)
    setPick(null)
    const open = () => {
      const c = cfgRef.current
      if (c.by == null) return
      setPick({ by: c.by, pool: c.pool(), settled: null })
    }
    if (cfg.openDelay) {
      openTimer.current = setTimeout(open, PICK_OPEN_DELAY_MS)
      return () => clearTimeout(openTimer.current)
    }
    open()
  }, [cfg.slot, cfg.openDelay])

  // Bot only: auto-confirm a spinning pick after its "thinking" delay.
  useEffect(() => {
    if (!pick || pick.settled != null) return
    const ms = cfgRef.current.autoConfirmMs?.(pick.by)
    if (ms == null) return
    autoTimer.current = setTimeout(confirm, ms)
    return () => clearTimeout(autoTimer.current)
  }, [pick, confirm])

  // Once settled: linger on the portrait, then the shrink close, then ready.
  useEffect(() => {
    if (!pick || pick.settled == null) return
    if (pick.closing) {
      revealTimer.current = setTimeout(() => {
        setPick(null)
        setPickReady(true)
      }, PICK_CLOSE_MS)
    } else {
      revealTimer.current = setTimeout(() => {
        setPick((p) => (p ? { ...p, closing: true } : p))
      }, PICK_REVEAL_MS)
    }
    return () => clearTimeout(revealTimer.current)
  }, [pick])

  return { pick, pickReady, confirm, reset }
}
