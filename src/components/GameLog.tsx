import { useEffect, useRef } from 'react'
import type { LogColor, LogEntry } from '@/game/actionLog'
import './GameLog.css'

/** Scrollable play-by-play log; always pins to the latest line. */
export function GameLog({
  entries,
  statusLine,
  statusColor,
}: {
  entries: LogEntry[]
  statusLine?: string | null
  statusColor?: LogColor | null
}) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [entries, statusLine])

  return (
    <div className="gamelog">
      <div className="gamelog__scroll" role="log" aria-live="polite">
        {entries.map((entry, i) => (
          <div key={i} className={`gamelog__line gamelog__line--${entry.color}`}>
            {entry.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {statusLine ? (
        <div
          className={`gamelog__status ${
            statusColor ? `gamelog__status--${statusColor}` : ''
          }`.trim()}
        >
          {statusLine}
        </div>
      ) : null}
    </div>
  )
}
