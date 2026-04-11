import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '../../components/AppLayout'
import { ExerciseCard, type Exercise } from '../../components/ExerciseCard'
import { useAuth } from '../../hooks/useAuth'
import { useWorkoutSession } from '../../hooks/useSession'
import { createApi } from '../../lib/api'

interface WorkoutOption {
  plan: string
  workout: {
    id: string
    name: string
    estimated_duration_min: number | null
    exercises: Exercise[]
  }
}

type Screen = 'loading' | 'empty' | 'select' | 'executing' | 'finished'

export default function StudentToday() {
  const { session } = useAuth()
  const { startSession, logSet, finishSession, loading: sessionLoading } = useWorkoutSession()

  const [screen, setScreen] = useState<Screen>('loading')
  const [options, setOptions] = useState<WorkoutOption[]>([])
  const [selected, setSelected] = useState<WorkoutOption | null>(null)
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set())
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session?.access_token) return
    createApi(session.access_token)
      .get<WorkoutOption[]>('/workouts/today')
      .then(data => {
        setOptions(data)
        if (data.length === 0) setScreen('empty')
        else if (data.length === 1) {
          setSelected(data[0])
          setScreen('executing')
        } else {
          setScreen('select')
        }
      })
      .catch(() => setScreen('empty'))
  }, [session])

  function handleSelectWorkout(option: WorkoutOption) {
    setSelected(option)
    setScreen('executing')
  }

  const handleLogSet = useCallback(
    async (
      exerciseId: string,
      setNumber: number,
      weightKg: number | null,
      repsDone: number | null,
    ) => {
      // Start session lazily on first log
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

  const allExercisesDone =
    selected !== null &&
    selected.workout.exercises.length > 0 &&
    selected.workout.exercises.every(ex => completedExercises.has(ex.id))

  const totalSets = selected?.workout.exercises.reduce((acc, ex) => acc + ex.sets, 0) ?? 0

  // ── Screens ──────────────────────────────────────────

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
          <h1 className="page-title mb-2">Treino do Dia</h1>
          <div className="mt-12 text-center">
            <p className="text-4xl mb-3">🎉</p>
            <p className="font-syne font-bold text-teal text-lg">Nenhum treino hoje!</p>
            <p className="text-sm text-teal/50 mt-1">Descanse bem. Até amanhã.</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (screen === 'select') {
    return (
      <AppLayout>
        <div className="px-4 py-8 md:px-8 max-w-lg">
          <h1 className="page-title mb-1">Treino do Dia</h1>
          <p className="text-sm text-teal/50 mb-6">Escolha qual treino fazer hoje</p>

          <div className="space-y-3">
            {options.map(opt => (
              <button
                key={opt.workout.id}
                type="button"
                onClick={() => handleSelectWorkout(opt)}
                className="
                  w-full text-left bg-white rounded-card border border-teal/[0.09]
                  shadow-card p-5 hover:border-copper/40 active:scale-[0.99]
                  transition-all
                "
              >
                <p className="text-xs text-teal/40 mb-0.5">{opt.plan}</p>
                <p className="font-syne font-bold text-teal text-lg">{opt.workout.name}</p>
                <p className="text-sm text-teal/50 mt-1">
                  {opt.workout.exercises.length} exercícios
                  {opt.workout.estimated_duration_min && ` · ~${opt.workout.estimated_duration_min} min`}
                </p>
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
          </div>
        </div>
      </AppLayout>
    )
  }

  // screen === 'executing'
  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-lg">
        {/* Hero card */}
        <div className="bg-teal rounded-card p-5 mb-6 text-white">
          <p className="text-xs text-white/50 mb-1">{selected?.plan}</p>
          <h1 className="font-syne font-extrabold text-2xl tracking-[-0.02em]">
            {selected?.workout.name}
          </h1>
          <div className="flex gap-4 mt-3 text-sm text-white/60">
            <span>{selected?.workout.exercises.length} exercícios</span>
            <span className="font-jetbrains">{totalSets} séries</span>
            {selected?.workout.estimated_duration_min && (
              <span>~{selected.workout.estimated_duration_min} min</span>
            )}
          </div>

          {/* Start session button — shown until first set is logged */}
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

        {/* Exercise list */}
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

        {/* Finish button */}
        {allExercisesDone && (
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
