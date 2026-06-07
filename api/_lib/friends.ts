import type { SupabaseClient } from '@supabase/supabase-js'
import { unwrap } from './http.js'

/** Remember a player on this user's friend list (syncs across devices). */
export async function saveFriend(db: SupabaseClient, userId: string, friendId: string) {
  if (userId === friendId) return
  unwrap(
    await db.from('saved_friends').upsert(
      { user_id: userId, friend_id: friendId },
      { onConflict: 'user_id,friend_id', ignoreDuplicates: true },
    ),
  )
}

/** Both sides of a finished human game get each other on their lists. */
export async function saveMutualFriends(db: SupabaseClient, userA: string, userB: string) {
  await saveFriend(db, userA, userB)
  await saveFriend(db, userB, userA)
}

/** Backfill saved friends from past ranked games (one row per opponent). */
export async function syncFriendsFromHistory(db: SupabaseClient, userId: string) {
  const results = (unwrap(
    await db
      .from('game_results')
      .select('white_id, black_id')
      .or(`white_id.eq.${userId},black_id.eq.${userId}`),
  ) ?? []) as { white_id: string; black_id: string }[]

  for (const r of results) {
    const other = r.white_id === userId ? r.black_id : r.white_id
    await saveFriend(db, userId, other)
  }
}
