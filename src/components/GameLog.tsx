import { useEffect, useRef } from 'react'
import type { LogColor, LogEntry } from '@/game/actionLog'
import { GlassPanel } from './GlassPanel'
import './GameLog.css'

/** Scrollable play-by-play log; always pins to the latest line. */
export function GameLog({
  entries,
  statusLine,
  statusColor,
  statusAction,
}: {
  entries: LogEntry[]
  statusLine?: string | null
  statusColor?: LogColor | null
  /** Shown in the status strip instead of a hint (e.g. play again after viewing the board). */
  statusAction?: { label: string; onClick: () => void; disabled?: boolean }
}) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [entries, statusLine, statusAction?.label])

  return (
    <GlassPanel className="gamelog">
      {entries.length > 0 ? (
        <div className="gamelog__scroll" role="log" aria-live="polite">
          {entries.map((entry, i) => (
            <div key={i} className={`gamelog__line gamelog__line--${entry.color}`}>
              {entry.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      ) : null}
      {statusLine || statusAction ? (
        <div
          className={`gamelog__status ${
            statusAction ? 'gamelog__status--action' : ''
          } ${entries.length === 0 ? 'gamelog__status--only' : ''} ${
            statusColor ? `gamelog__status--${statusColor}` : ''
          }`.trim()}
        >
          {statusLine}
          {statusAction ? (
            <button
              type="button"
              className="btn btn--primary btn--sm gamelog__action"
              onClick={statusAction.onClick}
              disabled={statusAction.disabled}
            >
              {statusAction.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </GlassPanel>
  )
}
