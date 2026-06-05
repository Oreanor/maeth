// Shared request-parsing helpers for the serverless API functions.

/** Read a route parameter that Vercel may surface as a string or string[]. */
export function routeParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** Parse a request body into a plain object, tolerating string or parsed input. */
export function readJsonBody(body: unknown): Record<string, unknown> | null {
  const value = typeof body === 'string' ? safeJson(body) : body
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

/** Extract an optional `invitedUserId` field shared by create-game/invite bodies. */
export function parseInvitedUserId(body: unknown): string | undefined {
  const record = readJsonBody(body)
  if (!record) return undefined
  return typeof record.invitedUserId === 'string' ? record.invitedUserId : undefined
}

/** Extract an optional, normalised `invitedEmail` shared by create-game/invite bodies. */
export function parseInvitedEmail(body: unknown): string | undefined {
  const record = readJsonBody(body)
  if (!record || typeof record.invitedEmail !== 'string') return undefined
  const email = record.invitedEmail.trim().toLowerCase()
  return email.length > 0 ? email : undefined
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
