import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, method, requireAuth, withApiError } from '../../_lib/http'

interface CreateInviteBody {
  invitedUserId?: string
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, ['POST'])) return

  const auth = await requireAuth(req, res)
  if (!auth) return

  const id = routeParam(req.query.id)
  if (!id) {
    json(res, 400, { error: 'Missing game id' })
    return
  }

  const { data: game, error: gameError } = await auth.db
    .from('games')
    .select('id, status, created_by')
    .eq('id', id)
    .single()

  if (gameError || !game) {
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

  const body = parseBody(req.body)
  if (body?.invitedUserId === auth.user.id) {
    json(res, 400, { error: 'Cannot invite yourself' })
    return
  }

  if (body?.invitedUserId) {
    const { data: invited, error: invitedError } = await auth.db
      .from('profiles')
      .select('id')
      .eq('id', body.invitedUserId)
      .maybeSingle()

    if (invitedError) {
      json(res, 500, { error: invitedError.message })
      return
    }

    if (!invited) {
      json(res, 400, { error: 'Invited player not found' })
      return
    }
  }

  await auth.db.from('game_invites').update({ status: 'revoked' }).eq('game_id', id).eq('status', 'open')

  const { data: invite, error: inviteError } = await auth.db
    .from('game_invites')
    .insert({
      game_id: id,
      created_by: auth.user.id,
      invited_user_id: body?.invitedUserId ?? null,
    })
    .select('id, status')
    .single()

  if (inviteError) {
    json(res, 500, { error: inviteError.message })
    return
  }

  json(res, 201, { invite })
}

function routeParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function parseBody(body: unknown): CreateInviteBody | null {
  const value = typeof body === 'string' ? safeJson(body) : body
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return {
    invitedUserId: typeof record.invitedUserId === 'string' ? record.invitedUserId : undefined,
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default withApiError(handler)
