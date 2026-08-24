import { useEffect, useRef } from 'react'
import type { LogEntry } from '@/game/actionLog'
import { GlassPanel } from './GlassPanel'
import './GameLog.css'

/** Scrollable play-by-play log; always pins to the latest line. What to do next
 *  lives under the scoreboard instead — this is a record of what already
 *  happened. */
export function GameLog({ entries }: { entries: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [entries])

  return (
    <GlassPanel className="gamelog">
      {/* Rendered even while empty. It used to borrow its height from the status
          strip that has since moved to the scoreboard, so waiting for an
          opponent collapsed the panel to a line and then jolted it open. */}
      <div className="gamelog__scroll" role="log" aria-live="polite">
        {entries.map((entry, i) => (
          <div key={i} className={`gamelog__line gamelog__line--${entry.color}`}>
            {entry.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </GlassPanel>
  )
}
