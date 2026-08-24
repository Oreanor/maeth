import { useState } from 'react'
import { useI18n } from '@/i18n'
import { colOf, rowOf, type Board as BoardModel, type Color, type Move } from '@/game/types'
import { isArcher, pieceBadgeAria, pieceName, type PieceKind } from '@/game/pieces'
import type { AnimInfo } from '@/game/presentation'
import { PieceBadge } from './PieceBadge'
import { ArrowOverlay, OWNER_COLOR, edgeArrows, moveArrows } from './ArrowOverlay'
import { MoveAnimation } from './MoveAnimation'
import { PieceIcon } from './PieceIcon'
import './Board.css'

export interface BoardProps {
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
  // Hover-to-inspect, matching the 3D board: works on either side's pieces and
  // whoever's turn it is, so it is deliberately not gated on `interactive`.
  const [hoverCell, setHoverCell] = useState<number | null>(null)
  const hoveredPiece = hoverCell != null ? board[hoverCell] : null
  const order = [...board.keys()]
  const cells = orientation === 'white' ? order : order.slice().reverse()

  // While animating, hide grid pieces drawn by the overlay. Archer shots keep the
  // shooter on `from`; archer slides and other moves hide `from`.
  const hidden = new Set<number>()
  if (anim && anim.kind !== 'duel') {
    const archerShot = isArcher(anim.attacker) && anim.kind === 'capture'
    if (!archerShot) hidden.add(anim.from)
    if (anim.kind === 'capture') hidden.add(anim.to)
  }

  return (
    <div
      className={`board ${interactive ? '' : 'board--locked'}`}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return
        setHoverCell(null)
        onBoardLeave?.()
      }}
    >
      {cells.map((i) => {
        const piece = hidden.has(i) ? null : board[i]
        const isSel = selected === i
        const isTarget = legalTargets.includes(i)
        const isPlace = placementTargets.includes(i)
        const isPlaced = lastPlaced === i
        const isMovable = movable?.includes(i) ?? false
        const isPreview = previewCell === i && previewKind != null && !piece
        const square = `r${rowOf(i) + 1}c${colOf(i) + 1}`
        const content = piece
          ? `${t(`board.${piece.color}`)} ${pieceName(piece.kind, t)} (${pieceBadgeAria(piece.kind, t)})`
          : isPreview && previewKind
            ? `${t(`board.${previewOwner}`)} ${pieceName(previewKind, t)} (${pieceBadgeAria(previewKind, t)})`
            : t('board.empty')
        const cellState = [
          content,
          isSel ? t('board.selected') : null,
          isTarget ? t('board.legalTarget') : null,
          isPlace ? t('board.placementTarget') : null,
          piece?.moved ? t('board.moved') : null,
        ]
          .filter((value): value is string => value != null)
          .join(', ')
        return (
          <button
            key={i}
            type="button"
            className={[
              'cell',
              isSel ? 'cell--selected' : '',
              isTarget ? 'cell--target' : '',
              isPlace ? 'cell--place' : '',
              isPlaced ? 'cell--placed' : '',
              isMovable ? 'cell--movable' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              if (interactive) onCellClick(i)
            }}
            onPointerEnter={(event) => {
              // A tap synthesises enter just before click; letting it set the
              // preview would make the first tap confirm the placement outright.
              // Only a hovering cursor previews — touch previews via onCell.
              if (event.pointerType !== 'mouse') return
              setHoverCell(i)
              if (interactive) onCellEnter?.(i)
            }}
            aria-label={t('board.cell', { square, content: cellState })}
            aria-pressed={isSel}
            aria-disabled={!interactive}
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
      ) : selected != null && selectedMoves.length > 0 ? (
        <ArrowOverlay
          cell={selected}
          arrows={moveArrows(selected, selectedMoves, board[selected]!.kind)}
          orientation={orientation}
        />
      ) : (
        hoverCell != null &&
        hoveredPiece &&
        !hoveredPiece.moved && (
          <ArrowOverlay
            cell={hoverCell}
            arrows={edgeArrows(hoverCell, hoveredPiece.kind, OWNER_COLOR[hoveredPiece.color])}
            orientation={orientation}
          />
        )
      )}
    </div>
  )
}
