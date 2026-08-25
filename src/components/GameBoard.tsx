import { lazy, Suspense } from 'react'
import { useBoardView } from '@/boardView'
import { Board, type BoardProps } from './Board'
import { CELLS, type Board as BoardModel } from '@/game/types'

const ThreeBoard = lazy(() => import('./ThreeBoard').then((module) => ({ default: module.ThreeBoard })))

export function GameBoard(props: BoardProps) {
  const { viewMode } = useBoardView()

  if (viewMode === '2d') return <Board {...props} />

  return (
    <>
      <Suspense fallback={<div className="three-board-shell three-board-shell--loading" />}>
        <ThreeBoard {...props} />
      </Suspense>
      {/* The screen-reader mirror of the board. The chat is left out of it: the
          3D layer above renders the very same bubble as live text, and two of
          them would announce every line twice. */}
      <div className="three-board-a11y">
        <Board {...props} anim={null} chat={undefined} />
      </div>
    </>
  )
}

const EMPTY_BOARD: BoardModel = Array.from({ length: CELLS }, () => null)
const ignoreCell = () => undefined

/** Current board style/view rendered without pieces or interaction. */
export function EmptyGameBoard() {
  return (
    <GameBoard
      board={EMPTY_BOARD}
      selected={null}
      legalTargets={[]}
      selectedMoves={[]}
      placementTargets={[]}
      previewCell={null}
      previewKind={null}
      previewOwner="white"
      orientation="white"
      anim={null}
      onCellClick={ignoreCell}
      interactive={false}
    />
  )
}
