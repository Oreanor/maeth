import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n'
import { PIECES, type PieceKind } from '@/game/pieces'
import { legalMovesFrom } from '@/game/engine'
import { cellSquare, squareCell } from '@/game/notation'
import type { Color, GameState } from '@/game/types'
import { useChatSettings } from './ChatSettings'
import { adviseHuman } from './advice'
import { log } from './log'
import { speechFrom, type Speech } from './speech'
import { askPiece, pieceChatAvailable, type ChatTurn } from './llm'

export interface PieceChat {
  /** False with no model key configured, and before the draft has finished —
   *  the board shows no cloud either way. */
  available: boolean
  /** Square of the piece being talked to, or null when nobody is. */
  cell: number | null
  kind: PieceKind | null
  color: Color | null
/** What is being said right now, and over whose head. Usually the piece being
   *  talked to; a message passed on is answered by its addressee, over theirs. */
  speech: Speech | null
  thinking: boolean
  /** True when the piece being talked to fights for the other side. */
  hostile: boolean
  open: (cell: number) => void
  send: (text: string) => void
  close: () => void
}

interface Params {
  state: GameState
  human: Color
  youName: string
  opponentName: string
  /** The play-by-play as the player sees it, newest last. */
  gameLog: string[]
  /** Play a move the player ordered a piece to make. */
  onOrder: (from: number, to: number) => void
}

/**
 * A conversation with one piece.
 *
 * The bubble hangs over its head until the player says something back: sending
 * clears the line, the piece "thinks", and the next line takes its place. The
 * exchange lives here and nowhere else — it is not written to the game log, and
 * it dies with the conversation.
 */
