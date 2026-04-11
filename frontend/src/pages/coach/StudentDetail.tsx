import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'

interface SetLog {
  exercise_id: string
  weight_kg: number | null
  reps_done: number | null
  logged_at: string
  exercises: { name: string } | null
}

interface Session {
  id: string
  started_at: string
  finished_at: string | null
  workouts: { name: string } | null
  set_logs: SetLog[]
}

interface StudentProfile {
  id: string
  profiles: {
    full_name: string | null
    avatar_url: string | null
  } | null
}

interface DetailData {
  student: StudentProfile
  sessions: Session[]
}

interface PlanWorkout {
  id: string
  name: string
  weekday: number | null
  sequence_position: number | null
  exercises: { id: string }[]
}

interface PlanSummary {
  id: string
  name: string
  schedule_type: string
  workouts: PlanWorkout[]
  created_at: string
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function formatDuration(start: string, end: string | null) {
  if (!end) return null
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  return `${mins} min`
}

/** Build max-weight-per-date per exercise from session data */
function buildProgressionData(sessions: Session[]) {
  const byExercise: Record<string, { date: string; maxWeight: number }[]> = {}
  const chronological = [...sessions].reverse()

  for (const session of chronological) {
    const date = formatDateShort(session.started_at)
    for (const log of session.set_logs) {
      if (!log.exercises?.name || log.weight_kg === null) continue
      const name = log.exercises.name
      if (!byExercise[name]) byExercise[name] = []
      const existing = byExercise[name].find(d => d.date === date)
      if (existing) {
        existing.maxWeight = Math.max(existing.maxWeight, log.weight_kg)
      } else {
        byExercise[name].push({ date, maxWeight: log.weight_kg })
      }
    }
  }
  return byExercise
}

export default function CoachStudentDetail() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const [data, setData] = useState<DetailData | null>(null)
  const [plans, setPlans] = useState<PlanSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedExercise, setSelectedExercise] = useState<string>('')

  const fetchData = useCallback(() => {
    if (!session?.access_token || !id) return
    const api = createApi(session.access_token)
    Promise.all([
      api.get<DetailData>(`/dashboard/student/${id}`),
      api.get<PlanSummary[]>(`/workouts/plans?student_id=${id}`),
    ])
      .then(([detail, plansData]) => {
        setData(detail)
        setPlans(plansData)
        const prog = buildProgressionData(detail.sessions)
        const first = Object.keys(prog)[0] ?? ''
        setSelectedExercise(first)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session, id])

  useEffect(fetchData, [fetchData])

  const progression = useMemo(
    () => (data ? buildProgressionData(data.sessions) : {}),
    [data],
  )
  const exerciseNames = Object.keys(progression)
  const chartData = selectedExercise ? (progression[selectedExercise] ?? []) : []

  const displayName = data?.student.profiles?.full_name ?? 'Aluno'
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-2xl">
        {/* Back link */}
        <Link
          to="/coach/students"
          className="inline-flex items-center gap-1 text-sm text-teal/50 hover:text-teal mb-5 transition-colors"
        >
          ← Alunos
        </Link>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-copper border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data ? (
          <p className="text-teal/50">Aluno não encontrado.</p>
        ) : (
          <>
            {/* Student header */}
            <div className="flex items-center gap-4 mb-8">
              {data.student.profiles?.avatar_url ? (
                <img
                  src={data.student.profiles.avatar_url}
                  alt=""
                  className="w-14 h-14 rounded-full object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-teal/10 flex items-center justify-center text-xl font-bold text-teal">
                  {initial}
                </div>
              )}
              <div>
                <h1 className="font-syne font-extrabold text-2xl text-teal tracking-[-0.02em]">
                  {displayName}
                </h1>
                <p className="text-sm text-teal/50">
                  {data.sessions.length} sessões registradas
                </p>
              </div>
            </div>

            {/* Fichas de treino */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-syne font-bold text-lg text-teal">Fichas de treino</h2>
                <Link
                  to={`/coach/students/${id}/plans/new`}
                  className="bg-copper text-white rounded-btn px-4 py-2 text-sm font-medium shadow-btn hover:opacity-90 active:scale-95 transition-all"
                >
                  + Nova ficha
                </Link>
              </div>

              {plans.length === 0 ? (
                <div className="text-center py-8 bg-white rounded-card border border-teal/[0.09]">
                  <p className="text-sm text-teal/50">Nenhuma ficha criada para este aluno.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {plans.map(plan => {
                    const totalExercises = plan.workouts.reduce((acc, w) => acc + (w.exercises?.length ?? 0), 0)
                    return (
                      <div
                        key={plan.id}
                        className="bg-white rounded-card border border-teal/[0.09] shadow-card p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-syne font-bold text-teal">{plan.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs font-medium bg-teal/10 text-teal px-2 py-0.5 rounded-full">
                                {plan.schedule_type === 'sequence' ? 'Sequencial' : 'Dias fixos'}
                              </span>
                              <span className="text-xs text-teal/40">
                                {plan.workouts.length} treino{plan.workouts.length !== 1 ? 's' : ''} · {totalExercises} exercício{totalExercises !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Progression chart */}
            {exerciseNames.length > 0 && (
              <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <h2 className="font-syne font-bold text-teal">Progressão de carga</h2>
                  <select
                    value={selectedExercise}
                    onChange={e => setSelectedExercise(e.target.value)}
                    className="
                      border border-teal/[0.15] rounded-btn px-3 py-2
                      text-sm text-teal focus:outline-none focus:border-copper
                      bg-white transition-colors
                    "
                  >
                    {exerciseNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(22,50,63,0.06)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: 'rgba(22,50,63,0.45)', fontFamily: 'Inter' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'rgba(22,50,63,0.45)', fontFamily: 'JetBrains Mono' }}
                        axisLine={false}
                        tickLine={false}
                        unit=" kg"
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#fff',
                          border: '1px solid rgba(22,50,63,0.1)',
                          borderRadius: 8,
                          fontSize: 13,
                          fontFamily: 'Inter',
                          color: '#16323F',
                        }}
                        formatter={(value: number) => [`${value} kg`, 'Carga máx.']}
                        labelFormatter={(label: string) => label}
                      />
                      <Line
                        type="monotone"
                        dataKey="maxWeight"
                        stroke="#B76E4D"
                        strokeWidth={2}
                        dot={{ fill: '#B76E4D', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Session history */}
            <h2 className="font-syne font-bold text-lg text-teal mb-3">Histórico de sessões</h2>
            {data.sessions.length === 0 ? (
              <p className="text-sm text-teal/50 py-4">Nenhuma sessão registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {data.sessions.map(s => {
                  const duration = formatDuration(s.started_at, s.finished_at)
                  const totalSets = s.set_logs.length
                  return (
                    <div
                      key={s.id}
                      className="bg-white rounded-card border border-teal/[0.09] shadow-card p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-teal">
                            {s.workouts?.name ?? 'Treino'}
                          </p>
                          <p className="text-xs text-teal/50 mt-0.5">
                            {formatDateShort(s.started_at)}
                          </p>
                        </div>
                        {s.finished_at ? (
                          <span className="text-xs font-medium text-teal bg-teal/10 px-2 py-0.5 rounded-full shrink-0">
                            Concluído
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-copper bg-copper/10 px-2 py-0.5 rounded-full shrink-0">
                            Incompleto
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
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
