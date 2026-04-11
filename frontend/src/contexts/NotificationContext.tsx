import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useAuth } from '../hooks/useAuth'
import { createApi } from '../lib/api'

interface NotificationContextValue {
  unreadCount: number
  refreshCount: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

const POLL_INTERVAL = 30_000

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  const refreshCount = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const data = await createApi(session.access_token).get<{ count: number }>(
        '/notifications/unread-count',
      )
      setUnreadCount(data.count)
    } catch {
      // silently ignore polling errors
    }
  }, [session])

  useEffect(() => {
    refreshCount()
    const id = setInterval(refreshCount, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [refreshCount])

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshCount }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider')
  return ctx
}
