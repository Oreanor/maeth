import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, method, requireAuth } from './_lib/http'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const { data, error } = await auth.db
    .from('profiles')
    .select('id, display_name, avatar_url, provider')
    .eq('id', auth.user.id)
    .single()

  if (error) {
    json(res, 500, { error: error.message })
    return
  }

  json(res, 200, { user: data })
}
