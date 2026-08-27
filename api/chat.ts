import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { json, method, requireAuth, withApiError } from './_lib/http.js'

/**
 * The voice behind the pieces.
 *
 * The models are called from here rather than from the browser, for two
 * reasons. The key stays on the server instead of being compiled into a bundle
 * anyone can read; and the request leaves from the deployment rather than from
 * the player's own connection, which is what a player in a country the provider
 * does not serve was running into — the board went quiet for them and for
 * nobody else.
 *
 * Groq first because it is fast, OpenRouter behind it; within a tier the models
 * are tried in order until one answers.
 *
 * It answers only to a player this deployment knows — a guest session counts —
 * and it picks the model itself. Anything looser would not be an app talking to
 * a provider on its own key; it would be handing that key's spending out to
 * whoever found the URL.
 */

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

// Checked against both providers' live model lists — the Llama models Star
// Elite still lists are gone from Groq and answer 404. Override either list
// through GROQ_MODELS / OPENROUTER_MODELS when they turn over again.
const GROQ_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-20b']
const OPENROUTER_MODELS = ['minimax/minimax-m3:free', 'nvidia/nemotron-3-super-120b-a12b:free']

/**
 * A serverless function is cut off at ten seconds, and one that dies mid-walk
 * answers nothing at all. So the walk gets a budget it stops at, and each model
 * gets little enough of it that a second one still gets its turn.
 */
const TOTAL_BUDGET_MS = 8_500
const PER_MODEL_MS = 4_000
/** A speech bubble's worth of answer, whatever the caller asks for. */
const MAX_TOKENS = 700
/** The board and the rules make a long prompt; a novel is not one. */
const MAX_PROMPT_CHARS = 16_000
/** System line, a few turns of conversation, and the thing just said. */
const MAX_MESSAGES = 24
/** Languages the board speaks, and the script each of them is written in. */
const CYRILLIC: Record<string, boolean> = { ru: true }
/** Lines one player may be answered in a day. A long evening is a few hundred. */
const DAILY_LIMIT = Number(process.env.CHAT_DAILY_LIMIT) || 400

/**
 * Anything named VITE_* is compiled into the public bundle, so the plain names
 * are the ones to set. The prefixed ones are still read, and only so that a
 * deployment configured before this moved to the server keeps answering until
 * it is renamed — that key should be considered spent.
 */
function fromEnv(name: string): string {
  return (process.env[name] ?? process.env[`VITE_${name}`])?.trim() ?? ''
}

function models(name: string, fallback: string[]): string[] {
  const configured = fromEnv(name)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return configured.length ? configured : fallback
}

interface ModelRef {
  label: string
  endpoint: string
  key: string
  model: string
}

