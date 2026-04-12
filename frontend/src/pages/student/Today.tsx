import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '../../components/AppLayout'
import { ExerciseCard, type Exercise } from '../../components/ExerciseCard'
import { useAuth } from '../../hooks/useAuth'
import { useWorkoutSession } from '../../hooks/useSession'
import { createApi } from '../../lib/api'

interface WorkoutSummary {
  plan: string
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

interface WorkoutDetail {
  plan: string
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

type Screen = 'loading' | 'empty' | 'list' | 'executing' | 'finished'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function StudentToday() {
  const { session } = useAuth()
  const { startSession, logSet, finishSession, loading: sessionLoading } = useWorkoutSession()

  const [screen, setScreen] = useState<Screen>('loading')
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([])
  const [selected, setSelected] = useState<WorkoutDetail | null>(null)
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set())
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session?.access_token) return
    createApi(session.access_token)
      .get<WorkoutSummary[]>('/workouts/mine')
      .then(data => {
        setWorkouts(data)
        setScreen(data.length === 0 ? 'empty' : 'list')
      })
      .catch(() => setScreen('empty'))
  }, [session])

  async function handleSelectWorkout(workoutId: string) {
    if (!session?.access_token) return
    try {
      const detail = await createApi(session.access_token)
        .get<WorkoutDetail>(`/workouts/mine/${workoutId}`)
      setSelected(detail)
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
    setFinishing(true)
    try {
      await finishSession()
      setScreen('finished')
    } catch {
      setError('Erro ao finalizar treino. Tente novamente.')
    } finally {
      setFinishing(false)
    }
  }

  function handleBackToList() {
    setSelected(null)
    setCompletedExercises(new Set())
    setError('')
    // Refetch to update stats
    if (!session?.access_token) return
    createApi(session.access_token)
      .get<WorkoutSummary[]>('/workouts/mine')
      .then(data => {
        setWorkouts(data)
        setScreen(data.length === 0 ? 'empty' : 'list')
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
        <div className="px-4 py-8 md:px-8">
          <h1 className="page-title mb-2">Meus Treinos</h1>
          <div className="mt-12 text-center">
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
          <p className="text-sm text-teal/50 mb-6">Escolha qual treino executar</p>

          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

          <div className="space-y-3">
            {workouts.map(w => (
              <button
                key={w.workout.id}
                type="button"
                onClick={() => handleSelectWorkout(w.workout.id)}
                className="
                  w-full text-left bg-white rounded-card border border-teal/[0.09]
                  shadow-card p-5 hover:border-copper/40 active:scale-[0.99]
                  transition-all
                "
              >
                <p className="text-xs text-teal/40 mb-0.5">{w.plan}</p>
                <p className="font-syne font-bold text-teal text-lg">{w.workout.name}</p>

                <div className="flex items-center gap-3 mt-2 text-sm text-teal/50">
                  <span className="font-jetbrains">
                    {w.times_executed}x executado{w.times_executed !== 1 ? 's' : ''}
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
              </button>
            ))}
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
          <p className="text-xs text-white/50 mb-1">{selected?.plan}</p>
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

          {!sessionLoading && (
            <button
              type="button"
              onClick={handleStartSession}
              className="
                mt-4 bg-copper text-white rounded-btn px-4 py-2
                text-sm font-medium shadow-btn
                hover:opacity-90 active:scale-95 transition-all
              "
            >
              Iniciar treino
            </button>
          )}
        </div>

        {/* Workout notes */}
        {selected?.workout.notes && (
          <div className="bg-teal/[0.04] rounded-card border border-teal/[0.06] px-4 py-3 mb-4">
            <p className="text-xs font-medium text-teal/40 uppercase tracking-wide mb-1">Observações do coach</p>
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
