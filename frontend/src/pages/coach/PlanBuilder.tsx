import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'

interface Exercise {
  id: string
  name: string
  sets: number
  reps_min: number
  reps_max: number | null
  order_index: number
  demo_url: string | null
  rest_seconds: number | null
  warmup_type: 'aquecimento' | 'reconhecimento' | null
  warmup_sets: number | null
  warmup_reps: number | null
}

interface Workout {
  id: string
  name: string
  format: 'structured' | 'freeform'
  content: string | null
  weekday: number | null
  sequence_position: number | null
  estimated_duration_min: number | null
  notes: string | null
  exercises: Exercise[]
}

interface Plan {
  id: string
  name: string
  schedule_type: 'fixed_days' | 'sequence'
  notes: string | null
  workouts: Workout[]
}

type Phase = 'create' | 'build'

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const WARMUP_TYPES = [
  { value: 'aquecimento', label: 'Aquecimento' },
  { value: 'reconhecimento', label: 'Reconhecimento' },
] as const

export default function PlanBuilder() {
  const { id: studentId } = useParams<{ id: string }>()
  const { session } = useAuth()

  const [phase, setPhase] = useState<Phase>('create')
  const [plan, setPlan] = useState<Plan | null>(null)

  // Create plan form
  const [planName, setPlanName] = useState('')
  const [scheduleType, setScheduleType] = useState<'fixed_days' | 'sequence'>('sequence')
  const [planNotes, setPlanNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Workout management
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null)
  const [addingWorkout, setAddingWorkout] = useState(false)
  const [workoutName, setWorkoutName] = useState('')
  const [workoutFormat, setWorkoutFormat] = useState<'structured' | 'freeform'>('structured')
  const [workoutContent, setWorkoutContent] = useState('')
  const [workoutWeekday, setWorkoutWeekday] = useState(0)
  const [workoutDuration, setWorkoutDuration] = useState('')
  const [workoutNotes, setWorkoutNotes] = useState('')
  const [savingWorkout, setSavingWorkout] = useState(false)
  const [workoutError, setWorkoutError] = useState('')

  // Exercise management
  const [addingExerciseToId, setAddingExerciseToId] = useState<string | null>(null)
  const [exName, setExName] = useState('')
  const [exSets, setExSets] = useState('')
  const [exRepsMin, setExRepsMin] = useState('')
  const [exRepsMax, setExRepsMax] = useState('')
  const [exRest, setExRest] = useState('')
  const [exDemoUrl, setExDemoUrl] = useState('')
  const [exWarmupEnabled, setExWarmupEnabled] = useState(false)
  const [exWarmupType, setExWarmupType] = useState<'aquecimento' | 'reconhecimento'>('aquecimento')
  const [exWarmupSets, setExWarmupSets] = useState('')
  const [exWarmupReps, setExWarmupReps] = useState('')
  const [savingExercise, setSavingExercise] = useState(false)
  const [exerciseError, setExerciseError] = useState('')

  const api = session?.access_token ? createApi(session.access_token) : null

  // -- Create plan --
  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault()
    if (!api || !studentId) return
    setCreating(true)
    setCreateError('')
    try {
      const data = await api.post<Plan>('/workouts/plans', {
        student_id: studentId,
        name: planName,
        schedule_type: scheduleType,
        notes: planNotes || null,
      })
      setPlan({ ...data, workouts: [] })
      setPhase('build')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erro ao criar ficha')
    } finally {
      setCreating(false)
    }
  }

  // -- Add workout --
  async function handleAddWorkout(e: React.FormEvent) {
    e.preventDefault()
    if (!api || !plan) return
    setSavingWorkout(true)
    setWorkoutError('')
    try {
      const nextPosition = plan.workouts.length + 1
      const data = await api.post<Workout>(`/workouts/plans/${plan.id}/workouts`, {
        name: workoutName,
        format: workoutFormat,
        content: workoutFormat === 'freeform' ? workoutContent : null,
        weekday: scheduleType === 'fixed_days' ? workoutWeekday : null,
        sequence_position: scheduleType === 'sequence' ? nextPosition : null,
        estimated_duration_min: workoutDuration ? parseInt(workoutDuration, 10) : null,
        notes: workoutNotes || null,
      })
      const workout = { ...data, exercises: data.exercises ?? [] }
      setPlan(prev => prev ? { ...prev, workouts: [...prev.workouts, workout] } : prev)
      setWorkoutName('')
      setWorkoutFormat('structured')
      setWorkoutContent('')
      setWorkoutDuration('')
      setWorkoutNotes('')
      setAddingWorkout(false)
      setExpandedWorkoutId(workout.id)
    } catch (err) {
      setWorkoutError(err instanceof Error ? err.message : 'Erro ao adicionar treino')
    } finally {
      setSavingWorkout(false)
    }
  }

  // -- Add exercise --
  function resetExerciseForm() {
    setExName('')
    setExSets('')
    setExRepsMin('')
    setExRepsMax('')
    setExRest('')
    setExDemoUrl('')
    setExWarmupEnabled(false)
    setExWarmupType('aquecimento')
    setExWarmupSets('')
    setExWarmupReps('')
    setExerciseError('')
  }

  async function handleAddExercise(e: React.FormEvent, workoutId: string) {
    e.preventDefault()
    if (!api || !plan) return
    setSavingExercise(true)
    setExerciseError('')

    const workout = plan.workouts.find(w => w.id === workoutId)
    const orderIndex = workout ? workout.exercises.length + 1 : 1

    try {
      const data = await api.post<Exercise>(`/workouts/${workoutId}/exercises`, {
        name: exName,
        sets: parseInt(exSets, 10),
        reps_min: parseInt(exRepsMin, 10),
        reps_max: exRepsMax ? parseInt(exRepsMax, 10) : null,
        order_index: orderIndex,
        demo_url: exDemoUrl || null,
        rest_seconds: exRest ? parseInt(exRest, 10) : null,
        warmup_type: exWarmupEnabled ? exWarmupType : null,
        warmup_sets: exWarmupEnabled && exWarmupSets ? parseInt(exWarmupSets, 10) : null,
        warmup_reps: exWarmupEnabled && exWarmupReps ? parseInt(exWarmupReps, 10) : null,
      })
      setPlan(prev => {
        if (!prev) return prev
        return {
          ...prev,
          workouts: prev.workouts.map(w =>
            w.id === workoutId ? { ...w, exercises: [...w.exercises, data] } : w,
          ),
        }
      })
      resetExerciseForm()
      setAddingExerciseToId(null)
    } catch (err) {
      setExerciseError(err instanceof Error ? err.message : 'Erro ao adicionar exercício')
    } finally {
      setSavingExercise(false)
    }
  }

  // -- Phase 1: Create plan --
  if (phase === 'create') {
    return (
      <AppLayout>
        <div className="px-4 py-6 md:px-8 max-w-lg">
          <Link
            to={`/coach/students/${studentId}`}
            className="inline-flex items-center gap-1 text-sm text-teal/50 hover:text-teal mb-5 transition-colors"
          >
            ← Voltar
          </Link>

          <h1 className="page-title mb-1">Nova ficha de treino</h1>
          <p className="text-sm text-teal/50 mb-6">Defina o nome e tipo de programação</p>

          <form onSubmit={handleCreatePlan} className="space-y-4">
            <div>
              <label className="block text-sm text-teal/60 mb-1.5">Nome da ficha</label>
              <input
                type="text"
                value={planName}
                onChange={e => setPlanName(e.target.value)}
                required
                placeholder="Ex: Hipertrofia — Abril"
                className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-teal/60 mb-1.5">Tipo de programação</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleType('sequence')}
                  className={`flex-1 rounded-btn py-2.5 text-sm font-medium transition-all ${
                    scheduleType === 'sequence'
                      ? 'bg-copper text-white shadow-btn'
                      : 'border border-teal/[0.15] text-teal/60'
                  }`}
                >
                  Sequencial
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleType('fixed_days')}
                  className={`flex-1 rounded-btn py-2.5 text-sm font-medium transition-all ${
                    scheduleType === 'fixed_days'
                      ? 'bg-copper text-white shadow-btn'
                      : 'border border-teal/[0.15] text-teal/60'
                  }`}
                >
                  Dias fixos
                </button>
              </div>
              <p className="text-xs text-teal/40 mt-1.5">
                {scheduleType === 'sequence'
                  ? 'Aluno executa os treinos em ordem (A → B → C → A...)'
                  : 'Cada treino é atribuído a um dia da semana'}
              </p>
            </div>

            <div>
              <label className="block text-sm text-teal/60 mb-1.5">
                Observações da ficha <span className="text-teal/30">(opcional)</span>
              </label>
              <textarea
                value={planNotes}
                onChange={e => setPlanNotes(e.target.value)}
                rows={3}
                placeholder="Orientações gerais para o aluno sobre esta ficha..."
                className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors resize-none"
              />
            </div>

            {createError && <p className="text-sm text-red-500">{createError}</p>}

            <button
              type="submit"
              disabled={creating || !planName.trim()}
              className="w-full bg-copper text-white rounded-btn py-3 text-sm font-medium shadow-btn hover:opacity-90 disabled:opacity-40 transition-all"
            >
              {creating ? 'Criando...' : 'Criar ficha'}
            </button>
          </form>
        </div>
      </AppLayout>
    )
  }

  // -- Phase 2: Build workouts + exercises --
  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-2xl">
        <Link
          to={`/coach/students/${studentId}`}
          className="inline-flex items-center gap-1 text-sm text-teal/50 hover:text-teal mb-5 transition-colors"
        >
          ← Voltar ao aluno
        </Link>

        {/* Plan header */}
        <div className="mb-6">
          <h1 className="page-title mb-0.5">{plan?.name}</h1>
          <span className="text-xs font-medium bg-teal/10 text-teal px-2 py-0.5 rounded-full">
            {plan?.schedule_type === 'sequence' ? 'Sequencial' : 'Dias fixos'}
          </span>
          {plan?.notes && (
            <p className="mt-2 text-sm text-teal/60 bg-teal/[0.04] rounded-lg px-3 py-2 leading-relaxed">
              {plan.notes}
            </p>
          )}
        </div>

        {/* Workout cards */}
        {plan?.workouts.length === 0 && !addingWorkout && (
          <div className="text-center py-10">
            <p className="text-3xl mb-3">📋</p>
            <p className="font-medium text-teal">Nenhum treino ainda</p>
            <p className="text-sm text-teal/50 mt-1">Adicione treinos a esta ficha</p>
          </div>
        )}

        <div className="space-y-3">
          {plan?.workouts.map(workout => {
            const isExpanded = expandedWorkoutId === workout.id
            return (
              <div
                key={workout.id}
                className="bg-white rounded-card border border-teal/[0.09] shadow-card overflow-hidden"
              >
                {/* Workout header (clickable) */}
                <button
                  type="button"
                  onClick={() => setExpandedWorkoutId(isExpanded ? null : workout.id)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div>
                    <p className="font-syne font-bold text-teal">{workout.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {workout.weekday !== null && (
                        <span className="text-xs text-copper font-medium">{WEEKDAYS[workout.weekday]}</span>
                      )}
                      {workout.sequence_position !== null && (
                        <span className="text-xs text-copper font-medium">Treino {workout.sequence_position}</span>
                      )}
                      <span className="text-xs text-teal/40">
                        {workout.exercises.length} exercício{workout.exercises.length !== 1 ? 's' : ''}
                      </span>
                      {workout.estimated_duration_min && (
                        <span className="text-xs text-teal/40">· ~{workout.estimated_duration_min} min</span>
                      )}
                    </div>
                  </div>
                  <svg
                    className={`w-4 h-4 text-teal/30 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-teal/[0.06] px-4 pb-4">
                    {/* Workout notes */}
                    {workout.notes && (
                      <div className="mt-3 bg-teal/[0.04] rounded-lg px-3 py-2">
                        <p className="text-xs text-teal/60 leading-relaxed">{workout.notes}</p>
                      </div>
                    )}

                    {/* Freeform content */}
                    {workout.format === 'freeform' && workout.content && (
                      <div className="mt-3 prose prose-sm max-w-none text-teal/70 whitespace-pre-wrap text-sm leading-relaxed">
                        {workout.content}
                      </div>
                    )}

                    {/* Structured: Exercise list */}
                    {workout.format !== 'freeform' && workout.exercises.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {workout.exercises.map(ex => (
                          <div key={ex.id} className="flex items-start gap-3 py-1.5">
                            <span className="text-xs font-jetbrains text-teal/30 w-5 shrink-0 mt-0.5">{ex.order_index}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-teal truncate">{ex.name}</p>
                              <p className="text-xs text-teal/40">
                                {ex.sets} séries · {ex.reps_min}{ex.reps_max ? `–${ex.reps_max}` : ''} reps
                                {ex.rest_seconds ? ` · ${ex.rest_seconds}s` : ''}
                              </p>
                              {ex.warmup_type && (
                                <p className="text-xs text-teal/30 mt-0.5">
                                  {ex.warmup_type === 'aquecimento' ? 'Aquec.' : 'Reconh.'}: {ex.warmup_sets}×{ex.warmup_reps}
                                </p>
                              )}
                            </div>
                            {ex.demo_url && (
                              <a href={ex.demo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-copper hover:underline shrink-0">
                                Demo
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add exercise form */}
                    {workout.format === 'freeform' ? null : addingExerciseToId === workout.id ? (
                      <form onSubmit={e => handleAddExercise(e, workout.id)} className="mt-3 space-y-3 pt-3 border-t border-teal/[0.06]">
                        <input
                          type="text"
                          value={exName}
                          onChange={e => setExName(e.target.value)}
                          required
                          placeholder="Nome do exercício"
                          className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-teal/40 mb-1">Séries</label>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={exSets}
                              onChange={e => setExSets(e.target.value)}
                              required
                              min={1}
                              placeholder="3"
                              className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-teal/40 mb-1">Reps mín</label>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={exRepsMin}
                              onChange={e => setExRepsMin(e.target.value)}
                              required
                              min={1}
                              placeholder="8"
                              className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-teal/40 mb-1">Reps máx</label>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={exRepsMax}
                              onChange={e => setExRepsMax(e.target.value)}
                              min={1}
                              placeholder="12"
                              className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-teal/40 mb-1">Descanso entre séries (segundos)</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={exRest}
                            onChange={e => setExRest(e.target.value)}
                            min={0}
                            placeholder="60"
                            className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                          />
                        </div>

                        <input
                          type="url"
                          value={exDemoUrl}
                          onChange={e => setExDemoUrl(e.target.value)}
                          placeholder="Link de demonstração (opcional)"
                          className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors"
                        />

                        {/* Warmup block toggle */}
                        <div>
                          <button
                            type="button"
                            onClick={() => setExWarmupEnabled(v => !v)}
                            className={`text-xs font-medium transition-colors ${
                              exWarmupEnabled ? 'text-copper' : 'text-teal/40 hover:text-teal/60'
                            }`}
                          >
                            {exWarmupEnabled ? '− Remover bloco de aquecimento' : '+ Adicionar bloco de aquecimento'}
                          </button>

                          {exWarmupEnabled && (
                            <div className="mt-2 p-3 bg-teal/[0.04] rounded-lg space-y-2">
                              <div className="flex gap-2">
                                {WARMUP_TYPES.map(wt => (
                                  <button
                                    key={wt.value}
                                    type="button"
                                    onClick={() => setExWarmupType(wt.value)}
                                    className={`flex-1 rounded-btn py-1.5 text-xs font-medium transition-all ${
                                      exWarmupType === wt.value
                                        ? 'bg-teal text-white'
                                        : 'border border-teal/[0.15] text-teal/60'
                                    }`}
                                  >
                                    {wt.label}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <label className="block text-xs text-teal/40 mb-1">Séries</label>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={exWarmupSets}
                                    onChange={e => setExWarmupSets(e.target.value)}
                                    required={exWarmupEnabled}
                                    min={1}
                                    placeholder="2"
                                    className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="block text-xs text-teal/40 mb-1">Reps</label>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={exWarmupReps}
                                    onChange={e => setExWarmupReps(e.target.value)}
                                    required={exWarmupEnabled}
                                    min={1}
                                    placeholder="10"
                                    className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {exerciseError && <p className="text-xs text-red-500">{exerciseError}</p>}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setAddingExerciseToId(null); resetExerciseForm() }}
                            className="flex-1 border border-teal/[0.15] rounded-btn py-2 text-sm font-medium text-teal/60 hover:bg-surface transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={savingExercise}
                            className="flex-1 bg-copper text-white rounded-btn py-2 text-sm font-medium shadow-btn hover:opacity-90 disabled:opacity-40 transition-all"
                          >
                            {savingExercise ? 'Salvando...' : 'Adicionar'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setAddingExerciseToId(workout.id); resetExerciseForm() }}
                        className="mt-3 text-sm text-copper font-medium hover:underline"
                      >
                        + Adicionar exercício
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Add workout form */}
        {addingWorkout ? (
          <form onSubmit={handleAddWorkout} className="mt-4 bg-white rounded-card border border-copper/20 shadow-card p-5 space-y-3">
            <h3 className="font-syne font-bold text-teal text-sm">Novo treino</h3>
            <input
              type="text"
              value={workoutName}
              onChange={e => setWorkoutName(e.target.value)}
              required
              placeholder="Ex: Treino A — Peito e Tríceps"
              className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors"
            />

            {/* Format selector */}
            <div>
              <label className="block text-xs text-teal/40 mb-1.5">Formato</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setWorkoutFormat('structured')}
                  className={`flex-1 rounded-btn py-2 text-xs font-medium transition-all ${
                    workoutFormat === 'structured'
                      ? 'bg-copper text-white shadow-btn'
                      : 'border border-teal/[0.15] text-teal/60'
                  }`}
                >
                  Estruturado
                </button>
                <button
                  type="button"
                  onClick={() => setWorkoutFormat('freeform')}
                  className={`flex-1 rounded-btn py-2 text-xs font-medium transition-all ${
                    workoutFormat === 'freeform'
                      ? 'bg-copper text-white shadow-btn'
                      : 'border border-teal/[0.15] text-teal/60'
                  }`}
                >
                  Livre
                </button>
              </div>
              <p className="text-xs text-teal/40 mt-1">
                {workoutFormat === 'structured'
                  ? 'Exercícios com séries, reps e carga'
                  : 'Texto livre — ideal pra corrida, WOD, circuitos'}
              </p>
            </div>

            {/* Freeform content */}
            {workoutFormat === 'freeform' && (
              <textarea
                value={workoutContent}
                onChange={e => setWorkoutContent(e.target.value)}
                required
                rows={6}
                placeholder={"Ex:\n5km corrida moderada\n— ou —\n21-15-9\nThrusters 43kg\nPull-ups"}
                className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors resize-none font-jetbrains"
              />
            )}

            <div className="flex gap-2">
              {scheduleType === 'fixed_days' && (
                <div className="flex-1">
                  <label className="block text-xs text-teal/40 mb-1">Dia da semana</label>
                  <select
                    value={workoutWeekday}
                    onChange={e => setWorkoutWeekday(parseInt(e.target.value, 10))}
                    className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal bg-white focus:outline-none focus:border-copper transition-colors"
                  >
                    {WEEKDAYS.map((day, i) => (
                      <option key={i} value={i}>{day}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex-1">
                <label className="block text-xs text-teal/40 mb-1">Duração (min)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={workoutDuration}
                  onChange={e => setWorkoutDuration(e.target.value)}
                  placeholder="60"
                  min={1}
                  className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-teal/40 mb-1">
                Observações do treino <span className="text-teal/25">(opcional)</span>
              </label>
              <textarea
                value={workoutNotes}
                onChange={e => setWorkoutNotes(e.target.value)}
                rows={2}
                placeholder="Dicas ou orientações específicas para este treino..."
                className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors resize-none"
              />
            </div>

            {workoutError && <p className="text-xs text-red-500">{workoutError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setAddingWorkout(false); setWorkoutError('') }}
                className="flex-1 border border-teal/[0.15] rounded-btn py-2.5 text-sm font-medium text-teal/60 hover:bg-surface transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingWorkout || !workoutName.trim()}
                className="flex-1 bg-copper text-white rounded-btn py-2.5 text-sm font-medium shadow-btn hover:opacity-90 disabled:opacity-40 transition-all"
              >
                {savingWorkout ? 'Salvando...' : 'Adicionar treino'}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingWorkout(true)}
            className="mt-4 w-full border-2 border-dashed border-teal/[0.12] rounded-card py-4 text-sm font-medium text-teal/40 hover:border-copper/30 hover:text-copper transition-colors"
          >
            + Adicionar treino
          </button>
        )}

        {/* Done link */}
        {plan && plan.workouts.length > 0 && (
          <Link
            to={`/coach/students/${studentId}`}
            className="block mt-6 w-full bg-teal text-white rounded-btn py-3 text-sm font-medium text-center hover:opacity-90 transition-all"
          >
            Concluir ficha
          </Link>
        )}
      </div>
    </AppLayout>
  )
}
