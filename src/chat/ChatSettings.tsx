import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * Whether the pieces are allowed to talk at all.
 *
 * Separate from "is there a model key": the key decides whether it is possible,
 * this decides whether it is wanted. Off, the board is exactly the game it was
 * before — no cloud on a hovered piece, no bubbles, no chatter between moves,
 * and not a single request sent.
 */

const STORAGE_KEY = 'maeth.aiChat'

interface ChatSettings {
  chatEnabled: boolean
  setChatEnabled: (on: boolean) => void
  toggleChat: () => void
}

const ChatSettingsContext = createContext<ChatSettings | null>(null)

const stored = (): boolean => localStorage.getItem(STORAGE_KEY) !== 'off'

export function ChatSettingsProvider({ children }: { children: ReactNode }) {
  const [chatEnabled, setEnabled] = useState<boolean>(stored)

  const setChatEnabled = useCallback((on: boolean) => {
    setEnabled(on)
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  }, [])

  const toggleChat = useCallback(() => {
    setEnabled((was) => {
      localStorage.setItem(STORAGE_KEY, was ? 'off' : 'on')
      return !was
    })
  }, [])

  const value = useMemo(
    () => ({ chatEnabled, setChatEnabled, toggleChat }),
    [chatEnabled, setChatEnabled, toggleChat],
  )
  return <ChatSettingsContext.Provider value={value}>{children}</ChatSettingsContext.Provider>
}

export function useChatSettings(): ChatSettings {
  const context = useContext(ChatSettingsContext)
  // The board and the menu both live inside the provider; anything else that
  // asks (a test rendering one component on its own) simply gets it switched on.
  return context ?? { chatEnabled: true, setChatEnabled: () => {}, toggleChat: () => {} }
}
