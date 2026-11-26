// The API server: mounts the handlers from `api/` (written as Vercel functions)
// on a plain Node http server. The same file runs in development (`npm run
// dev:api`, port 3000, behind the Vite proxy) and in production on the home
// server, bundled by `npm run build:server` into one file with every
// dependency inside, so the server needs no node_modules.
//
// It never dies on a bad request or a handler error — it logs and keeps
// serving. In production systemd restarts it if it does exit, which is also
// how a deploy swaps the code: it ends the process and systemd starts the new
// build.

import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

import games from '../api/games/index.js'
import gameById from '../api/games/[id].js'
import actions from '../api/games/[id]/actions.js'
import invite from '../api/games/[id]/invite.js'
import join from '../api/games/[id]/join.js'
import lottery from '../api/games/[id]/lottery.js'
import rematch from '../api/games/[id]/rematch.js'
import me from '../api/me.js'
import friends from '../api/friends.js'
import stats from '../api/stats.js'
import ping from '../api/ping.js'
import chat from '../api/chat.js'

// --- env loading (.env then .env.local; real shell env always wins) -----------
const shellKeys = new Set(Object.keys(process.env))
function loadEnv(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!shellKeys.has(key)) process.env[key] = value // .env.local overrides .env, shell overrides both
  }
}
loadEnv('.env')
loadEnv('.env.local')

// --- routing (Vercel file-based layout) ---------------------------------------
type Handler = (req: unknown, res: unknown) => unknown
const routes: { re: RegExp; handler: Handler }[] = [
  { re: /^\/api\/ping\/?$/, handler: ping as Handler },
  { re: /^\/api\/me\/?$/, handler: me as Handler },
  { re: /^\/api\/friends\/?$/, handler: friends as Handler },
  { re: /^\/api\/stats\/?$/, handler: stats as Handler },
  { re: /^\/api\/chat\/?$/, handler: chat as Handler },
  { re: /^\/api\/games\/?$/, handler: games as Handler },
  { re: /^\/api\/games\/([^/]+)\/actions\/?$/, handler: actions as Handler },
  { re: /^\/api\/games\/([^/]+)\/invite\/?$/, handler: invite as Handler },
  { re: /^\/api\/games\/([^/]+)\/join\/?$/, handler: join as Handler },
  { re: /^\/api\/games\/([^/]+)\/lottery\/?$/, handler: lottery as Handler },
  { re: /^\/api\/games\/([^/]+)\/rematch\/?$/, handler: rematch as Handler },
  { re: /^\/api\/games\/([^/]+)\/?$/, handler: gameById as Handler },
]

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => resolve(data))
    req.on('error', () => resolve(''))
  })
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

const server = http.createServer(async (req, res) => {
  // Adapt the plain ServerResponse to the bits the handlers expect.
  const r = res as http.ServerResponse & {
    status: (code: number) => typeof r
    json: (body: unknown) => void
  }
  r.status = (code: number) => {
    res.statusCode = code
    return r
  }
  r.json = (body: unknown) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
  }

  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const route = routes.find((rt) => rt.re.test(url.pathname))
    if (!route) {
      r.status(404).json({ error: 'Not found' })
      return
    }

    const match = route.re.exec(url.pathname)!
    const query: Record<string, string> = {}
    url.searchParams.forEach((value, key) => {
      query[key] = value
    })
    if (match[1] !== undefined) query.id = decodeURIComponent(match[1])

    const raw = await readBody(req)
    const reqAny = req as http.IncomingMessage & { query: unknown; body: unknown }
    reqAny.query = query
    reqAny.body = raw ? safeParse(raw) : undefined

    await route.handler(reqAny, r)
  } catch (e) {
    // A single bad request must never take the server down.
    console.error('[api]', req.method, req.url, '→', e)
    if (!res.headersSent) {
      r.status(500).json({ error: e instanceof Error ? e.message : 'Internal error' })
    } else {
      try {
        res.end()
      } catch {
        /* socket already gone */
      }
    }
  }
})

server.on('clientError', (_err, socket) => {
  try {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
  } catch {
    /* ignore */
  }
})
// Failing to listen (the port taken, say) is the one error worth dying of: a
// server that cannot accept requests should exit, so systemd tries again.
server.on('error', (e) => {
  console.error('[api] server error', e)
  process.exit(1)
})

// Last-resort guards so the server stays up no matter what a handler does.
process.on('uncaughtException', (e) => console.error('[api] uncaughtException', e))
process.on('unhandledRejection', (e) => console.error('[api] unhandledRejection', e))

// A deploy (or systemd stopping the unit) ends us with SIGTERM: finish what is
// in flight, briefly, then go.
process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
})

// --- Supabase keep-alive -------------------------------------------------------
// A free Supabase project is paused after a week without activity, and a paused
// project takes sign-in and every game down with it until someone restores it
// by hand in the dashboard. A tiny read twice a day is activity enough. Only
// when SUPABASE_KEEPALIVE_HOURS is set (production), so a dev machine left
// running does not do it too.
const keepAliveHours = Number(process.env.SUPABASE_KEEPALIVE_HOURS ?? 0)
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (keepAliveHours > 0 && supabaseUrl && serviceKey) {
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const touch = async () => {
    const { error } = await db.from('profiles').select('id').limit(1)
    if (error) console.error('[api] supabase keep-alive failed:', error.message)
    else console.log('[api] supabase keep-alive ok')
  }
  void touch()
  setInterval(() => void touch(), keepAliveHours * 3_600_000)
}

const PORT = Number(process.env.API_PORT ?? 3000)
// Loopback in production (only Caddy talks to it); anything in development,
// as before, so a phone on the LAN can reach the dev proxy's target.
const HOST = process.env.API_HOST
server.listen(PORT, HOST, () => console.log(`[api] listening on http://${HOST ?? 'localhost'}:${PORT}`))
