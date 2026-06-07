// Local API dev server: mounts the Vercel serverless handlers from `api/` on a
// plain Node http server (port 3000), matching the Vite proxy in vite.config.ts.
//
// Why not `vercel dev`? On Windows the Vercel CLI crashes on shutdown/restart
// when it `taskkill`s a child PID that has already exited. This server has no
// such moving parts and, crucially, never dies on a bad request or handler
// error — it logs and keeps serving.

import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'

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
    console.error('[dev-api]', req.method, req.url, '→', e)
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
server.on('error', (e) => console.error('[dev-api] server error', e))

// Last-resort guards so the dev server stays up no matter what.
process.on('uncaughtException', (e) => console.error('[dev-api] uncaughtException', e))
process.on('unhandledRejection', (e) => console.error('[dev-api] unhandledRejection', e))

const PORT = Number(process.env.API_PORT ?? 3000)
server.listen(PORT, () => console.log(`[dev-api] listening on http://localhost:${PORT}`))
