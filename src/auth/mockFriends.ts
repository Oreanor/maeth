import type { Friend } from './types'

// Stub friend list used as a fallback for guest users. Real Google players come
// from the backend via listFriends(); the shape matches so swapping the source
// later touches only this file.

const GUEST_FRIENDS: Friend[] = [
  { id: 'g-1', name: 'Daniel Cohen', provider: 'google', online: true },
  { id: 'g-2', name: 'Eva Lindqvist', provider: 'google', online: false },
  { id: 'g-3', name: 'Frank Müller', provider: 'google', online: true },
]

/** Pretend network fetch so the UI exercises its loading state. */
export function fetchFriends(): Promise<Friend[]> {
  return new Promise((resolve) => setTimeout(() => resolve(GUEST_FRIENDS), 350))
}
