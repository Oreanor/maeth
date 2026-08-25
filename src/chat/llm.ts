import { buildSystemPrompt, OPENING_TURN, type ChatContext } from './prompt'

/**
 * The voice behind the pieces: a small chat completion, called straight from
 * the browser the way Star Elite calls its negotiator. Groq first because it is
 * fast, OpenRouter behind it; within a tier the models are tried in order until
 * one answers. No key configured — no cloud icon on the board at all.
 */

const env = import.meta.env as unknown as Record<string, string | undefined>

const GROQ_KEY = env.VITE_GROQ_API_KEY?.trim() ?? ''
const OPENROUTER_KEY = env.VITE_OPENROUTER_API_KEY?.trim() ?? ''

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

// Checked against both providers' live model lists — the Llama models Star
// Elite still lists are gone from Groq and answer 404. Override either list
// through VITE_GROQ_MODELS / VITE_OPENROUTER_MODELS when they turn over again.
const GROQ_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-20b']
const OPENROUTER_MODELS = ['minimax/minimax-m3:free', 'nvidia/nemotron-3-super-120b-a12b:free']

function models(key: string, list: string[]): string[] {
  const configured = env[key]?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
  return configured.length ? configured : list
}

interface ModelRef {
  label: string
  endpoint: string
  key: string
  model: string
}

/**
 * Every model worth using here thinks before it speaks, and thinking is charged
 * to the same token budget as the answer: gpt-oss spent its whole allowance
 * reasoning and returned a single letter, and qwen wrote its deliberations into
 * the reply. Both are told to keep it short — the parameter is Groq's, so it
 * only goes to Groq.
 */
function reasoningTuning(ref: ModelRef): Record<string, string> {
  if (ref.endpoint !== GROQ_ENDPOINT) return {}
  if (ref.model.includes('gpt-oss')) return { reasoning_effort: 'low', reasoning_format: 'hidden' }
  if (ref.model.includes('qwen')) return { reasoning_effort: 'none' }
  return {}
}

/** Whatever thinking still leaks into the text is not part of the line. */
export function stripThinking(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<think>[\s\S]*$/i, ' ')
    .replace(/```(?:json)?/gi, ' ')
    .trim()
}

const TIERS: ModelRef[][] = [
  GROQ_KEY
    ? models('VITE_GROQ_MODELS', GROQ_MODELS).map((model) => ({
        label: `groq/${model}`,
        endpoint: GROQ_ENDPOINT,
        key: GROQ_KEY,
        model,
      }))
    : [],
  OPENROUTER_KEY
    ? models('VITE_OPENROUTER_MODELS', OPENROUTER_MODELS).map((model) => ({
        label: `or/${model}`,
        endpoint: OPENROUTER_ENDPOINT,
        key: OPENROUTER_KEY,
        model,
      }))
    : [],
].filter((tier) => tier.length > 0)

/** Whether the pieces can speak at all. False hides the cloud on the board. */
export function pieceChatAvailable(): boolean {
  return TIERS.length > 0
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

/**
 * One completion, whatever it is for. The tiers are walked in order until a
 * model answers; null means every one of them failed or there is no key.
 */
export async function complete(
  system: string,
  user: string,
  maxTokens = 500,
): Promise<string | null> {
  if (!pieceChatAvailable()) return null
  const messages: Outbound = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  for (const tier of TIERS) {
    for (const ref of tier) {
      const raw = await callModel(ref, messages, maxTokens)
      if (raw) return raw
    }
  }
  return null
}

async function callModel(ref: ModelRef, messages: Outbound, maxTokens = 500): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(ref.endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${ref.key}`,
        'Content-Type': 'application/json',
        'X-Title': 'Maeth',
      },
      body: JSON.stringify({
        model: ref.model,
        messages,
        temperature: 0.9,
        max_tokens: maxTokens,
        ...reasoningTuning(ref),
      }),
    })
    if (!res.ok) {
      console.warn(`[piece-chat] ${ref.label} → HTTP ${res.status}`)
      return null
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch (err) {
    console.warn(`[piece-chat] ${ref.label} → request failed:`, err)
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
  if (!pieceChatAvailable()) return null

  const messages: Outbound = [{ role: 'system', content: buildSystemPrompt(ctx) }]
  for (const turn of history.slice(-RECENT_TURNS)) {
    messages.push({ role: turn.who === 'you' ? 'user' : 'assistant', content: turn.text })
  }
  messages.push({ role: 'user', content: userText.trim() || OPENING_TURN })

  for (const tier of TIERS) {
    for (const ref of tier) {
      const raw = await callModel(ref, messages, 500)
      if (raw) {
        const reply = extractOrder(raw)
        return { ...reply, text: trimLine(reply.text) }
      }
    }
  }
  return null
}
