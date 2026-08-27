import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { THREE_PIECE_SPRITE_URL, useBoardView } from '@/boardView'
import { pieceName, type PieceKind } from '@/game/pieces'
import { SIZE, type Board, type Color } from '@/game/types'
import { cellAtDisplay, displayCell } from './boardGeometry'
import type { PieceChat } from '@/chat/usePieceChat'
import type { Speech } from '@/chat/speech'
import { PieceIcon } from './PieceIcon'
import './PieceChat.css'

/**
 * Talking to the pieces.
 *
 * Three parts that all read the same conversation: the little cloud that
 * appears on a hovered piece, the bubble that hangs over its head, and the bar
 * above the log where the player writes back. Sending clears the bubble — the
 * piece is thinking — and the next line replaces it.
 */

/**
 * Which piece's cloud is on screen, and the handlers that keep it there.
 *
 * The cloud hangs off the piece — in the corner of its square on the flat
 * board, over its head on the 3D one — so reaching for it means leaving the
 * piece, and a cloud tied straight to the hover vanishes from under the cursor
 * on the way. It therefore lingers for a moment after the piece is left, and
 * stays put indefinitely while the pointer is on the cloud itself.
 */
export function useCloudTarget(
  hovered: number | null,
  holdMs = 700,
): { cell: number | null; hold: { onPointerEnter: () => void; onPointerLeave: () => void } } {
  const [shown, setShown] = useState<number | null>(hovered)
  const pinned = useRef(false)
  const timer = useRef<number | null>(null)

  const clearTimer = () => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
  }

  const scheduleClear = useCallback(() => {
    clearTimer()
    timer.current = window.setTimeout(() => {
      if (!pinned.current) setShown(null)
    }, holdMs)
  }, [holdMs])

  useEffect(() => {
    if (hovered != null) {
      clearTimer()
      setShown(hovered)
      return
    }
    if (pinned.current) return
    scheduleClear()
    return clearTimer
  }, [hovered, scheduleClear])

  useEffect(() => clearTimer, [])

  const hold = useMemo(
    () => ({
      onPointerEnter: () => {
        pinned.current = true
        clearTimer()
      },
      onPointerLeave: () => {
        pinned.current = false
        scheduleClear()
      },
    }),
    [scheduleClear],
  )

  return { cell: shown, hold }
}