function tiers(): ModelRef[][] {
  const groq = fromEnv('GROQ_API_KEY')
  const openrouter = fromEnv('OPENROUTER_API_KEY')
  return [
    groq
      ? models('GROQ_MODELS', GROQ_MODELS).map((model) => ({
          label: `groq/${model}`,
          endpoint: GROQ_ENDPOINT,
          key: groq,
          model,
        }))
      : [],
    openrouter
      ? models('OPENROUTER_MODELS', OPENROUTER_MODELS).map((model) => ({
          label: `or/${model}`,
          endpoint: OPENROUTER_ENDPOINT,
          key: openrouter,
          model,
        }))
      : [],
  ].filter((tier) => tier.length > 0)
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

type Role = 'system' | 'user' | 'assistant'
type Outbound = { role: Role; content: string }[]
const ROLES: Role[] = ['system', 'user', 'assistant']

async function callModel(ref: ModelRef, messages: Outbound, maxTokens: number, ms: number) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
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
        // Lower than it was. These are small models writing one short line in a
        // language the rest of the prompt is not in, and the last of the heat
        // was buying fluent nothing rather than character.
        temperature: 0.7,
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

const header = (req: VercelRequest, name: string): string => {
  const value = req.headers[name]
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/**
 * A browser announces itself with `Origin` on a cross-origin POST, so this
 * turns away another site spending the key through a visitor's browser. It is
 * the outer of three doors: past it a caller still needs a session of this
 * deployment's own, and past that a share of the day that runs out.
 */
function sameOrigin(req: VercelRequest): boolean {
  const origin = header(req, 'origin')
  if (!origin) return true
  try {
    // Host, not port: in development the page is served by Vite on one port and
    // this function answers on another, and they are still the same machine.
    return new URL(origin).hostname === header(req, 'host').split(':')[0]
  } catch {
    return false
  }
}

/**
 * Count this call against the player's day and say whether it is still theirs
 * to make.
 *
 * The table is optional: a deployment that has not run the migration yet keeps
 * answering, and says in the log that it is answering uncounted. That is a
 * deliberate choice about which failure is worse — a board that has gone silent
 * for everyone, or a limit that is not being enforced until one SQL block is
 * run.
 */
async function withinQuota(db: SupabaseClient, caller: string): Promise<boolean> {
  const { data, error } = await db.rpc('chat_quota_take', { caller })
  if (error) {
    console.warn('[piece-chat] quota not counted:', error.message)
    return true
  }
  return Number(data) <= DAILY_LIMIT
}

/**
 * Did it answer in the language it was asked in?
 *
 * A small model handed an English prompt and told to reply in Russian sometimes
 * replies in English instead, and to the player that is not a bad line — it is
 * no line at all. Cheap to see and worth another model's turn. Only a clear
 * miss counts: a name or a square left in Latin is not one.
 */
function inLanguage(text: string, lang: string | undefined): boolean {
  if (!lang || !(lang in CYRILLIC)) return true
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  if (cyrillic + latin < 8) return true
  return cyrillic >= latin
}

/** The conversation as the caller sent it, or null if it is not one. */
function readMessages(body: unknown): Outbound | null {
  const raw = (body as { messages?: unknown } | null)?.messages
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null
  const messages: Outbound = []
  let chars = 0
  for (const item of raw) {
    const { role, content } = (item ?? {}) as { role?: unknown; content?: unknown }
    if (typeof content !== 'string' || !ROLES.includes(role as Role)) return null
    chars += content.length
    if (chars > MAX_PROMPT_CHARS) return null
    messages.push({ role: role as Role, content })
  }
  return messages
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET', 'POST'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const available = tiers()
  // The board asks before it draws the cloud on a piece: no key configured
  // anywhere, and there is nothing to talk to.
  if (req.method === 'GET') {
    json(res, 200, { available: available.length > 0 })
    return
  }
  if (available.length === 0) {
    json(res, 503, { error: 'No model key is configured' })
    return
  }
  if (!sameOrigin(req)) {
    json(res, 403, { error: 'Cross-origin request' })
    return
  }
  if (!(await withinQuota(auth.db, auth.user.id))) {
    json(res, 429, { error: 'Daily limit reached' })
    return
  }

  const messages = readMessages(req.body)
  if (!messages) {
    json(res, 400, { error: 'Expected a "messages" array of {role, content}' })
    return
  }
  // The model is the server's to choose, not the caller's: an open relay to
  // whatever is most expensive today is not what this is.
  const lang = (req.body as { lang?: unknown })?.lang
  const wanted = typeof lang === 'string' && lang.length <= 8 ? lang : undefined
  const asked = Number((req.body as { maxTokens?: unknown })?.maxTokens)
  const maxTokens = Math.min(MAX_TOKENS, Math.max(16, Number.isFinite(asked) ? asked : 300))

  const deadline = Date.now() + TOTAL_BUDGET_MS
  for (const tier of available) {
    for (const ref of tier) {
      const left = deadline - Date.now()
      if (left <= 0) break
      const text = await callModel(ref, messages, maxTokens, Math.min(PER_MODEL_MS, left))
      if (text && !inLanguage(text, wanted)) {
        console.warn(`[piece-chat] ${ref.label} → answered in the wrong language`)
        continue
      }
      if (text) {
        json(res, 200, { text })
        return
      }
    }
  }
  json(res, 502, { error: 'No model answered' })
}

export default withApiError(handler)
