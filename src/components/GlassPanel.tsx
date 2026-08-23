import type { ElementType, HTMLAttributes, PropsWithChildren } from 'react'
import './GlassPanel.css'

type GlassPanelProps = PropsWithChildren<
  HTMLAttributes<HTMLElement> & {
    as?: ElementType
  }
>

/** Standard translucent surface for HUD and stage overlays. */
export function GlassPanel({
  as: Component = 'div',
  className,
  children,
  ...props
}: GlassPanelProps) {
  return (
    <Component className={`glass-panel${className ? ` ${className}` : ''}`} {...props}>
      {children}
    </Component>
  )
}
