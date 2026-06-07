import { useI18n } from '@/i18n'
import { colOf, rowOf, type Board as BoardModel, type Color, type Move } from '@/game/types'
import { PIECES, isArcher, pieceBadgeAria, type PieceKind } from '@/game/pieces'
import { PieceBadge } from './PieceBadge'
import { ArrowOverlay, OWNER_COLOR, edgeArrows, moveArrows } from './ArrowOverlay'
import { MoveAnimation, type AnimInfo } from './MoveAnimation'
import { PieceIcon } from './PieceIcon'
import './Board.css'

interface BoardProps {
  board: BoardModel
  selected: number | null
  legalTargets: number[]
  /** Legal moves of the selected piece (for capture/move arrows). */
  selectedMoves: Move[]
  /** Empty cells available for dropping a piece during the draft. */
  placementTargets: number[]
  /** Cell a piece was just dropped on — briefly highlighted to draw the eye. */
  lastPlaced?: number | null
  /** Own pieces that can be picked up — they get a hover "shiver". */
  movable?: number[]
  /** Cell to show the draft ghost + arrows on (draft phase). */
  previewCell: number | null
  /** Piece kind to preview, and which side owns it. */
  previewKind: PieceKind | null
  previewOwner: Color
  /** Flip so this color sits at the bottom. */
  orientation: Color
  /** Move being animated; its pieces are drawn by the overlay, not the grid. */
  anim: AnimInfo | null
  onCellClick: (cell: number) => void
  onCellEnter?: (cell: number) => void
  onBoardLeave?: () => void
  interactive: boolean
}

export function Board({
  board,
  selected,
  legalTargets,
  selectedMoves,
  placementTargets,
  lastPlaced,
  movable,
  previewCell,
  previewKind,
  previewOwner,
  orientation,
  anim,
  onCellClick,
  onCellEnter,
  onBoardLeave,
  interactive,
}: BoardProps) {
  const { t } = useI18n()
  const order = [...board.keys()]
  const cells = orientation === 'white' ? order : order.slice().reverse()

  // While animating, hide pieces drawn by the overlay. Pre-duel aim keeps both
  // combatants visible on the grid.
  const hidden = new Set<number>()
  if (anim && anim.kind !== 'duel') {
    if (!isArcher(anim.attacker)) hidden.add(anim.from)
    if (anim.kind === 'capture') hidden.add(anim.to)
  }

  return (
    <div
      className={`board ${interactive ? '' : 'board--locked'}`}
      onMouseLeave={onBoardLeave}
    >
      {cells.map((i) => {
        const piece = hidden.has(i) ? null : board[i]
        const dark = (rowOf(i) + colOf(i)) % 2 === 1
        const isSel = selected === i
        const isTarget = legalTargets.includes(i)
        const isPlace = placementTargets.includes(i)
        const isPlaced = lastPlaced === i
        const isMovable = movable?.includes(i) ?? false
        const isPreview = previewCell === i && previewKind != null && !piece
        return (
          <button
            key={i}
            type="button"
            className={[
              'cell',
              dark ? 'cell--dark' : 'cell--light',
              isSel ? 'cell--selected' : '',
              isTarget ? 'cell--target' : '',
              isPlace ? 'cell--place' : '',
              isPlaced ? 'cell--placed' : '',
              isMovable ? 'cell--movable' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onCellClick(i)}
            onMouseEnter={() => onCellEnter?.(i)}
            aria-label={`r${rowOf(i)}c${colOf(i)}`}
          >
            {isTarget && !piece && <span className="dot" />}
            {isPreview && (
              <span className={`piece piece--ghost piece--${previewOwner}`}>
                <PieceIcon kind={previewKind} className="piece__icon" />
                <PieceBadge kind={previewKind} />
              </span>
            )}
            {piece && (
              <span
                className={[
                  'piece',
                  `piece--${piece.color}`,
                  piece.moved ? 'piece--moved' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={`${PIECES[piece.kind].name} (${pieceBadgeAria(piece.kind, t)})`}
              >
                <PieceIcon kind={piece.kind} className="piece__icon" />
                <PieceBadge kind={piece.kind} />
              </span>
            )}
          </button>
        )
      })}

      {anim ? (
        <MoveAnimation anim={anim} orientation={orientation} />
      ) : previewCell != null && previewKind ? (
        <ArrowOverlay
          cell={previewCell}
          arrows={edgeArrows(previewCell, previewKind, OWNER_COLOR[previewOwner])}
          orientation={orientation}
        />
      ) : (
        selected != null &&
        selectedMoves.length > 0 && (
          <ArrowOverlay
            cell={selected}
            arrows={moveArrows(selected, selectedMoves, board[selected]!.kind)}
            orientation={orientation}
          />
        )
      )}
    </div>
  )
}
