export type AuthProvider = 'telegram' | 'google' | 'guest'

export interface AppUser {
  id: string
  name: string
  username?: string
  avatarUrl?: string
  provider: AuthProvider
}

export interface Friend {
  id: string
  name: string
  username?: string
  avatarUrl?: string
  provider: AuthProvider
  online: boolean
}
