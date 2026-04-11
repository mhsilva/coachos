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
  exercises: { name: string } | null
  set_number: number
}

interface DashboardData {
  active_students: number
  sessions_today: number
  students: Student[]
  recent_loads: RecentLoad[]
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}min atrás`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h atrás`
  return `${Math.floor(hours / 24)}d atrás`
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
                label="Sessões hoje"
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

            {/* Recent load updates */}
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
                  {/* Table — scrollable on mobile */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-teal/[0.07]">
                          <th className="text-left px-4 py-3 text-xs font-medium text-teal/50">Exercício</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-teal/50">Carga</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-teal/50">Reps</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-teal/50 hidden sm:table-cell">Quando</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent_loads.map(log => (
                          <tr key={log.id} className="border-b border-teal/[0.05] last:border-0">
                            <td className="px-4 py-3 text-teal font-medium">
                              {log.exercises?.name ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-jetbrains text-teal">
                              {log.weight_kg} kg
                            </td>
                            <td className="px-4 py-3 text-right font-jetbrains text-teal/60">
                              {log.reps_done ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-teal/40 hidden sm:table-cell">
                              {timeAgo(log.logged_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
