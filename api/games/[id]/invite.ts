import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  json,
  method,
  requireAuth,
  unwrap,
  validateInvitedEmail,
  validateInvitedUser,
  withApiError,
} from '../../_lib/http.js'
import { parseInvitedEmail, parseInvitedUserId, routeParam } from '../../_lib/request.js'

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['POST'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const id = routeParam(req.query.id)
  if (!id) {
    json(res, 400, { error: 'Missing game id' })
    return
  }

  const game = unwrap(await auth.db.from('games').select('id, status, created_by').eq('id', id).maybeSingle())
  if (!game) {
    json(res, 404, { error: 'Game not found' })
    return
  }

  if (game.created_by !== auth.user.id) {
    json(res, 403, { error: 'Only the creator can invite players' })
    return
  }

  if (game.status !== 'waiting') {
    json(res, 409, { error: 'Game is not waiting for an invite' })
    return
  }

  const invitedUserId = parseInvitedUserId(req.body)
  const invitedEmail = parseInvitedEmail(req.body)
  const validation = await validateInvitedUser(auth.db, invitedUserId, auth.user.id)
  if (!validation.ok) {
    json(res, validation.status, { error: validation.error })
    return
  }
  const emailValidation = validateInvitedEmail(invitedEmail, auth.user.email)
  if (!emailValidation.ok) {
    json(res, emailValidation.status, { error: emailValidation.error })
    return
  }

  unwrap(await auth.db.from('game_invites').update({ status: 'revoked' }).eq('game_id', id).eq('status', 'open'))

  const invite = unwrap(
    await auth.db
      .from('game_invites')
      .insert({
        game_id: id,
        created_by: auth.user.id,
        invited_user_id: invitedUserId ?? null,
        invited_email: invitedEmail ?? null,
      })
      .select('id, status')
      .single(),
  )

  json(res, 201, { invite })
}

export default withApiError(handler)
