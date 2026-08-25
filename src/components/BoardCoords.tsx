import { SIZE, type Color } from '@/game/types'
import './BoardCoords.css'

/**
 * The ring of coordinates around the board — A–D across, 1–4 down, repeated on
 * all four sides so whichever edge you are looking along has them.
 *
 * They are what the pieces talk in: every reply names squares ("the Balrog on
 * B2"), and orders are given the same way, so the board has to say out loud
 * which square is which. Flipped with the board, so the labels always read the
 * way the player sees the position.
 */

const FILES = ['A', 'B', 'C', 'D']

/** Board-space index → the label shown at that display position. */
function labels(orientation: Color): { files: string[]; ranks: string[] } {
  const files = orientation === 'white' ? FILES : [...FILES].reverse()
  const ranks = Array.from({ length: SIZE }, (_, i) =>
    String(orientation === 'white' ? i + 1 : SIZE - i),
  )
  return { files, ranks }
}

export function BoardCoords({ orientation }: { orientation: Color }) {
  const { files, ranks } = labels(orientation)
  const at = (i: number) => `${(i + 0.5) * (100 / SIZE)}%`

  return (
    <div className="board-coords" aria-hidden>
      {files.map((file, i) => (
        <span key={`t${file}`} className="board-coords__mark board-coords__mark--top" style={{ left: at(i) }}>
          {file}
        </span>
      ))}
      {files.map((file, i) => (
        <span
          key={`b${file}`}
          className="board-coords__mark board-coords__mark--bottom"
          style={{ left: at(i) }}
        >
          {file}
        </span>
      ))}
      {ranks.map((rank, i) => (
        <span key={`l${rank}`} className="board-coords__mark board-coords__mark--left" style={{ top: at(i) }}>
          {rank}
        </span>
      ))}
      {ranks.map((rank, i) => (
        <span
          key={`r${rank}`}
          className="board-coords__mark board-coords__mark--right"
          style={{ top: at(i) }}
        >
          {rank}
        </span>
      ))}
    </div>
  )
}
