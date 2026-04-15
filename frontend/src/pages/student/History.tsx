import { useEffect, useState } from 'react'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'

interface SetLog {
  exercise_id: string | null
  exercise_name: string | null
  set_number: number
  weight_kg: number | null
  reps_done: number | null
}

interface Session {
  id: string
  started_at: string
  finished_at: string | null
  workout_id: string | null
  workout_name: string | null
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
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.access_token) return
    createApi(session.access_token)
      .get<Session[]>('/sessions/mine')
      .then(data => setSessions(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session])

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-2xl">
        <h1 className="page-title mb-1">Histórico</h1>
        <p className="text-sm text-teal/50 mb-6">
          {sessions.length > 0 ? `${sessions.length} sessões finalizadas` : ''}
        </p>

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
            const isExpanded = expandedId === s.id

            // Group set_logs by exercise name (snapshot)
            const byExercise: Record<string, SetLog[]> = {}
            for (const log of s.set_logs) {
              const name = log.exercise_name ?? 'Exercício removido'
              if (!byExercise[name]) byExercise[name] = []
              byExercise[name].push(log)
            }

            return (
              <div
                key={s.id}
                className="bg-white rounded-card border border-teal/[0.09] shadow-card overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-syne font-bold text-teal">
                        {s.workouts?.name ?? s.workout_name ?? 'Treino removido'}
                      </p>
                      <p className="text-xs text-teal/50 mt-0.5">
                        {formatDate(s.started_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-medium text-teal bg-teal/10 px-2 py-0.5 rounded-full">
                        Concluído
                      </span>
                      <svg
                        className={`w-4 h-4 text-teal/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-2 text-sm text-teal/50">
                    <span className="font-jetbrains">{totalSets} séries</span>
                    {duration && <span>{duration}</span>}
                  </div>
                </button>

                {isExpanded && totalSets > 0 && (
                  <div className="border-t border-teal/[0.06] px-4 pb-4">
                    {Object.entries(byExercise).map(([name, logs]) => (
                      <div key={name} className="mt-3">
                        <p className="text-sm font-medium text-teal mb-1.5">{name}</p>
                        <div className="flex flex-wrap gap-2">
                          {logs
                            .sort((a, b) => a.set_number - b.set_number)
                            .map((log, i) => (
                              <div
                                key={i}
                                className="bg-surface rounded-lg px-2.5 py-1.5 text-xs font-jetbrains text-teal/70"
                              >
                                <span className="text-teal/30 mr-1">S{log.set_number}</span>
                                {log.weight_kg != null && <span>{log.weight_kg}kg</span>}
                                {log.weight_kg != null && log.reps_done != null && <span className="text-teal/20 mx-0.5">×</span>}
                                {log.reps_done != null && <span>{log.reps_done}</span>}
                                {log.weight_kg == null && log.reps_done == null && <span className="text-teal/30">—</span>}
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AppLayout>
  )
}
