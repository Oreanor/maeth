import type { ReactNode } from 'react'
import { useAnimatedClose } from './useAnimatedClose'

/**
 * The shared modal shell: dimmed backdrop, centred panel and the uniform
 * enter/exit animation, plus Escape-to-close via `useAnimatedClose`.
 *
 * Children are given `close`, which plays the exit animation before unmounting
 * — route every dismiss affordance through it rather than calling `onClose`.
 *
 * The ceremony modals (draft pick, duel, lottery) deliberately keep their own
 * shells: they animate with the `--closing` collapse instead of this fade.
 */
export function Modal({
  className,
  appPanel = false,
  dismissible = true,
  role,
  labelledBy,
  onClose,
  children,
}: {
  /** Modifier class for the panel, e.g. `result-modal`. */
  className: string
  /** Layer above the in-game HUD, used by the Rules and Stats panels. */
  appPanel?: boolean
  /** Clear while a request is in flight to block backdrop dismissal. */
  dismissible?: boolean
  role?: string
  labelledBy?: string
  onClose: () => void
  children: (close: () => void) => ReactNode
}) {
  const { closing, close } = useAnimatedClose(onClose)
  return (
    <div
      className={`modal-backdrop${appPanel ? ' modal-backdrop--app-panel' : ''}${
        closing ? ' modal-backdrop--out' : ''
      }`}
      onClick={dismissible ? close : undefined}
    >
      <div
        className={`modal ${className}${closing ? ' modal--out' : ''}`}
        role={role}
        aria-modal={role === 'dialog' ? true : undefined}
        aria-labelledby={labelledBy}
        onClick={(event) => event.stopPropagation()}
      >
        {children(close)}
      </div>
    </div>
  )
}