export function usePieceChat({
  state,
  human,
  youName,
  opponentName,
  gameLog,
  onOrder,
}: Params): PieceChat {
  const { t, lang } = useI18n()
  const { chatEnabled } = useChatSettings()
  // Nobody is on the board to talk to until the draft is over, and during it
  // every square is a placement target — a cloud there would be in the way.
  const settled = state.phase === 'play' || state.phase === 'over'
  // Whether the pieces can speak is the server's answer, not the page's, so it
  // arrives a moment after the board does.
  const [canSpeak, setCanSpeak] = useState(false)
  useEffect(() => {
    let alive = true
    void pieceChatAvailable().then((ok) => {
      if (alive) setCanSpeak(ok)
    })
    return () => {
      alive = false
    }
  }, [])
  const available = canSpeak && settled && chatEnabled

  /** Who is being talked to — an identity, not merely a square. */
  const [subject, setSubject] = useState<{ cell: number; kind: PieceKind; color: Color } | null>(
    null,
  )
  const [line, setLine] = useState<string | null>(null)
  /** Set only while somebody else is answering a relayed message. */
  const [asideCell, setAsideCell] = useState<number | null>(null)
  const [thinking, setThinking] = useState(false)
  const history = useRef<ChatTurn[]>([])
  /** Only the newest question may answer: an older reply landing late is dropped. */
  const askId = useRef(0)

  const cell = subject?.cell ?? null
  const standing = cell != null ? state.board[cell] : null
  // A piece can be taken mid-sentence, and the piece that took it now stands on
  // that square. Same square, different soul — the conversation is over.
  const present =
    subject != null && standing?.kind === subject.kind && standing.color === subject.color

  const bubbleCell = asideCell ?? (present ? cell : null)

  // Reading the position out of a ref keeps `ask` stable while still sending the
  // board as it is at the moment of asking, not as it was when the chat opened.
  const facts = useRef({ state, human, youName, opponentName, gameLog, lang, t, onOrder })
  facts.current = { state, human, youName, opponentName, gameLog, lang, t, onOrder }

  /**
   * Carry out an order the piece has accepted — but only if the rules agree:
   * it must be the player's own piece, on the player's turn, and the square
   * must be one it can actually reach. Anything else is dropped in silence,
   * and the piece's words stand on their own.
   */
  const obey = useCallback((from: number, square: string) => {
    const current = facts.current
    const refuse = (why: string) => log('order', square, '— ignored:', why)
    const to = squareCell(square)
    const piece = current.state.board[from]
    if (to == null) return refuse('not a square on this board')
    if (!piece || piece.color !== current.human) return refuse('that piece does not belong to the player')
    if (current.state.phase !== 'play') return refuse('the battle is not on')
    if (current.state.turn !== current.human) return refuse('it is not the player’s turn')
    if (!legalMovesFrom(current.state, from).some((move) => move.to === to)) {
      return refuse('that piece cannot reach it')
    }
    log('order', cellSquare(from), '→', square, '— playing it')
    current.onOrder(from, to)
  }, [])

  /**
   * A message handed to somebody else: the piece has just said it out loud, and
   * now the one it was meant for answers — in its own voice, from its own side,
   * with its own bubble. The player stays in conversation with the piece they
   * opened; this is an aside, not a new interlocutor.
   */
  const relay = useCallback((from: number, square: string, said: string, id: number) => {
    const current = facts.current
    const to = squareCell(square)
    const speaker = to != null ? current.state.board[to] : null
    if (to == null || !speaker || to === from) {
      log('message for', square, '— nobody there')
      return
    }
    const teller = current.state.board[from]
    const heard = `${teller ? PIECES[teller.kind].name : 'Somebody'} on ${cellSquare(from)} has just said to you, out loud, in front of everyone: "${said}". Answer THEM in one short line, in character — they are ${teller && teller.color === speaker.color ? 'on your own side' : 'on the other side'}.`
    log('passing it to', square)
    void askPiece(
      {
        cell: to,
        kind: speaker.kind,
        color: speaker.color,
        state: current.state,
        human: current.human,
        youName: current.youName,
        opponentName: current.opponentName,
        lang: current.lang,
        rules: current.t('rules.body'),
        log: current.gameLog,
        advice: adviseHuman(current.state, current.human),
      },
      [],
      heard,
    ).then((answer) => {
      if (askId.current !== id || !answer?.text) return
      setAsideCell(to)
      setLine(answer.text)
      // A relayed order counts like any other: the rules still have the say.
      if (answer.square) obey(to, answer.square)
    })
  }, [])

  const ask = useCallback((target: number, userText: string) => {
    const current = facts.current
    const piece = current.state.board[target]
    if (!piece) return
    const id = ++askId.current
    setThinking(true)
    setLine(null)
    setAsideCell(null)
    void askPiece(
      {
        cell: target,
        kind: piece.kind,
        color: piece.color,
        state: current.state,
        human: current.human,
        youName: current.youName,
        opponentName: current.opponentName,
        lang: current.lang,
        rules: current.t('rules.body'),
        log: current.gameLog,
        // Worked out on every question rather than on a guessed one: the search
        // is local and costs milliseconds, and a keyword sniffer over seven
        // languages would miss more askings than it caught.
        advice: adviseHuman(current.state, current.human),
      },
      history.current,
      userText,
    ).then((reply) => {
      if (askId.current !== id) return
      setThinking(false)
      const text = reply?.text || current.t('chat.silence')
      history.current = [...history.current, { who: 'them', text }]
      setLine(text)
      // An order only counts once the rules agree with it: the model is trusted
      // to understand "take the orc archer", never to decide what is legal.
      if (reply?.square) obey(target, reply.square)
      else if (userText && !reply?.tell) {
        log('no order in the reply — it only spoke')
      }
      if (reply?.tell) relay(target, reply.tell, text, id)
    })
  }, [obey, relay])

  const open = useCallback(
    (target: number) => {
      const piece = facts.current.state.board[target]
      if (!available || !piece) return
      setSubject({ cell: target, kind: piece.kind, color: piece.color })
      history.current = []
      ask(target, '')
    },
    [available, ask],
  )

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (cell == null || !trimmed || thinking) return
      history.current = [...history.current, { who: 'you', text: trimmed }]
      ask(cell, trimmed)
    },
    [ask, cell, thinking],
  )

  const close = useCallback(() => {
    askId.current++
    setSubject(null)
    setLine(null)
    setAsideCell(null)
    setThinking(false)
    history.current = []
  }, [])

  // All sixteen pieces are unique, so one that is no longer on its square can
  // be found by name alone: it obeyed an order, or was moved by its own side
  // mid-sentence. The conversation follows it. Only a piece that has left the
  // board altogether ends it.
  useEffect(() => {
    if (!subject) return
    if (!settled || !chatEnabled) {
      close()
      return
    }
    if (present) return
    const moved = state.board.findIndex(
      (piece) => piece?.kind === subject.kind && piece.color === subject.color,
    )
    if (moved >= 0) setSubject({ ...subject, cell: moved })
    else close()
  }, [chatEnabled, close, present, settled, state.board, subject])

  return {
    available,
    cell: present ? cell : null,
    kind: subject?.kind ?? null,
    color: subject?.color ?? null,
    speech: bubbleCell == null ? null : speechFrom(state.board, human, bubbleCell, line, thinking),
    thinking,
    hostile: subject != null && subject.color !== human,
    open,
    send,
    close,
  }
}
