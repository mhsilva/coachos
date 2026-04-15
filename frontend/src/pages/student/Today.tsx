import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '../../components/AppLayout'
import { ExerciseCard, type Exercise, type LastSetLog } from '../../components/ExerciseCard'
import { useAuth } from '../../hooks/useAuth'
import { useWorkoutSession } from '../../hooks/useSession'
import { createApi } from '../../lib/api'

interface PlanInfo {
  id: string
  name: string
  notes: string | null
  start_date: string | null
  end_date: string | null
  schedule_type: 'fixed_days' | 'sequence'
}

interface WorkoutEntry {
  workout: {
    id: string
    name: string
    weekday: number | null
    sequence_position: number | null
    estimated_duration_min: number | null
  }
  times_executed: number
  last_executed_at: string | null
}

interface PlanGroup {
  plan: PlanInfo
  workouts: WorkoutEntry[]
}

interface CoachInfo {
  full_name: string | null
  avatar_url: string | null
  bio: string | null
}

interface WorkoutsMineResponse {
  coach: CoachInfo | null
  plan_groups: PlanGroup[]
}

interface WorkoutDetail {
  plan: PlanInfo
  workout: {
    id: string
    name: string
    format: 'structured' | 'freeform'
    content: string | null
    notes: string | null
    estimated_duration_min: number | null
    exercises: Exercise[]
  }
}

type Screen = 'loading' | 'empty' | 'list' | 'executing' | 'feedback' | 'finished'

