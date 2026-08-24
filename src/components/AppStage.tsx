import type { PropsWithChildren } from 'react'
import { useBoardView } from '@/boardView'
import { FpsMeter } from './FpsMeter'

/** Shared 4:3 application stage used by both the lobby and an active game. */
export function AppStage({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  const { viewMode } = useBoardView()
  const classes = [
    'screen',
    'screen--game',
    'app-stage',
    viewMode === '3d' ? 'screen--game-3d app-stage--3d' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <main className={classes}>
      {children}
      <FpsMeter />
    </main>
  )
}
