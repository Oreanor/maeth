/**
 * Where the app is mounted. `/` in development and on a host of its own,
 * `/maeth/` behind the home server's Caddy, which serves several games side by
 * side under paths of their own. Set at build time through Vite's `base`.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

/** A root-relative path (`/models/…`, `/api/…`) under wherever the app lives. */
export function withBase(path: string): string {
  return `${BASE}${path}`
}

/** The router's basename: the mount point without its trailing slash. */
export const ROUTER_BASENAME = BASE || '/'
