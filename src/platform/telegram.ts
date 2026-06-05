// Thin wrapper around the Telegram Mini App runtime (telegram-web-app.js).
//
// The script is loaded globally in index.html. In a normal browser the global
// is absent, so every helper here degrades gracefully and the same React code
// runs in both environments.

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  language_code?: string
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: {
    user?: TelegramUser
    [key: string]: unknown
  }
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  ready: () => void
  expand: () => void
  close: () => void
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export function getWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null
}

/** True when we are actually running inside the Telegram client. */
export function isTelegram(): boolean {
  const wa = getWebApp()
  // initData is only populated when launched from a real Telegram client.
  return !!wa && wa.initData.length > 0
}

/** Call once on startup: signals readiness and expands to full height. */
export function initTelegram(): void {
  const wa = getWebApp()
  if (!wa) return
  wa.ready()
  wa.expand()
}

export function getTelegramUser(): TelegramUser | null {
  return getWebApp()?.initDataUnsafe.user ?? null
}

/** Raw initData string — this is what a backend would verify against the bot token. */
export function getInitData(): string {
  return getWebApp()?.initData ?? ''
}

export function haptic(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  getWebApp()?.HapticFeedback?.impactOccurred(style)
}
