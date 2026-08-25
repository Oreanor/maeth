import { useCallback, useEffect, useRef, useState } from 'react'
import { PIECES } from '@/game/pieces'
import { cellSquare } from '@/game/notation'
import { searchBestMove } from '@/game/search'
import { type Color, type GameState, type Move } from '@/game/types'
import { useI18n } from '@/i18n'
import { banterPrompt, parseLines, reactionPrompt, type MoveNews, type Scene } from './banter'
import { complete, trimLine } from './llm'
import { log, makeSkipLogger } from './log'
import { speechFrom, type Speech } from './speech'
import { pickReaction, pickSpeakers, sameMove } from './whoSpeaks'

/**
 * The board's own noise: a shout when a move lands, and a squabble when nothing
 * has happened for a while.
 *
 * Nobody asked for any of it, so it is kept cheap and quiet — one request per
 * outburst (a whole quarrel comes back as a list of lines), only half of the
 * moves get a word at all, and the moment the player opens a real conversation
 * the board shuts up.
 */

/** Roughly every other move is worth a word; the rest pass in silence. */
const REACTION_CHANCE = 0.5
/** Quiet for this long and they start on each other. */
const IDLE_MS = 30_000
const IDLE_POLL_MS = 5_000
/** How long one line hangs: a beat to read it, and no more. */
const HOLD_MIN_MS = 2_200
const HOLD_MAX_MS = 4_200
const HOLD_PER_CHAR_MS = 32

const skip = makeSkipLogger()

const holdMs = (text: string): number =>
  Math.min(HOLD_MAX_MS, Math.max(HOLD_MIN_MS, 900 + text.length * HOLD_PER_CHAR_MS))

interface Params {
  state: GameState
  human: Color
  youName: string
  /** True while the player has a piece in conversation — the board holds its tongue. */
  busy: boolean
  /** False with no model key, or before the draft is done. */
  enabled: boolean
}

