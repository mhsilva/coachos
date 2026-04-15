import { useEffect, useState } from 'react'
import { AppLayout } from '../../components/AppLayout'
import { KpiCard } from '../../components/KpiCard'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'

interface Student {
  id: string
  profiles: { full_name: string | null; avatar_url: string | null } | null
}

interface RecentLoad {
  id: string
  weight_kg: number
  reps_done: number | null
  logged_at: string
  exercise_name: string | null
  set_number: number
  workout_sessions: {
    student_id: string
    students: { profiles: { full_name: string | null } | null } | null
  } | null
}

interface SessionDoneToday {
  id: string
  started_at: string
  finished_at: string
  workout_name: string | null
  workouts: { name: string } | null
  students: { profiles: { full_name: string | null } | null } | null
}

interface DashboardData {
  active_students: number
  sessions_today: number
  students: Student[]
  recent_loads: RecentLoad[]
  sessions_done_today: SessionDoneToday[]
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}min atrás`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h atrás`
  return `${Math.floor(hours / 24)}d atrás`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function CoachDashboard() {
  const { session } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.access_token) return
    createApi(session.access_token)
      .get<DashboardData>('/dashboard/coach')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session])

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8">
        <h1 className="page-title mb-6">Dashboard</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-copper border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* KPI grid — 2 cols on mobile, 4 on desktop */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              <KpiCard
                label="Alunos ativos"
                value={data?.active_students ?? 0}
              />
              <KpiCard
                label="Treinos hoje"
                value={data?.sessions_today ?? 0}
                accent
              />
              <KpiCard
                label="Total de alunos"
                value={data?.students.length ?? 0}
              />
              <KpiCard
                label="Cargas registradas"
                value={data?.recent_loads.length ?? 0}
                sub="últimas 24h"
              />
            </div>

            {/* Two-panel grid on desktop, stacked on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Panel 1: Treinos feitos hoje */}
              <div>
                <h2 className="font-syne font-bold text-lg text-teal mb-3">
                  Treinos de hoje
                </h2>

                {!data?.sessions_done_today.length ? (
                  <p className="text-sm text-teal/50 py-4">
                    Nenhum treino finalizado hoje.
                  </p>
                ) : (
                  <div className="bg-white rounded-card border border-teal/[0.09] shadow-card divide-y divide-teal/[0.05]">
                    {data.sessions_done_today.map(s => {
                      const studentName = s.students?.profiles?.full_name ?? 'Aluno'
                      const workoutName = s.workout_name ?? s.workouts?.name ?? '—'
                      return (
                        <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-teal truncate">{studentName}</p>
                            <p className="text-xs text-teal/40 truncate">{workoutName}</p>
                          </div>
                          <span className="text-xs font-jetbrains text-teal/40 shrink-0">
                            {formatTime(s.finished_at)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Panel 2: Atualizações recentes de carga */}
              <div>
                <h2 className="font-syne font-bold text-lg text-teal mb-3">
                  Atualizações recentes
                </h2>

                {!data?.recent_loads.length ? (
                  <p className="text-sm text-teal/50 py-4">
                    Nenhuma carga registrada recentemente.
                  </p>
                ) : (
                  <div className="bg-white rounded-card border border-teal/[0.09] shadow-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-teal/[0.07]">
                            <th className="text-left px-4 py-3 text-xs font-medium text-teal/50">Aluno</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-teal/50">Exercício</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-teal/50">Carga</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-teal/50 hidden sm:table-cell">Quando</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.recent_loads.map(log => {
                            const studentName =
                              log.workout_sessions?.students?.profiles?.full_name ?? '—'
                            return (
                              <tr key={log.id} className="border-b border-teal/[0.05] last:border-0">
                                <td className="px-4 py-3 text-teal/60 text-xs max-w-[80px] truncate">
                                  {studentName}
                                </td>
                                <td className="px-4 py-3 text-teal font-medium text-xs truncate max-w-[120px]">
                                  {log.exercise_name ?? '—'}
                                </td>
                                <td className="px-4 py-3 text-right font-jetbrains text-teal text-xs whitespace-nowrap">
                                  {log.weight_kg} kg
                                  {log.reps_done != null && (
                                    <span className="text-teal/40 ml-1">× {log.reps_done}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-xs text-teal/40 hidden sm:table-cell">
                                  {timeAgo(log.logged_at)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
