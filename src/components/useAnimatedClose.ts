import { useCallback, useEffect, useRef, useState } from 'react'
import { useModalDismiss } from './useModalDismiss'

/** Matches the `.modal--out` / `.modal-backdrop--out` CSS animation duration. */
const EXIT_MS = 180

/**
 * Uniform modal close: flips `closing` true so the exit animation can play, then
 * calls `onClose` (which unmounts the modal) once it's finished. Also wires
 * Escape-to-close and focus restoration. Route dismiss affordances (backdrop,
 * cancel/close buttons) through the returned `close`.
 */
export function useAnimatedClose(onClose: () => void): { closing: boolean; close: () => void } {
  const [closing, setClosing] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const close = useCallback(() => {
    setClosing((alreadyClosing) => {
      if (alreadyClosing) return true
      timer.current = setTimeout(() => onCloseRef.current(), EXIT_MS)
      return true
    })
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])
  useModalDismiss(close)

  return { closing, close }
}
