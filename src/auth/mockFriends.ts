import type { Friend } from './types'

// Stub friend lists. With a real backend these come from the Telegram contacts
// API (via the bot) or the Google People API. Shape matches what those return
// so swapping in the real source later touches only this file.

const TELEGRAM_FRIENDS: Friend[] = [
  { id: 'tg-1', name: 'Анна', username: 'anna_k', provider: 'telegram', online: true },
  { id: 'tg-2', name: 'Борис', username: 'boris', provider: 'telegram', online: false },
  { id: 'tg-3', name: 'Вера', username: 'vera_play', provider: 'telegram', online: true },
  { id: 'tg-4', name: 'Глеб', username: 'gleb99', provider: 'telegram', online: false },
]

const GOOGLE_FRIENDS: Friend[] = [
  { id: 'g-1', name: 'Daniel Cohen', provider: 'google', online: true },
  { id: 'g-2', name: 'Eva Lindqvist', provider: 'google', online: false },
  { id: 'g-3', name: 'Frank Müller', provider: 'google', online: true },
]

/** Pretend network fetch so the UI exercises its loading state. */
export function fetchFriends(provider: 'telegram' | 'google'): Promise<Friend[]> {
  const data = provider === 'telegram' ? TELEGRAM_FRIENDS : GOOGLE_FRIENDS
  return new Promise((resolve) => setTimeout(() => resolve(data), 350))
}
