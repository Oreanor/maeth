import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Smooth height when modal body content swaps or grows (e.g. turn lottery steps). */
export function ModalContentSizer({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  const [animate, setAnimate] = useState(false)

  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner) return

    const sync = () => {
      const next = inner.offsetHeight
      setHeight((prev) => (prev === next ? prev : next))
    }
    sync()

    const frame = requestAnimationFrame(() => setAnimate(true))
    const ro = new ResizeObserver(sync)
    ro.observe(inner)

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [])

  return (
    <div
      className={[
        'modal-content-sizer',
        animate ? 'modal-content-sizer--animate' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ height: height ?? 'auto' }}
    >
      <div ref={innerRef} className="modal-content-sizer__inner">
        {children}
      </div>
    </div>
  )
}
