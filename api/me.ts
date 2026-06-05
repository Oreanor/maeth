import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, method, requireAuth, unwrap, withApiError } from './_lib/http.js'

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const profile = unwrap(
    await auth.db
      .from('profiles')
      .select('id, display_name, avatar_url, provider')
      .eq('id', auth.user.id)
      .single(),
  )

  json(res, 200, { user: profile })
}

export default withApiError(handler)
