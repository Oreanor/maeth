import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, method, requireAuth, unwrap, withApiError } from '../../_lib/http.js'
import { routeParam } from '../../_lib/request.js'

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['POST'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const id = routeParam(req.query.id)
  if (!id) {
    json(res, 400, { error: 'Missing game id' })
    return
  }

  const existingPlayer = unwrap(
    await auth.db
      .from('game_players')
      .select('color')
      .eq('game_id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle(),
  )

  if (existingPlayer) {
    json(res, 200, { player: existingPlayer })
    return
  }

  const game = unwrap(await auth.db.from('games').select('id, status').eq('id', id).maybeSingle())
  if (!game) {
    json(res, 404, { error: 'Game not found' })
    return
  }

  if (game.status !== 'waiting') {
    json(res, 409, { error: 'Game is not waiting for another player' })
    return
  }

  const invite = unwrap(
    await auth.db
      .from('game_invites')
      .select('id, invited_user_id, invited_email')
      .eq('game_id', id)
      .eq('status', 'open')
      .maybeSingle(),
  ) as { id: string; invited_user_id: string | null; invited_email: string | null } | null

  if (!invite) {
    json(res, 409, { error: 'Invite is not available' })
    return
  }

  // Open (link) invites have no target and accept anyone. Targeted invites must
  // match either the invited user id or the invited email of this account.
  const selfEmail = auth.user.email?.toLowerCase()
  const userMatch = invite.invited_user_id === auth.user.id
  const emailMatch = Boolean(invite.invited_email && selfEmail && invite.invited_email.toLowerCase() === selfEmail)
  const isTargeted = Boolean(invite.invited_user_id || invite.invited_email)
  if (isTargeted && !userMatch && !emailMatch) {
    json(res, 403, { error: 'This invite is for another player' })
    return
  }

  const { count, error: countError } = await auth.db
    .from('game_players')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', id)

  if (countError) throw new Error(countError.message)
  if ((count ?? 0) >= 2) {
    json(res, 409, { error: 'Game is full' })
    return
  }

  unwrap(await auth.db.from('game_players').insert({ game_id: id, user_id: auth.user.id, color: 'black' }))

  unwrap(
    await auth.db
      .from('game_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString(), invited_user_id: auth.user.id })
      .eq('id', invite.id),
  )

  unwrap(
    await auth.db.from('games').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', id),
  )

  json(res, 200, { player: { color: 'black' } })
}

export default withApiError(handler)
