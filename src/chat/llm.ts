import { sessionToken } from '@/lib/api'
import { buildSystemPrompt, openingTurn, type ChatContext } from './prompt'

/**
 * The voice behind the pieces: a small chat completion, asked for through this
 * deployment's own `/api/chat` rather than called from the browser.
 *
 * The key belongs on the server — in the page it was readable by anyone who
 * opened the bundle — and so does the outgoing request: it used to leave from
 * the player's own connection, and a player whose country the provider does not
 * serve got silence while everyone else got a board that talked. Which models
 * are tried, and in what order, is the server's business now.
 */

const CHAT_ENDPOINT = '/api/chat'

/** Whatever thinking still leaks into the text is not part of the line. */
export function stripThinking(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<think>[\s\S]*$/i, ' ')
    .replace(/```(?:json)?/gi, ' ')
    .trim()
}

let asked: Promise<boolean> | null = null

/**
 * Whether the pieces can speak at all — false hides the cloud on the board.
 *
 * Only the server knows: it holds the keys. Asked once per session, and a
 * refusal is remembered, so a build with no API behind it (or none reachable)
 * simply plays the game it was before, in silence.
 */
export function pieceChatAvailable(): Promise<boolean> {
  asked ??= sessionToken()
    .then((token) =>
      // No session, nobody to bill it to: the endpoint answers only to a player
      // this deployment knows, guest sessions included.
      token
        ? fetch(CHAT_ENDPOINT, { headers: { Authorization: `Bearer ${token}` } })
        : null,
    )
    .then((res) => (res?.ok ? res.json() : { available: false }))
    .then((data: { available?: boolean }) => data.available === true)
    .catch(() => false)
  return asked
}

export interface ChatTurn {
  who: 'you' | 'them'
  text: string
}

const TIMEOUT_MS = 9_000
/** How much of the conversation goes back into the prompt. */
const RECENT_TURNS = 8
/** A speech bubble, not a monologue: two sentences and a hard ceiling. */
const MAX_SENTENCES = 2
const MAX_CHARS = 120

/** Keep the reply bubble-sized whatever the model felt like sending. */
export function trimLine(raw: string): string {
  let text = stripThinking(raw).replace(/\s+/g, ' ').trim()
  // Models like to wrap a line in quotes or dress it with *stage directions*.
  text = text.replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length > 1 && /^["«“'].*["»”']$/.test(text)) text = text.slice(1, -1).trim()

  const sentences = text.match(/[^.!?…]+[.!?…]+(\s|$)|[^.!?…]+$/g) ?? [text]
  if (sentences.length > MAX_SENTENCES) text = sentences.slice(0, MAX_SENTENCES).join('').trim()
  if (text.length > MAX_CHARS) {
    const cut = text.slice(0, MAX_CHARS)
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
    text = (stop > 40 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`).trim()
  }
  return text
}

type Outbound = { role: 'system' | 'user' | 'assistant'; content: string }[]

/** One completion, whatever it is for. Null means nothing answered. */
export async function complete(
  system: string,
  user: string,
  maxTokens = 500,
): Promise<string | null> {
  return askModel(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens,
  )
}

/**
 * Ask the server for a line. It signs the request with the player's own
 * session, picks the model, and answers with the text or with nothing —
 * whatever went wrong, the board's answer to it is the same silence.
 */
async function askModel(messages: Outbound, maxTokens: number, lang?: string): Promise<string | null> {
  const token = await sessionToken()
  if (!token) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages, maxTokens, lang }),
    })
    if (!res.ok) {
      console.warn(`[piece-chat] → HTTP ${res.status}`)
      return null
    }
    const data = (await res.json()) as { text?: string }
    return data.text?.trim() || null
  } catch (err) {
    console.warn('[piece-chat] → request failed:', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** What a piece said, and what it means to do about it. */
export interface PieceReply {
  text: string
  /** The square from a [MOVE: C3] tag — not yet checked against the rules. */
  square: string | null
  /** The square of whoever it is passing the message to, from [TELL: B2]. */
  tell: string | null
}

/**
 * Pull an order out of a reply. The tag is a trailing marker rather than a JSON
 * envelope on purpose: a model that fumbles the format still leaves a perfectly
 * good line behind, and the worst case is a piece that talks instead of moving.
 */
export function extractOrder(raw: string): PieceReply {
  const move = /\[\s*MOVE\s*:?\s*([A-Da-d][1-4])\s*\]/i.exec(raw)
  const tell = /\[\s*TELL\s*:?\s*([A-Da-d][1-4])\s*\]/i.exec(raw)
  const text = raw
    .replace(/\[\s*(?:MOVE|TELL)\s*:?[^\]]*\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    text,
    square: move ? move[1]!.toUpperCase() : null,
    tell: tell ? tell[1]!.toUpperCase() : null,
  }
}

/**
 * One reply from the piece. `userText` empty means the player has only just
 * opened the conversation and the piece speaks first.
 */
export async function askPiece(
  ctx: ChatContext,
  history: ChatTurn[],
  userText: string,
): Promise<PieceReply | null> {
  const messages: Outbound = [{ role: 'system', content: buildSystemPrompt(ctx) }]
  for (const turn of history.slice(-RECENT_TURNS)) {
    messages.push({ role: turn.who === 'you' ? 'user' : 'assistant', content: turn.text })
  }
  messages.push({ role: 'user', content: userText.trim() || openingTurn(ctx) })

  const raw = await askModel(messages, 500, ctx.lang)
  if (!raw) return null
  const reply = extractOrder(raw)
  return { ...reply, text: trimLine(reply.text) }
}
