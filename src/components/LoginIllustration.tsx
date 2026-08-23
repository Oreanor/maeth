import { useMemo, type ReactNode } from 'react'
import { pickLoginIllustration } from '@/login/illustrations'

export function LoginIllustration({ overlay }: { overlay?: ReactNode }) {
  const src = useMemo(() => pickLoginIllustration(), [])

  return (
    <div className="login-hero">
      <img className="login-illustration" src={src} alt="" draggable={false} />
      {overlay}
    </div>
  )
}
