import { useEffect, useRef } from 'react'

/**
 * Modal accessibility helper: closes on Escape (when `onClose` is given) and
 * restores focus to whatever was focused before the modal opened, on unmount.
 * `onClose` is read through a ref so an inline handler doesn't re-bind it.
 */
export function useModalDismiss(onClose?: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCloseRef.current) {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [])
}
