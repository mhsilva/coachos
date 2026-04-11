import { useEffect, useState } from 'react'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'

interface SetLog {
  exercise_id: string
  weight_kg: number | null
  reps_done: number | null
  exercises: { name: string } | null
}

interface Session {
  id: string
  started_at: string
  finished_at: string | null
  workouts: { name: string } | null
  set_logs: SetLog[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDuration(start: string, end: string | null) {
  if (!end) return null
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  return `${mins} min`
}

export default function StudentHistory() {
  const { session } = useAuth()
  const [sessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.access_token) return
    // Re-uses the coach endpoint structure — students need a dedicated endpoint in a future iteration.
    // For v0, we query Supabase directly via the coach dashboard shape isn't available;
    // this page shows data via the sessions the student has access to through RLS.
    // TODO: add GET /sessions/my endpoint in backend
    setLoading(false)
  }, [session])

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-2xl">
        <h1 className="page-title mb-6">Histórico</h1>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-copper border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">📋</p>
            <p className="font-medium text-teal">Nenhuma sessão registrada ainda</p>
            <p className="text-sm text-teal/50 mt-1">Complete seu primeiro treino para ver o histórico aqui.</p>
          </div>
        )}

        <div className="space-y-3">
          {sessions.map(s => {
            const totalSets = s.set_logs.length
            const duration = formatDuration(s.started_at, s.finished_at)
            return (
              <div
                key={s.id}
                className="bg-white rounded-card border border-teal/[0.09] shadow-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-syne font-bold text-teal">
                      {s.workouts?.name ?? 'Treino'}
                    </p>
                    <p className="text-xs text-teal/50 mt-0.5">
                      {formatDate(s.started_at)}
                    </p>
                  </div>
                  {s.finished_at ? (
                    <span className="text-xs font-medium text-teal bg-teal/10 px-2 py-0.5 rounded-full shrink-0">
                      Concluído
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-copper bg-copper/10 px-2 py-0.5 rounded-full shrink-0">
                      Em andamento
                    </span>
                  )}
                </div>
                <div className="flex gap-4 mt-2 text-sm text-teal/50">
                  <span className="font-jetbrains">{totalSets} séries</span>
                  {duration && <span>{duration}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </AppLayout>
  )
}