/** Cloud on a hovered piece: the invitation to talk. */
export function ChatCloudButton({
  onClick,
  className = '',
  title,
}: {
  onClick: () => void
  className?: string
  title: string
}) {
  return (
    <button
      type="button"
      className={`chat-cloud ${className}`.trim()}
      title={title}
      aria-label={title}
      onClick={(event) => {
        // The cloud sits over a board cell; clicking it must not also pick the
        // piece up or drop one onto that square.
        event.stopPropagation()
        onClick()
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <MessageCircle aria-hidden />
    </button>
  )
}

/** What the piece is saying. Thinking shows three dots instead of words. */
export function SpeechBubble({
  text,
  thinking,
  hostile,
  tail = 'none',
  className = '',
}: {
  text: string | null
  thinking: boolean
  hostile: boolean
  /** 'inside' draws the tail on the bubble itself (3D, nothing clips it). */
  tail?: 'none' | 'inside'
  className?: string
}) {
  return (
    <div
      className={[
        'speech-bubble',
        hostile ? 'speech-bubble--hostile' : 'speech-bubble--ally',
        tail === 'inside' ? 'speech-bubble--tailed' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
    >
      {thinking || !text ? (
        <span className="speech-bubble__dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      ) : (
        text
      )}
    </div>
  )
}

/** Where a cell sits on the board as it is drawn, in per-cent of its side. */
function cellAnchor(cell: number, orientation: Color) {
  const { row, col } = displayCell(cell, orientation)
  return { row, col, centreX: (col + 0.5) * (100 / SIZE) }
}

/**
 * The cloud and the bubble over the flat board. The bubble is centred on the
 * board rather than on the piece — the board clips whatever leaves it, and a
 * bubble over a corner square would be cut in half. Only the tail moves, and it
 * is what points at the speaker.
 */
export function BoardChatLayer({
  chat,
  ambient,
  board,
  hoverCell,
  orientation,
  locked,
}: {
  chat: PieceChat
  /** A line the board said to itself — shown only when nobody is being talked to. */
  ambient: Speech | null
  board: Board
  hoverCell: number | null
  orientation: Color
  /** The board is not taking clicks — the ceremony or the opponent has it. */
  locked: boolean
}) {
  const { t } = useI18n()
  // A locked board turns pointer events off wholesale, so the cells stop
  // reporting hover exactly when there is most time to talk: during the
  // opponent's turn. Then the layer catches the pointer itself.
  const [caught, setCaught] = useState<number | null>(null)
  useEffect(() => {
    if (!locked) setCaught(null)
  }, [locked])

  const hovered = hoverCell ?? caught
  const onPiece = hovered != null && board[hovered] ? hovered : null
  const { cell: lingering, hold } = useCloudTarget(onPiece)

  if (!chat.available) return null

  const cloudCell =
    lingering != null && board[lingering] && lingering !== chat.cell ? lingering : null
  // One bubble at a time: the conversation the player opened wins, and the
  // board's own chatter fills the silence around it.
  // One bubble at a time, and one shape for it: the conversation the player
  // opened wins, and the board's own chatter fills the silence around it.
  const bubble = chat.speech ?? ambient
  const speaking = bubble && board[bubble.cell] ? bubble : null

  /** Which cell the pointer is over, from where it fell on the layer. */
  const cellUnder = (event: { currentTarget: HTMLElement; clientX: number; clientY: number }) => {
    const box = event.currentTarget.getBoundingClientRect()
    const col = Math.floor(((event.clientX - box.left) / box.width) * SIZE)
    const row = Math.floor(((event.clientY - box.top) / box.height) * SIZE)
    return cellAtDisplay(row, col, orientation)
  }

  return (
    <div
      className={`board-chat ${locked ? 'board-chat--catching' : ''}`.trim()}
      onPointerMove={locked ? (event) => setCaught(cellUnder(event)) : undefined}
      // A finger reports no hover at all, only the tap.
      onPointerDown={locked ? (event) => setCaught(cellUnder(event)) : undefined}
      onPointerLeave={
        locked
          ? (event) => {
              // A touch pointer stops existing the moment the finger lifts, so
              // leave arrives right behind the tap that chose the piece. Only a
              // cursor actually going away should take the cloud with it.
              if (event.pointerType === 'mouse') setCaught(null)
            }
          : undefined
      }
    >
      {cloudCell != null && (
        <div
          className="board-chat__cloud"
          {...hold}
          style={{
            left: `${(cellAnchor(cloudCell, orientation).col + 1) * (100 / SIZE)}%`,
            // A twentieth of the board below the top of the square: level with
            // the piece's head rather than floating off the corner.
            top: `${cellAnchor(cloudCell, orientation).row * (100 / SIZE) + 5}%`,
          }}
        >
          <ChatCloudButton onClick={() => chat.open(cloudCell)} title={t('chat.talk')} />
        </div>
      )}

      {speaking &&
        (() => {
          const { row, centreX } = cellAnchor(speaking.cell, orientation)
          // The top rank has no room above it, so its bubble drops below the
          // piece and the tail turns over.
          const below = row === 0
          const anchor = `${(below ? row + 1 : row) * (100 / SIZE)}%`
          return (
            <>
              <div
                className="board-chat__bubble"
                style={{
                  top: anchor,
                  transform: below ? 'translate(-50%, 10px)' : 'translate(-50%, calc(-100% - 10px))',
                }}
              >
                <SpeechBubble
                  text={speaking.text}
                  thinking={speaking.thinking === true}
                  hostile={speaking.hostile}
                />
              </div>
              <span
                className={`board-chat__tail board-chat__tail--${below ? 'up' : 'down'}`}
                style={{ left: `${centreX}%`, top: anchor }}
                aria-hidden
              />
            </>
          )
        })()}
    </div>
  )
}

/**
 * The bar above the log: who is being talked to, and the field to answer them
 * in. It closes on Escape, and closing ends the conversation — the bubble goes
 * with it.
 */
export function PieceChatBar({ chat }: { chat: PieceChat }) {
  const { t } = useI18n()
  // The same artwork the draft carousel deals from, so the piece you are
  // talking to looks like the piece you were handed.
  const { viewMode, threePieceStyle } = useBoardView()
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const cell = chat.cell
  const kind = chat.kind

  useEffect(() => {
    if (cell != null) inputRef.current?.focus()
  }, [cell])

  // A new conversation starts with an empty field, whatever was left in it.
  useEffect(() => {
    setText('')
  }, [cell])

  if (cell == null || kind == null) return null

  const submit = () => {
    const value = text.trim()
    if (!value || chat.thinking) return
    chat.send(value)
    setText('')
  }

  return (
    <form
      className="piece-chat"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') chat.close()
      }}
    >
      <div className="piece-chat__who">
        <PieceIcon
          kind={kind}
          className="piece-chat__icon"
          spriteUrl={viewMode === '3d' ? THREE_PIECE_SPRITE_URL[threePieceStyle] : undefined}
        />
        <span className="piece-chat__name">{pieceName(kind as PieceKind, t)}</span>
        <span
          className={`piece-chat__side piece-chat__side--${chat.hostile ? 'enemy' : 'ally'}`}
        >
          {t(chat.hostile ? 'chat.enemy' : 'chat.ally')}
        </span>
        <button type="button" className="piece-chat__close" onClick={chat.close} aria-label={t('common.close')}>
          <X aria-hidden />
        </button>
      </div>

      <div className="piece-chat__row">
        <input
          ref={inputRef}
          className="piece-chat__input"
          value={text}
          placeholder={t('chat.placeholder')}
          onChange={(event) => setText(event.target.value)}
          maxLength={200}
        />
        <button
          type="submit"
          className="piece-chat__send"
          disabled={!text.trim() || chat.thinking}
          aria-label={t('chat.send')}
        >
          <Send aria-hidden />
        </button>
      </div>
    </form>
  )
}