export function useChatter({ state, human, youName, busy, enabled }: Params): Speech | null {
  const { lang } = useI18n()
  const [line, setLine] = useState<Speech | null>(null)

  const timer = useRef<number | null>(null)
  /** Bumped whenever an outburst is cancelled, so a late reply is dropped. */
  const runId = useRef(0)
  const speaking = useRef(false)
  const prevState = useRef<GameState | null>(null)
  const lastActivity = useRef(Date.now())
  const lastBanter = useRef(Date.now())
  /** The move the engine would play, and the ply it was worked out for. */
  const best = useRef<{ ply: number; move: Move | null }>({ ply: -1, move: null })

  const facts = useRef({ state, human, youName, lang, busy, enabled })
  facts.current = { state, human, youName, lang, busy, enabled }

  const stop = useCallback(() => {
    runId.current++
    speaking.current = false
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
    setLine(null)
  }, [])

  /** Match the model's lines to the pieces that were asked to say them. */
  const linesFor = useCallback((raw: string, speakers: number[]): Speech[] => {
    const lines = parseLines(raw, speakers.length)
    if (!lines) {
      log('could not read the reply:', raw.slice(0, 120))
      return []
    }
    const { state, human } = facts.current
    return lines
      .map((text, i) => speechFrom(state.board, human, speakers[i]!, trimLine(text)))
      .filter((entry): entry is Speech => entry != null && (entry.text?.length ?? 0) > 0)
  }, [])

  /** Play the lines out one after another, then fall silent. */
  const speak = useCallback((lines: Speech[], id: number) => {
    if (!lines.length) return
    speaking.current = true
    let i = 0
    const step = () => {
      if (runId.current !== id) return
      const next = lines[i++]
      if (!next) {
        speaking.current = false
        setLine(null)
        return
      }
      log(`${cellSquare(next.cell)}: ${next.text}`)
      setLine(next)
      timer.current = window.setTimeout(step, holdMs(next.text ?? ""))
    }
    step()
  }, [])

  const scene = useCallback((): Scene => {
    const now = facts.current
    return { state: now.state, human: now.human, youName: now.youName, lang: now.lang }
  }, [])

  const idle = useCallback(
    () => !facts.current.busy && facts.current.enabled && !speaking.current,
    [],
  )

  // ── the engine's own pick, ready before the player commits to anything ──
  useEffect(() => {
    if (!enabled || state.phase !== 'play' || state.turn !== human) return
    const ply = state.history.length
    if (best.current.ply === ply) return
    // Deferred: the search takes a moment, and it is not worth spending it in
    // the same frame the board just repainted in.
    const id = window.setTimeout(() => {
      best.current = { ply, move: searchBestMove(state) }
    }, 80)
    return () => window.clearTimeout(id)
  }, [enabled, human, state])

  // ── somebody moved ──
  useEffect(() => {
    const prev = prevState.current
    prevState.current = state
    lastActivity.current = Date.now()
    if (!prev || state.history.length <= prev.history.length) return

    const move = state.history[state.history.length - 1]
    if (!move || !enabled || busy) return
    // Nobody is watching a background tab, and the bubble would be long gone by
    // the time they came back: not worth a request.
    if (document.hidden) return skip('the tab is in the background')
    // The coin is tossed BEFORE anything is cancelled. Against the bot a reply
    // to your move is barely a second old when the bot answers, and stopping
    // first meant that reply was thrown away even when the bot's own move had
    // nothing to say — which is why almost nothing was ever heard.
    if (Math.random() > REACTION_CHANCE) {
      log('move played — nobody feels like saying anything this time')
      return
    }

    const mover = prev.board[move.from]
    if (!mover) return
    const victim = move.capture ? prev.board[move.to] : null
    // A duel the attacker lost leaves it standing on its own square.
    const botched = Boolean(victim) && state.board[move.to]?.color === victim?.color
    const moverCell = state.board[move.to]?.kind === mover.kind ? move.to : move.from
    const bestPlayed = mover.color === human && best.current.ply === prev.history.length &&
      sameMove(best.current.move, move)

    const news: MoveNews = {
      mover: PIECES[mover.kind].name,
      from: move.from,
      to: move.to,
      victim: victim ? PIECES[victim.kind].name : null,
      botched,
      byPlayer: mover.color === human,
      bestPlayed,
    }
    const reaction = pickReaction(
      state.board,
      human,
      news,
      moverCell,
      mover.color,
      botched ? null : (victim?.color ?? null),
    )
    if (!reaction) return

    const prompt = reactionPrompt(scene(), reaction.speakers, reaction.flavour, news)
    if (!prompt) return

    // Now there is something to say, and it replaces whatever was being said.
    stop()
    const id = ++runId.current
    log(
      reaction.flavour,
      'over',
      `${news.mover} ${cellSquare(move.from)}→${cellSquare(move.to)}`,
      '—',
      reaction.speakers.map((cell) => cellSquare(cell)).join(', '),
    )
    // Generous: the model's own reasoning is charged to this budget too.
    void complete(prompt.system, prompt.user, 300 + 120 * reaction.speakers.length).then((raw) => {
      if (runId.current !== id) return
      if (!raw) {
        log('reaction — the model said nothing')
        return
      }
      if (!idle()) return
      speak(linesFor(raw, reaction.speakers), id)
    })
  }, [busy, enabled, human, idle, linesFor, scene, speak, state, stop])

  // ── nothing has happened for a while ──
  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      const now = Date.now()
      if (document.hidden) return skip('the tab is in the background')
      if (facts.current.busy) return skip('the player is talking to a piece')
      if (speaking.current) return skip('somebody is still talking')
      if (now - lastActivity.current < IDLE_MS) return
      if (now - lastBanter.current < IDLE_MS) return

      const picked = pickSpeakers(facts.current.state.board)
      if (!picked) return skip('not enough pieces left to talk')
      lastBanter.current = now
      log(
        picked.flavour,
        'between',
        picked.speakers.map((cell) => cellSquare(cell)).join(', '),
      )

      const prompt = banterPrompt(scene(), picked.speakers, picked.flavour)
      const id = ++runId.current
      void complete(prompt.system, prompt.user, 300 + 120 * picked.speakers.length).then((raw) => {
        if (runId.current !== id) return
        if (!raw) {
          log('banter — the model said nothing')
          return
        }
        if (!idle()) return
        speak(linesFor(raw, picked.speakers), id)
      })
    }
    const interval = window.setInterval(tick, IDLE_POLL_MS)
    return () => window.clearInterval(interval)
  }, [enabled, idle, linesFor, scene, speak])

  // The player's own conversation owns the board; so does leaving the game.
  useEffect(() => {
    if (busy || !enabled) stop()
  }, [busy, enabled, stop])

  useEffect(() => stop, [stop])

  return busy || !enabled ? null : line
}