const RATING_LABELS: Record<number, string> = {
  1: 'Fácil demais',
  2: 'Tranquilo',
  3: 'Ok',
  4: 'Puxado',
  5: 'Intenso',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function formatPlanDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00') // avoid timezone shift
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function CoachCard({ coach }: { coach: CoachInfo }) {
  const name = coach.full_name ?? 'Seu coach'
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase()

  return (
    <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-4 flex items-start gap-3">
      {coach.avatar_url ? (
        <img
          src={coach.avatar_url}
          alt={name}
          className="w-12 h-12 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-teal text-white font-syne font-bold text-sm flex items-center justify-center shrink-0">
          {initials || 'C'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-copper uppercase tracking-wide">Seu coach</p>
        <p className="font-syne font-bold text-teal text-sm leading-tight mt-0.5 truncate">{name}</p>
        {coach.bio && (
          <p className="text-xs text-teal/55 leading-relaxed mt-1 line-clamp-2">{coach.bio}</p>
        )}
      </div>
    </div>
  )
}

export default function StudentToday() {
  const { session } = useAuth()
  const { sessionId, startSession, logSet, finishSession, loading: sessionLoading } = useWorkoutSession()

  const [screen, setScreen] = useState<Screen>('loading')
  const [coach, setCoach] = useState<CoachInfo | null>(null)
  const [planGroups, setPlanGroups] = useState<PlanGroup[]>([])
  const [selected, setSelected] = useState<WorkoutDetail | null>(null)
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set())
  const [lastLogs, setLastLogs] = useState<LastSetLog[]>([])
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState('')

  // Post-session feedback
  const [finishedSessionId, setFinishedSessionId] = useState<string | null>(null)
  const [rating, setRating] = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [comment, setComment] = useState('')
  const [submittingFeedback, setSubmittingFeedback] = useState(false)

  useEffect(() => {
    if (!session?.access_token) return
    createApi(session.access_token)
      .get<WorkoutsMineResponse>('/workouts/mine')
      .then(data => {
        setCoach(data.coach)
        setPlanGroups(data.plan_groups)
        const hasAny = data.plan_groups.some(g => g.workouts.length > 0)
        setScreen(hasAny ? 'list' : 'empty')
      })
      .catch(() => setScreen('empty'))
  }, [session])

  async function handleSelectWorkout(workoutId: string) {
    if (!session?.access_token) return
    try {
      const api = createApi(session.access_token)
      const [detail, logs] = await Promise.all([
        api.get<WorkoutDetail>(`/workouts/mine/${workoutId}`),
        api.get<LastSetLog[]>(`/sessions/last-logs/${workoutId}`),
      ])
      setSelected(detail)
      setLastLogs(logs)
      setCompletedExercises(new Set())
      setError('')
      setScreen('executing')
    } catch {
      setError('Erro ao carregar treino.')
    }
  }

  const handleLogSet = useCallback(
    async (
      exerciseId: string,
      setNumber: number,
      weightKg: number | null,
      repsDone: number | null,
    ) => {
      if (!logSet) return
      await logSet({ exercise_id: exerciseId, set_number: setNumber, weight_kg: weightKg, reps_done: repsDone })
    },
    [logSet],
  )

  const handleExerciseComplete = useCallback(
    (exerciseId: string) => {
      setCompletedExercises(prev => new Set(prev).add(exerciseId))
    },
    [],
  )

  async function handleStartSession() {
    if (!selected) return
    await startSession(selected.workout.id)
  }

  async function handleFinish() {
    if (!sessionId) return
    setFinishing(true)
    try {
      // Snapshot id before the hook clears it inside finishSession()
      const justFinishedId = sessionId
      await finishSession()
      setFinishedSessionId(justFinishedId)
      setRating(0)
      setHoverRating(0)
      setComment('')
      setError('')
      setScreen('feedback')
    } catch {
      setError('Erro ao finalizar treino. Tente novamente.')
    } finally {
      setFinishing(false)
    }
  }

  async function handleSubmitFeedback() {
    if (!session?.access_token || !finishedSessionId || rating === 0) return
    setSubmittingFeedback(true)
    setError('')
    try {
      await createApi(session.access_token).post(
        `/sessions/${finishedSessionId}/feedback`,
        { rating, comment: comment.trim() || null },
      )
      setScreen('finished')
    } catch {
      setError('Erro ao enviar feedback. Tente novamente.')
    } finally {
      setSubmittingFeedback(false)
    }
  }

  function handleSkipFeedback() {
    setScreen('finished')
  }

  function handleBackToList() {
    setSelected(null)
    setCompletedExercises(new Set())
    setFinishedSessionId(null)
    setRating(0)
    setHoverRating(0)
    setComment('')
    setError('')
    if (!session?.access_token) return
    createApi(session.access_token)
      .get<WorkoutsMineResponse>('/workouts/mine')
      .then(data => {
        setCoach(data.coach)
        setPlanGroups(data.plan_groups)
        const hasAny = data.plan_groups.some(g => g.workouts.length > 0)
        setScreen(hasAny ? 'list' : 'empty')
      })
      .catch(() => setScreen('list'))
  }

  const allExercisesDone =
    selected !== null &&
    selected.workout.exercises.length > 0 &&
    selected.workout.exercises.every(ex => completedExercises.has(ex.id))

  const totalSets = selected?.workout.exercises.reduce((acc, ex) => acc + ex.sets, 0) ?? 0

  // -- Screens --

  if (screen === 'loading') {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-copper border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (screen === 'empty') {
    return (
      <AppLayout>
        <div className="px-4 py-8 md:px-8 max-w-lg">
          <h1 className="page-title mb-6">Meus Treinos</h1>
          {coach && <CoachCard coach={coach} />}
          <div className="mt-10 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-syne font-bold text-teal text-lg">Nenhum treino disponível</p>
            <p className="text-sm text-teal/50 mt-1">
              Seu coach ainda não cadastrou treinos para você.
            </p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (screen === 'list') {
    return (
      <AppLayout>
        <div className="px-4 py-8 md:px-8 max-w-lg">
          <h1 className="page-title mb-1">Meus Treinos</h1>
          <p className="text-sm text-teal/50 mb-5">Escolha qual treino executar</p>

          {coach && <CoachCard coach={coach} />}

          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

          <div className="space-y-4 mt-5">
            {planGroups.map(group => (
              <div
                key={group.plan.id}
                className="bg-white rounded-card border border-teal/[0.09] shadow-card overflow-hidden"
              >
                {/* Plan header */}
                <div className="px-4 py-3 border-b border-teal/[0.07] bg-teal/[0.03] flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-copper shrink-0" />
                      <p className="font-syne font-bold text-teal text-base leading-tight truncate">
                        {group.plan.name}
                      </p>
                    </div>
                    {group.plan.notes && (
                      <p className="text-xs text-teal/55 mt-1.5 leading-relaxed pl-3">
                        {group.plan.notes}
                      </p>
                    )}
                  </div>
                  {(group.plan.start_date || group.plan.end_date) && (
                    <p className="text-[10px] font-jetbrains text-teal/45 shrink-0 text-right leading-tight">
                      {group.plan.start_date && formatPlanDate(group.plan.start_date)}
                      {group.plan.start_date && group.plan.end_date && <><br />até<br /></>}
                      {group.plan.end_date && formatPlanDate(group.plan.end_date)}
                    </p>
                  )}
                </div>

                {/* Workouts as rows inside the card */}
                {group.workouts.length === 0 ? (
                  <p className="text-xs text-teal/40 px-4 py-4">Nenhum treino nesta ficha.</p>
                ) : (
                  <div className="divide-y divide-teal/[0.06]">
                    {group.workouts.map(w => (
                      <button
                        key={w.workout.id}
                        type="button"
                        onClick={() => handleSelectWorkout(w.workout.id)}
                        className="
                          w-full text-left px-4 py-3.5 flex items-center justify-between gap-3
                          hover:bg-copper/[0.04] active:bg-copper/[0.08]
                          transition-colors
                        "
                      >
                        <div className="min-w-0">
                          <p className="font-syne font-bold text-teal truncate">{w.workout.name}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-teal/50 flex-wrap">
                            <span className="font-jetbrains">
                              {w.times_executed}x
                            </span>
                            {w.last_executed_at && (
                              <>
                                <span className="text-teal/20">·</span>
                                <span>Último: {formatDate(w.last_executed_at)}</span>
                              </>
                            )}
                            {w.workout.estimated_duration_min && (
                              <>
                                <span className="text-teal/20">·</span>
                                <span>~{w.workout.estimated_duration_min} min</span>
                              </>
                            )}
                          </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-teal/25 shrink-0">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </AppLayout>
    )
  }

  if (screen === 'feedback') {
    const displayRating = hoverRating || rating
    return (
      <AppLayout>
        <div className="px-4 py-8 md:px-8 max-w-lg">
          <div className="text-center">
            <p className="text-5xl mb-3">💪</p>
            <h2 className="font-syne font-extrabold text-2xl text-teal tracking-[-0.02em]">
              Treino finalizado!
            </h2>
            <p className="text-teal/55 text-sm mt-1.5">
              Como foi essa sessão?
            </p>
          </div>

          <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5 mt-6">
            {/* Stars */}
            <div className="flex items-center justify-between gap-2">
              {[1, 2, 3, 4, 5].map(n => {
                const active = displayRating >= n
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 transition-transform active:scale-90 hover:scale-110"
                    aria-label={`${n} — ${RATING_LABELS[n]}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className={`w-9 h-9 transition-colors ${
                        active ? 'text-copper' : 'text-teal/15'
                      }`}
                      fill="currentColor"
                    >
                      <path d="M12 2.5l2.92 6.36 6.96.78-5.2 4.74 1.44 6.86L12 17.77l-6.12 3.47 1.44-6.86L2.12 9.64l6.96-.78L12 2.5z" />
                    </svg>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center justify-between text-[11px] text-teal/45 mt-1 px-1">
              <span>Fácil demais</span>
              <span>Intenso</span>
            </div>
            <p className="text-center font-syne font-bold text-teal text-sm mt-3 h-5">
              {displayRating > 0 ? RATING_LABELS[displayRating] : '\u00A0'}
            </p>

            {/* Comment */}
            <div className="mt-5">
              <label className="text-xs font-medium text-teal/50 uppercase tracking-wide">
                Comentário
              </label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={5}
                placeholder="Conte como foi: sentiu alguma dor, incômodo ou dificuldade? Algum exercício especialmente pesado ou leve? Tudo que você quiser compartilhar ajuda a gente a ajustar seu treino."
                className="
                  mt-1.5 w-full rounded-btn border border-teal/[0.12] bg-surface
                  px-3 py-2.5 text-sm text-teal placeholder:text-teal/35
                  focus:outline-none focus:border-copper/60 focus:bg-white
                  transition-colors resize-none
                "
                maxLength={2000}
              />
            </div>

            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

            <button
              type="button"
              onClick={handleSubmitFeedback}
              disabled={rating === 0 || submittingFeedback}
              className="
                mt-5 w-full bg-copper text-white rounded-btn py-3.5
                font-syne font-bold text-sm shadow-btn
                hover:opacity-90 active:scale-[0.98]
                transition-all disabled:opacity-40
              "
            >
              {submittingFeedback ? 'Enviando...' : 'Enviar feedback'}
            </button>
            <button
              type="button"
              onClick={handleSkipFeedback}
              disabled={submittingFeedback}
              className="
                mt-2 w-full text-sm text-teal/50 hover:text-teal
                py-2 transition-colors disabled:opacity-40
              "
            >
              Pular
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (screen === 'finished') {
    return (
      <AppLayout>
        <div className="px-4 py-8 md:px-8 max-w-lg">
          <div className="mt-12 text-center">
            <p className="text-5xl mb-4">💪</p>
            <h2 className="font-syne font-extrabold text-2xl text-teal tracking-[-0.02em]">
              Treino finalizado!
            </h2>
            <p className="text-teal/50 text-sm mt-2">Ótimo trabalho. Continue assim.</p>
            <button
              type="button"
              onClick={handleBackToList}
              className="
                mt-6 bg-copper text-white rounded-btn px-6 py-3
                text-sm font-medium shadow-btn
                hover:opacity-90 active:scale-95 transition-all
              "
            >
              Voltar aos treinos
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  // screen === 'executing'
  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-lg">
        {/* Back button */}
        <button
          type="button"
          onClick={handleBackToList}
          className="flex items-center gap-1 text-sm text-teal/50 hover:text-teal mb-4 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Voltar
        </button>

        {/* Hero card */}
        <div className="bg-teal rounded-card p-5 mb-6 text-white">
          <p className="text-xs text-white/50 mb-1">{selected?.plan.name}</p>
          {(selected?.plan.start_date || selected?.plan.end_date) && (
            <p className="text-xs text-white/40 mb-1">
              {selected.plan.start_date && formatPlanDate(selected.plan.start_date)}
              {selected.plan.start_date && selected.plan.end_date && ' – '}
              {selected.plan.end_date && formatPlanDate(selected.plan.end_date)}
            </p>
          )}
          <h1 className="font-syne font-extrabold text-2xl tracking-[-0.02em]">
            {selected?.workout.name}
          </h1>
          <div className="flex gap-4 mt-3 text-sm text-white/60">
            {selected?.workout.format !== 'freeform' && (
              <>
                <span>{selected?.workout.exercises.length} exercícios</span>
                <span className="font-jetbrains">{totalSets} séries</span>
              </>
            )}
            {selected?.workout.format === 'freeform' && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Treino livre</span>
            )}
            {selected?.workout.estimated_duration_min && (
              <span>~{selected.workout.estimated_duration_min} min</span>
            )}
          </div>

          {sessionId ? (
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm text-white/70">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Treino iniciado
            </span>
          ) : (
            <button
              type="button"
              onClick={handleStartSession}
              disabled={sessionLoading}
              className="
                mt-4 bg-copper text-white rounded-btn px-4 py-2
                text-sm font-medium shadow-btn
                hover:opacity-90 active:scale-95 transition-all
                disabled:opacity-40
              "
            >
              {sessionLoading ? 'Iniciando...' : 'Iniciar treino'}
            </button>
          )}
        </div>

        {/* Plan notes */}
        {selected?.plan.notes && (
          <div className="bg-teal/[0.04] rounded-card border border-teal/[0.06] px-4 py-3 mb-4">
            <p className="text-xs font-medium text-teal/40 uppercase tracking-wide mb-1">Observações da ficha</p>
            <p className="text-sm text-teal/70 leading-relaxed">{selected.plan.notes}</p>
          </div>
        )}

        {/* Workout notes */}
        {selected?.workout.notes && (
          <div className="bg-teal/[0.04] rounded-card border border-teal/[0.06] px-4 py-3 mb-4">
            <p className="text-xs font-medium text-teal/40 uppercase tracking-wide mb-1">Observações do treino</p>
            <p className="text-sm text-teal/70 leading-relaxed">{selected.workout.notes}</p>
          </div>
        )}

        {/* Freeform content */}
        {selected?.workout.format === 'freeform' && selected.workout.content && (
          <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5">
            <div className="whitespace-pre-wrap text-sm text-teal/70 leading-relaxed font-jetbrains">
              {selected.workout.content}
            </div>
          </div>
        )}

        {/* Structured: Exercise list */}
        {selected?.workout.format !== 'freeform' && (
          <div className="space-y-3">
            {selected?.workout.exercises.map(ex => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                lastLogs={lastLogs}
                onLogSet={handleLogSet}
                onComplete={handleExerciseComplete}
              />
            ))}
          </div>
        )}

        {/* Finish button */}
        {(selected?.workout.format === 'freeform' || allExercisesDone) && (
          <div className="mt-6">
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <button
              type="button"
              onClick={handleFinish}
              disabled={finishing}
              className="
                w-full bg-copper text-white rounded-btn py-4
                font-syne font-bold text-base shadow-btn
                hover:opacity-90 active:scale-[0.98]
                transition-all disabled:opacity-40
              "
            >
              {finishing ? 'Finalizando...' : 'Finalizar Treino'}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
