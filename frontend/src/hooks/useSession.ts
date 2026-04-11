import { useState } from 'react'
import { createApi } from '../lib/api'
import { useAuth } from './useAuth'

interface SetLogPayload {
  exercise_id: string
  set_number: number
  reps_done: number | null
  weight_kg: number | null
}

export function useWorkoutSession() {
  const { session } = useAuth()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function startSession(workout_id: string): Promise<string | undefined> {
    if (!session?.access_token) return
    setLoading(true)
    try {
      const api = createApi(session.access_token)
      const data = await api.post<{ id: string }>('/sessions/start', { workout_id })
      setSessionId(data.id)
      return data.id
    } finally {
      setLoading(false)
    }
  }

  async function logSet(payload: SetLogPayload) {
    if (!session?.access_token || !sessionId) return
    return createApi(session.access_token).post(
      `/sessions/${sessionId}/log`,
      payload,
    )
  }

  async function finishSession() {
    if (!session?.access_token || !sessionId) return
    const result = await createApi(session.access_token).patch(
      `/sessions/${sessionId}/finish`,
    )
    setSessionId(null)
    return result
  }

  return { sessionId, loading, startSession, logSet, finishSession }
}
