import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, method, requireAuth } from '../../_lib/http'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['POST'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const id = routeParam(req.query.id)
  if (!id) {
    json(res, 400, { error: 'Missing game id' })
    return
  }

  const { data: existingPlayer, error: existingError } = await auth.db
    .from('game_players')
    .select('color')
    .eq('game_id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (existingError) {
    json(res, 500, { error: existingError.message })
    return
  }

  if (existingPlayer) {
    json(res, 200, { player: existingPlayer })
    return
  }

  const { data: game, error: gameError } = await auth.db
    .from('games')
    .select('id, status')
    .eq('id', id)
    .single()

  if (gameError || !game) {
    json(res, 404, { error: 'Game not found' })
    return
  }

  if (game.status !== 'waiting') {
    json(res, 409, { error: 'Game is not waiting for another player' })
    return
  }

  const { data: invite, error: inviteError } = await auth.db
    .from('game_invites')
    .select('id, invited_user_id')
    .eq('game_id', id)
    .eq('status', 'open')
    .maybeSingle()

  if (inviteError) {
    json(res, 500, { error: inviteError.message })
    return
  }

  if (!invite) {
    json(res, 409, { error: 'Invite is not available' })
    return
  }

  if (invite.invited_user_id && invite.invited_user_id !== auth.user.id) {
    json(res, 403, { error: 'This invite is for another player' })
    return
  }

  const { count, error: countError } = await auth.db
    .from('game_players')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', id)

  if (countError) {
    json(res, 500, { error: countError.message })
    return
  }

  if ((count ?? 0) >= 2) {
    json(res, 409, { error: 'Game is full' })
    return
  }

  const { error: playerError } = await auth.db.from('game_players').insert({
    game_id: id,
    user_id: auth.user.id,
    color: 'black',
  })

  if (playerError) {
    json(res, 500, { error: playerError.message })
    return
  }

  await auth.db
    .from('game_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), invited_user_id: auth.user.id })
    .eq('id', invite.id)

  const { error: updateError } = await auth.db
    .from('games')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (updateError) {
    json(res, 500, { error: updateError.message })
    return
  }

  json(res, 200, { player: { color: 'black' } })
}

function routeParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
