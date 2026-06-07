import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, method, requireAuth, unwrap, withApiError } from './_lib/http.js'
import { readJsonBody } from './_lib/request.js'
import { saveFriend, syncFriendsFromHistory } from './_lib/friends.js'

interface ProfileRow {
  id: string
  display_name: string
  avatar_url: string | null
  provider: string
  last_seen: string
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['GET', 'POST'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  if (req.method === 'POST') {
    const body = readJsonBody(req.body)
    const friendId = body && typeof body.friendId === 'string' ? body.friendId : null
    if (!friendId) {
      json(res, 400, { error: 'Missing friendId' })
      return
    }

    const friend = unwrap(
      await auth.db
        .from('profiles')
        .select('id, provider')
        .eq('id', friendId)
        .maybeSingle(),
    )
    if (!friend || friend.provider !== 'google') {
      json(res, 404, { error: 'Player not found' })
      return
    }

    await saveFriend(auth.db, auth.user.id, friendId)
    json(res, 200, { ok: true })
    return
  }

  await syncFriendsFromHistory(auth.db, auth.user.id)

  const saved = (unwrap(
    await auth.db.from('saved_friends').select('friend_id').eq('user_id', auth.user.id),
  ) ?? []) as { friend_id: string }[]

  const friendIds = saved.map((row) => row.friend_id)
  if (friendIds.length === 0) {
    json(res, 200, { friends: [] })
    return
  }

  const profiles = (unwrap(
    await auth.db
      .from('profiles')
      .select('id, display_name, avatar_url, provider, last_seen')
      .in('id', friendIds)
      .eq('provider', 'google')
      .order('display_name', { ascending: true }),
  ) ?? []) as ProfileRow[]

  const now = Date.now()
  const onlineMs = 30_000

  json(res, 200, {
    friends: profiles.map((profile) => ({
      id: profile.id,
      name: profile.display_name,
      avatarUrl: profile.avatar_url,
      provider: profile.provider,
      online: Boolean(profile.last_seen && now - Date.parse(profile.last_seen) < onlineMs),
    })),
  })
}

export default withApiError(handler)
