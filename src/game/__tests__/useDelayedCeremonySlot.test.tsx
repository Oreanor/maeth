// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { useDelayedCeremonySlot } from '../useDelayedCeremonySlot'
import { useDraftPick } from '../useDraftPick'
import { PICK_OPEN_DELAY_MS } from '../timing'

// Tiny probe component that surfaces the hook's output.
function Probe({ slot, sink }: { slot: number; sink: (v: number) => void }) {
  sink(useDelayedCeremonySlot(slot))
  return null
}

// Probe that wires the delay into the real pick ceremony and reports whether the
// roulette modal would be open (pick != null) — the thing the player sees.
function PickProbe({ slot, sink }: { slot: number; sink: (open: boolean) => void }) {
  const ceremonySlot = useDelayedCeremonySlot(slot)
  const { pick } = useDraftPick({
    slot: ceremonySlot,
    by: 'white',
    pool: () => ['king'],
    drawn: () => 'king',
  })
  sink(pick != null)
  return null
}

describe('useDelayedCeremonySlot', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('opens the first pick (slot 0) immediately', () => {
    let latest = -99
    act(() => {
      render(<Probe slot={0} sink={(v) => (latest = v)} />)
    })
    expect(latest).toBe(0)
  })

  it('holds a later slot closed for the delay, then opens it', () => {
    let latest = -99
    const sink = (v: number) => (latest = v)
    let rerender!: (ui: React.ReactElement) => void

    act(() => {
      const r = render(<Probe slot={0} sink={sink} />)
      rerender = r.rerender
    })
    expect(latest).toBe(0)

    // A piece lands → slot advances to 1. The ceremony must NOT open instantly.
    act(() => {
      rerender(<Probe slot={1} sink={sink} />)
    })
    expect(latest).toBe(-1) // held closed during the pause

    act(() => {
      vi.advanceTimersByTime(PICK_OPEN_DELAY_MS - 1)
    })
    expect(latest).toBe(-1) // still closed just before the delay elapses

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(latest).toBe(1) // opens only after the full delay
  })

  it('keeps the roulette modal closed during the post-placement pause', () => {
    let open = false
    const sink = (v: boolean) => (open = v)
    let rerender!: (ui: React.ReactElement) => void

    act(() => {
      const r = render(<PickProbe slot={0} sink={sink} />)
      rerender = r.rerender
    })
    expect(open).toBe(true) // first pick opens at once

    act(() => {
      rerender(<PickProbe slot={1} sink={sink} />) // a piece landed
    })
    expect(open).toBe(false) // modal must not pop instantly

    act(() => vi.advanceTimersByTime(PICK_OPEN_DELAY_MS - 1))
    expect(open).toBe(false) // still closed mid-pause

    act(() => vi.advanceTimersByTime(1))
    expect(open).toBe(true) // opens only after the delay
  })
})
