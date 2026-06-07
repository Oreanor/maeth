import { useEffect, useState } from 'react'
import { PICK_OPEN_DELAY_MS } from './timing'

/**
 * Gates when the draft pick modal may open. The first pick (slot 0) is immediate;
 * after each piece lands (slot ≥ 1) the ceremony stays closed for a beat so the
 * board is visible before the next roulette.
 */
export function useDelayedCeremonySlot(immediateSlot: number): number {
  const [ceremonySlot, setCeremonySlot] = useState(-1)

  useEffect(() => {
    if (immediateSlot < 0) {
      setCeremonySlot(-1)
      return
    }
    if (immediateSlot === 0) {
      setCeremonySlot(0)
      return
    }
    setCeremonySlot(-1)
    const id = setTimeout(() => setCeremonySlot(immediateSlot), PICK_OPEN_DELAY_MS)
    return () => clearTimeout(id)
  }, [immediateSlot])

  return ceremonySlot
}
