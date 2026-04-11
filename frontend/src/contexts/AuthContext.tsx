import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type Role = 'admin' | 'coach' | 'student' | null

interface AuthContextValue {
  user: User | null
  session: Session | null
  role: Role
  loading: boolean
  coachRequested: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [loading, setLoading] = useState(true)
  const [coachRequested, setCoachRequested] = useState(false)

  const resolveRole = useCallback(async (s: Session | null) => {
    setSession(s)
    setUser(s?.user ?? null)

    if (!s?.user) {
      setRole(null)
      setCoachRequested(false)
      return
    }

    // Prefer role from JWT app_metadata
    const jwtRole = s.user.app_metadata?.role as Role | undefined
    if (jwtRole) {
      setRole(jwtRole)
      setCoachRequested(false)
      return
    }

    // Fallback: fetch from profiles table
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, coach_requested_at')
        .eq('id', s.user.id)
        .single()

      if (error || !data) {
        // Profile not found — default to student (trigger may still be running)
        setRole('student')
        setCoachRequested(false)
        return
      }

      setRole((data.role as Role) ?? null)
      setCoachRequested(!!data.coach_requested_at)
    } catch {
      setRole('student')
      setCoachRequested(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      resolveRole(s).finally(() => setLoading(false))
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      resolveRole(s)
    })

    return () => subscription.unsubscribe()
  }, [resolveRole])

  async function signOut() {
    await supabase.auth.signOut()
    setRole(null)
    setUser(null)
    setSession(null)
    setCoachRequested(false)
  }

  return (
    <AuthContext.Provider
      value={{ user, session, role, loading, coachRequested, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
