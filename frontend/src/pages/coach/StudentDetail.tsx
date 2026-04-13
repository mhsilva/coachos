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

interface Session {
  id: string
  started_at: string
  finished_at: string | null
  workouts: { name: string } | null
  workout_name: string | null
  sets_count: number
}

interface ProgressionLog {
  exercise_name: string | null
  weight_kg: number
  started_at: string | null
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
  progression_logs: ProgressionLog[]
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
  notes: string | null
  workouts: PlanWorkout[]
  created_at: string
}

interface ChatSummary {
  id: string
  type: string
  status: 'open' | 'closed'
  created_at: string
  closed_at: string | null
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function formatDuration(start: string, end: string | null) {
  if (!end) return null
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  return `${mins} min`
}

/** Build max-weight-per-date per exercise from the flat progression logs. */
function buildProgressionData(logs: ProgressionLog[]) {
  // Group by (exercise, ISO date) and keep the max weight per day.
  const byKey: Record<string, { started_at: string; maxWeight: number; exercise: string }> = {}
  for (const log of logs) {
    if (!log.exercise_name || !log.started_at || log.weight_kg === null) continue
    const dayIso = log.started_at.slice(0, 10) // YYYY-MM-DD (sortable)
    const key = `${log.exercise_name}|${dayIso}`
    const existing = byKey[key]
    if (existing) {
      existing.maxWeight = Math.max(existing.maxWeight, log.weight_kg)
    } else {
      byKey[key] = {
        started_at: dayIso,
        maxWeight: log.weight_kg,
        exercise: log.exercise_name,
      }
    }
  }

  // Sort chronologically per exercise and format dates for display.
  const byExercise: Record<string, { date: string; maxWeight: number }[]> = {}
  const entries = Object.values(byKey).sort((a, b) =>
    a.started_at.localeCompare(b.started_at),
  )
  for (const entry of entries) {
    if (!byExercise[entry.exercise]) byExercise[entry.exercise] = []
    byExercise[entry.exercise].push({
      date: formatDateShort(entry.started_at),
      maxWeight: entry.maxWeight,
    })
  }
  return byExercise
}

export default function CoachStudentDetail() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const [data, setData] = useState<DetailData | null>(null)
  const [plans, setPlans] = useState<PlanSummary[]>([])
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedExercise, setSelectedExercise] = useState<string>('')
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [sendingAnamnese, setSendingAnamnese] = useState(false)
  const [anamneseError, setAnamneseError] = useState('')

  const fetchData = useCallback(() => {
    if (!session?.access_token || !id) return
    const api = createApi(session.access_token)
    Promise.all([
      api.get<DetailData>(`/dashboard/student/${id}`),
      api.get<PlanSummary[]>(`/workouts/plans?student_id=${id}`),
      api.get<ChatSummary[]>(`/chats?student_id=${id}&type=anamnese`),
    ])
      .then(([detail, plansData, chatsData]) => {
        setData(detail)
        setPlans(plansData)
        setChats(chatsData)
        const prog = buildProgressionData(detail.progression_logs)
        const first = Object.keys(prog)[0] ?? ''
        setSelectedExercise(first)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session, id])

  async function handleSendAnamnese() {
    if (!session?.access_token || !id || sendingAnamnese) return
    setSendingAnamnese(true)
    setAnamneseError('')
    try {
      const newChat = await createApi(session.access_token).post<ChatSummary>('/chats', {
        type: 'anamnese',
        student_id: id,
      })
      setChats(prev => [newChat, ...prev])
    } catch (err) {
      setAnamneseError(err instanceof Error ? err.message : 'Erro ao enviar anamnese')
    } finally {
      setSendingAnamnese(false)
    }
  }

  useEffect(fetchData, [fetchData])

  async function handleDeletePlan(planId: string) {
    if (!session?.access_token) return
    setDeletingPlanId(planId)
    try {
      await createApi(session.access_token).delete(`/workouts/plans/${planId}`)
      setPlans(prev => prev.filter(p => p.id !== planId))
      setConfirmDeleteId(null)
    } catch (e) {
      console.error(e)
    } finally {
      setDeletingPlanId(null)
    }
  }

  const progression = useMemo(
    () => (data ? buildProgressionData(data.progression_logs) : {}),
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
                    const isConfirming = confirmDeleteId === plan.id
                    const isDeleting = deletingPlanId === plan.id
                    return (
                      <div
                        key={plan.id}
                        className="bg-white rounded-card border border-teal/[0.09] shadow-card p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link to={`/coach/students/${id}/plans/${plan.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                            <p className="font-syne font-bold text-teal">{plan.name}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs font-medium bg-teal/10 text-teal px-2 py-0.5 rounded-full">
                                {plan.schedule_type === 'sequence' ? 'Sequencial' : 'Dias fixos'}
                              </span>
                              <span className="text-xs text-teal/40">
                                {plan.workouts.length} treino{plan.workouts.length !== 1 ? 's' : ''} · {totalExercises} exercício{totalExercises !== 1 ? 's' : ''}
                              </span>
                            </div>
                            {plan.notes && (
                              <p className="mt-2 text-xs text-teal/50 leading-relaxed">{plan.notes}</p>
                            )}
                          </Link>

                          {/* Delete action */}
                          <div className="shrink-0">
                            {isConfirming ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-xs text-teal/40 hover:text-teal transition-colors"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePlan(plan.id)}
                                  disabled={isDeleting}
                                  className="text-xs font-medium text-red-500 hover:text-red-600 transition-colors disabled:opacity-40"
                                >
                                  {isDeleting ? 'Removendo...' : 'Confirmar'}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(plan.id)}
                                className="text-teal/20 hover:text-red-400 transition-colors p-1"
                                aria-label="Remover ficha"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
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
                  const totalSets = s.sets_count
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

            {/* Anamnese (no fundo: acontece com menos frequência) */}
            <div className="mt-10">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-syne font-bold text-lg text-teal">Anamnese</h2>
                {!chats.some(c => c.status === 'open') && (
                  <button
                    type="button"
                    onClick={handleSendAnamnese}
                    disabled={sendingAnamnese}
                    className="bg-copper text-white rounded-btn px-4 py-2 text-sm font-medium shadow-btn hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
                  >
                    {sendingAnamnese ? 'Enviando...' : 'Enviar anamnese'}
                  </button>
                )}
              </div>

              {anamneseError && (
                <p className="text-sm text-red-500 bg-red-50 rounded-btn px-4 py-2.5 mb-3">
                  {anamneseError}
                </p>
              )}

              {chats.length === 0 ? (
                <div className="text-center py-6 bg-white rounded-card border border-teal/[0.09]">
                  <p className="text-sm text-teal/50">Nenhuma anamnese enviada ainda.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {chats.map(chat => {
                    const isOpen = chat.status === 'open'
                    return (
                      <Link
                        key={chat.id}
                        to={isOpen ? '#' : `/coach/students/${id}/chats/${chat.id}`}
                        onClick={e => { if (isOpen) e.preventDefault() }}
                        className={`
                          block bg-white rounded-card border border-teal/[0.09] shadow-card p-4
                          transition-opacity
                          ${isOpen ? 'cursor-default opacity-80' : 'hover:opacity-90'}
                        `}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-teal">
                              Anamnese de {formatDateShort(chat.created_at)}
                            </p>
                            {isOpen ? (
                              <p className="text-xs text-copper mt-0.5">Aguardando resposta do aluno</p>
                            ) : (
                              <p className="text-xs text-teal/50 mt-0.5">
                                Concluída em {chat.closed_at ? formatDateShort(chat.closed_at) : '—'}
                              </p>
                            )}
                          </div>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                              isOpen
                                ? 'bg-copper/10 text-copper'
                                : 'bg-teal/10 text-teal'
                            }`}
                          >
                            {isOpen ? 'Em andamento' : 'Respondida'}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
