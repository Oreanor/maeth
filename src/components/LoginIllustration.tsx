import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { cutFor, illustrationSrc, pickIllustration, type CutName } from '@/login/illustrations'

/**
 * The lobby backdrop: one illustration, picked once, in whichever of its four
 * cuts fits the window best. The picture stays the same across a resize — only
 * the cut changes, and only when the window crosses into another shape, so
 * dragging a window edge does not restart the artwork.
 */
export function LoginIllustration({ overlay }: { overlay?: ReactNode }) {
  const art = useMemo(() => pickIllustration(), [])
  const [cut, setCut] = useState<CutName>(() => cutFor(window.innerWidth, window.innerHeight))

  useEffect(() => {
    const onResize = () => setCut(cutFor(window.innerWidth, window.innerHeight))
    window.addEventListener('resize', onResize)
    // Turning a phone over reports its new size a beat after the event on some
    // browsers, so the orientation change is followed by a second look.
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  const src = useMemo(
    () => illustrationSrc(art, window.innerWidth, window.innerHeight),
    // `cut` is what actually changes; the window size is read at the same moment.
    [art, cut],
  )

  return (
    <div className="login-hero">
      <img className="login-illustration" src={src} alt="" draggable={false} />
      {overlay}
    </div>
  )
}
