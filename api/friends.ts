import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, method, requireAuth, withApiError } from './_lib/http.js'

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const { data, error } = await auth.db
    .from('profiles')
    .select('id, display_name, avatar_url, provider')
    .neq('id', auth.user.id)
    .order('display_name', { ascending: true })

  if (error) {
    json(res, 500, { error: error.message })
    return
  }

  json(res, 200, {
    friends: (data ?? []).map((profile) => ({
      id: profile.id,
      name: profile.display_name,
      avatarUrl: profile.avatar_url,
      provider: profile.provider,
      online: false,
    })),
  })
}

export default withApiError(handler)
