import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { json, method, requireAuth, unwrap, withApiError } from './_lib/http.js'

interface ProfileRow {
  id: string
  display_name: string
  avatar_url: string | null
}
interface ResultRow {
  white_id: string
  black_id: string
  outcome: 'white' | 'black' | 'draw'
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET'])) return
  const auth = await requireAuth(req, res)
  if (!auth) return
  await listStats(auth.db, res)
}

// Win/loss/draw tallies for every stored profile, computed from the durable
// `game_results` table — so deleting a game does not change anyone's record.
async function listStats(db: SupabaseClient, res: VercelResponse) {
  const profiles = (unwrap(
    await db.from('profiles').select('id, display_name, avatar_url').neq('provider', 'guest'),
  ) ?? []) as ProfileRow[]
  const results = (unwrap(await db.from('game_results').select('white_id, black_id, outcome')) ??
    []) as ResultRow[]

  const tally = new Map(profiles.map((p) => [p.id, { wins: 0, losses: 0, draws: 0 }]))

  for (const r of results) {
    if (r.outcome === 'draw') {
      const w = tally.get(r.white_id)
      if (w) w.draws++
      const b = tally.get(r.black_id)
      if (b) b.draws++
      continue
    }
    const winId = r.outcome === 'white' ? r.white_id : r.black_id
    const loseId = r.outcome === 'white' ? r.black_id : r.white_id
    const win = tally.get(winId)
    if (win) win.wins++
    const lose = tally.get(loseId)
    if (lose) lose.losses++
  }

  const rows = profiles.map((p) => {
    const t = tally.get(p.id) ?? { wins: 0, losses: 0, draws: 0 }
    return { id: p.id, name: p.display_name, avatarUrl: p.avatar_url, ...t }
  })
  rows.sort(
    (a, b) =>
      b.wins - a.wins || b.wins - b.losses - (a.wins - a.losses) || a.name.localeCompare(b.name),
  )

  json(res, 200, { players: rows })
}

export default withApiError(handler)
