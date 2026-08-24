import { useEffect, useState } from 'react'
import './FpsMeter.css'

/** How often the reading refreshes. Short enough to catch a stutter, long
 *  enough that the number is readable rather than flickering. */
const SAMPLE_MS = 500

/**
 * Frame rate in the corner.
 *
 * Deliberately its own component with its own state: the reading changes twice
 * a second, and keeping it here means those re-renders never reach the board.
 */
export function FpsMeter() {
  const [fps, setFps] = useState<number | null>(null)

  useEffect(() => {
    let frames = 0
    let since = performance.now()
    let raf = 0

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      frames += 1
      const elapsed = now - since
      if (elapsed >= SAMPLE_MS) {
        setFps(Math.round((frames * 1000) / elapsed))
        frames = 0
        since = now
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (fps == null) return null
  const grade = fps >= 50 ? 'good' : fps >= 30 ? 'fair' : 'poor'
  return (
    <div className={`fps-meter fps-meter--${grade}`} aria-hidden>
      {fps} fps
    </div>
  )
}
