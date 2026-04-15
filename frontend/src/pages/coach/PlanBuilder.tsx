import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'

interface CatalogSuggestion {
  id: string
  name: string
  demo_url: string | null
}

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
  notes: string | null
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
  start_date: string | null
  end_date: string | null
  workouts: Workout[]
}

type Phase = 'create' | 'build'

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const WARMUP_TYPES = [
  { value: 'aquecimento', label: 'Aquecimento' },
  { value: 'reconhecimento', label: 'Reconhecimento' },
] as const

export default function PlanBuilder() {
  const { id: studentId, planId } = useParams<{ id: string; planId?: string }>()
  const { session } = useAuth()
  const isEditing = !!planId

  const [phase, setPhase] = useState<Phase>(isEditing ? 'build' : 'create')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loadingPlan, setLoadingPlan] = useState(isEditing)

  // Create plan form
  const [planName, setPlanName] = useState('')
  const [scheduleType, setScheduleType] = useState<'fixed_days' | 'sequence'>('sequence')
  const [planNotes, setPlanNotes] = useState('')
  const [planStartDate, setPlanStartDate] = useState('')
  const [planEndDate, setPlanEndDate] = useState('')
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
  const [exCatalogId, setExCatalogId] = useState<string | null>(null)
  const [exSets, setExSets] = useState('')
  const [exRepsMin, setExRepsMin] = useState('')
  const [exRepsMax, setExRepsMax] = useState('')
  const [exRest, setExRest] = useState('')
  const [exWarmupEnabled, setExWarmupEnabled] = useState(false)
  const [exWarmupType, setExWarmupType] = useState<'aquecimento' | 'reconhecimento'>('aquecimento')
  const [exWarmupSets, setExWarmupSets] = useState('')
  const [exWarmupReps, setExWarmupReps] = useState('')
  const [savingExercise, setSavingExercise] = useState(false)
  const [exerciseError, setExerciseError] = useState('')

  // Exercise notes
  const [exNotes, setExNotes] = useState('')

  // Catalog autocomplete
  const [exSuggestions, setExSuggestions] = useState<CatalogSuggestion[]>([])
  const [exShowDropdown, setExShowDropdown] = useState(false)
  const exDebounceRef = useRef<number | null>(null)

  // Inline editing
  const [editingPlanName, setEditingPlanName] = useState(false)
  const [editPlanNameVal, setEditPlanNameVal] = useState('')
  const [editingPlanNotes, setEditingPlanNotes] = useState(false)
  const [editPlanNotesVal, setEditPlanNotesVal] = useState('')
  const [editingPlanDates, setEditingPlanDates] = useState(false)
  const [editPlanStartDate, setEditPlanStartDate] = useState('')
  const [editPlanEndDate, setEditPlanEndDate] = useState('')
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null)
  const [editWorkoutNameVal, setEditWorkoutNameVal] = useState('')
  const [editWorkoutNotesVal, setEditWorkoutNotesVal] = useState('')
  const [confirmDeleteWorkoutId, setConfirmDeleteWorkoutId] = useState<string | null>(null)
  const [confirmDeleteExId, setConfirmDeleteExId] = useState<string | null>(null)

  const api = session?.access_token ? createApi(session.access_token) : null

  // Load existing plan for edit mode
  const loadPlan = useCallback(async () => {
    if (!api || !planId) return
    try {
      const data = await api.get<Plan>(`/workouts/plans/${planId}`)
      setPlan(data)
      setPhase('build')
    } catch {
      setCreateError('Erro ao carregar ficha.')
    } finally {
      setLoadingPlan(false)
    }
  }, [api, planId])

  useEffect(() => {
    if (isEditing) loadPlan()
  }, [isEditing, loadPlan])

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
        start_date: planStartDate || null,
        end_date: planEndDate || null,
      })
      setPlan({ ...data, workouts: [] })
      setPhase('build')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erro ao criar ficha')
    } finally {
      setCreating(false)
    }
  }

  // -- Edit plan name --
  async function handleSavePlanName() {
    if (!api || !plan || !editPlanNameVal.trim()) return
    try {
      const updated = await api.patch<Plan>(`/workouts/plans/${plan.id}`, { name: editPlanNameVal.trim() })
      setPlan(prev => prev ? { ...prev, name: updated.name } : prev)
      setEditingPlanName(false)
    } catch { /* ignore */ }
  }

  async function handleSavePlanNotes() {
    if (!api || !plan) return
    try {
      await api.patch(`/workouts/plans/${plan.id}`, { notes: editPlanNotesVal || null })
      setPlan(prev => prev ? { ...prev, notes: editPlanNotesVal || null } : prev)
      setEditingPlanNotes(false)
    } catch { /* ignore */ }
  }

  async function handleSavePlanDates() {
    if (!api || !plan) return
    try {
      await api.patch(`/workouts/plans/${plan.id}`, {
        start_date: editPlanStartDate || null,
        end_date: editPlanEndDate || null,
      })
      setPlan(prev => prev ? {
        ...prev,
        start_date: editPlanStartDate || null,
        end_date: editPlanEndDate || null,
      } : prev)
      setEditingPlanDates(false)
    } catch { /* ignore */ }
  }

  // -- Edit workout --
  async function handleSaveWorkoutEdit(workoutId: string) {
    if (!api || !editWorkoutNameVal.trim()) return
    try {
      const updated = await api.patch<Workout>(`/workouts/workouts/${workoutId}`, {
        name: editWorkoutNameVal.trim(),
        notes: editWorkoutNotesVal || null,
      })
      setPlan(prev => {
        if (!prev) return prev
        return {
          ...prev,
          workouts: prev.workouts.map(w =>
            w.id === workoutId ? { ...w, name: updated.name, notes: updated.notes ?? null } : w,
          ),
        }
      })
      setEditingWorkoutId(null)
    } catch { /* ignore */ }
  }

  // -- Delete workout --
  async function handleDeleteWorkout(workoutId: string) {
    if (!api) return
    try {
      await api.delete(`/workouts/workouts/${workoutId}`)
      setPlan(prev => prev ? { ...prev, workouts: prev.workouts.filter(w => w.id !== workoutId) } : prev)
      setConfirmDeleteWorkoutId(null)
    } catch { /* ignore */ }
  }

  // -- Delete exercise --
  async function handleDeleteExercise(workoutId: string, exerciseId: string) {
    if (!api) return
    try {
      await api.delete(`/workouts/exercises/${exerciseId}`)
      setPlan(prev => {
        if (!prev) return prev
        return {
          ...prev,
          workouts: prev.workouts.map(w =>
            w.id === workoutId
              ? { ...w, exercises: w.exercises.filter(ex => ex.id !== exerciseId) }
              : w,
          ),
        }
      })
      setConfirmDeleteExId(null)
    } catch { /* ignore */ }
  }

  // -- Add workout --
  async function handleAddWorkout(e: React.FormEvent) {
    e.preventDefault()
    if (!api || !plan) return
    setSavingWorkout(true)
    setWorkoutError('')
    try {
      const schedType = plan.schedule_type
      const nextPosition = plan.workouts.length + 1
      const data = await api.post<Workout>(`/workouts/plans/${plan.id}/workouts`, {
        name: workoutName,
        format: workoutFormat,
        content: workoutFormat === 'freeform' ? workoutContent : null,
        weekday: schedType === 'fixed_days' ? workoutWeekday : null,
        sequence_position: schedType === 'sequence' ? nextPosition : null,
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
    setExCatalogId(null)
    setExSuggestions([])
    setExShowDropdown(false)
    setExSets('')
    setExRepsMin('')
    setExRepsMax('')
    setExRest('')
    setExWarmupEnabled(false)
    setExWarmupType('aquecimento')
    setExWarmupSets('')
    setExWarmupReps('')
    setExNotes('')
    setExerciseError('')
  }

  // Debounced catalog search. Any time the user edits the name input, the
  // previously-selected catalog_id is cleared — they must pick again from
  // the dropdown (or let the backend upsert by name on submit).
  function handleExNameChange(value: string) {
    setExName(value)
    setExCatalogId(null)
    if (exDebounceRef.current) window.clearTimeout(exDebounceRef.current)
    if (!api || !value.trim()) {
      setExSuggestions([])
      setExShowDropdown(false)
      return
    }
    exDebounceRef.current = window.setTimeout(async () => {
      try {
        const data = await api.get<CatalogSuggestion[]>(
          `/catalog?q=${encodeURIComponent(value.trim())}`,
        )
        setExSuggestions(data)
        setExShowDropdown(data.length > 0)
      } catch {
        setExSuggestions([])
        setExShowDropdown(false)
      }
    }, 200)
  }

  function pickSuggestion(s: CatalogSuggestion) {
    setExName(s.name)
    setExCatalogId(s.id)
    setExSuggestions([])
    setExShowDropdown(false)
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
        // Either a catalog_id (picked from dropdown) or a free-text name
        // (the backend auto-upserts it into this coach's catalog).
        catalog_id: exCatalogId,
        name: exCatalogId ? null : exName.trim(),
        sets: parseInt(exSets, 10),
        reps_min: parseInt(exRepsMin, 10),
        reps_max: exRepsMax ? parseInt(exRepsMax, 10) : null,
        order_index: orderIndex,
        rest_seconds: exRest ? parseInt(exRest, 10) : null,
        warmup_type: exWarmupEnabled ? exWarmupType : null,
        warmup_sets: exWarmupEnabled && exWarmupSets ? parseInt(exWarmupSets, 10) : null,
        warmup_reps: exWarmupEnabled && exWarmupReps ? parseInt(exWarmupReps, 10) : null,
        notes: exNotes || null,
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

  // -- Loading --
  if (loadingPlan) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-copper border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-teal/60 mb-1.5">
                  Início <span className="text-teal/30">(opcional)</span>
                </label>
                <input
                  type="date"
                  value={planStartDate}
                  onChange={e => setPlanStartDate(e.target.value)}
                  className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal focus:outline-none focus:border-copper transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-teal/60 mb-1.5">
                  Fim <span className="text-teal/30">(opcional)</span>
                </label>
                <input
                  type="date"
                  value={planEndDate}
                  onChange={e => setPlanEndDate(e.target.value)}
                  className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal focus:outline-none focus:border-copper transition-colors"
                />
              </div>
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
  const schedType = plan?.schedule_type ?? 'sequence'

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-2xl">
        <Link
          to={`/coach/students/${studentId}`}
          className="inline-flex items-center gap-1 text-sm text-teal/50 hover:text-teal mb-5 transition-colors"
        >
          ← Voltar ao aluno
        </Link>

        {/* Plan header — editable */}
        <div className="mb-6">
          {editingPlanName ? (
            <div className="flex items-center gap-2 mb-1">
              <input
                type="text"
                value={editPlanNameVal}
                onChange={e => setEditPlanNameVal(e.target.value)}
                autoFocus
                className="border border-copper rounded-btn px-3 py-1.5 text-lg font-syne font-extrabold text-teal focus:outline-none flex-1"
                onKeyDown={e => { if (e.key === 'Enter') handleSavePlanName(); if (e.key === 'Escape') setEditingPlanName(false) }}
              />
              <button type="button" onClick={handleSavePlanName} className="text-xs text-copper font-medium">Salvar</button>
              <button type="button" onClick={() => setEditingPlanName(false)} className="text-xs text-teal/40">Cancelar</button>
            </div>
          ) : (
            <h1
              className="page-title mb-0.5 cursor-pointer hover:text-copper transition-colors"
              onClick={() => { setEditPlanNameVal(plan?.name ?? ''); setEditingPlanName(true) }}
              title="Clique para editar"
            >
              {plan?.name}
            </h1>
          )}
          <span className="text-xs font-medium bg-teal/10 text-teal px-2 py-0.5 rounded-full">
            {schedType === 'sequence' ? 'Sequencial' : 'Dias fixos'}
          </span>

          {/* Plan dates — editable */}
          {editingPlanDates ? (
            <div className="mt-2 flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-xs text-teal/40 mb-1">Início</label>
                <input
                  type="date"
                  value={editPlanStartDate}
                  onChange={e => setEditPlanStartDate(e.target.value)}
                  autoFocus
                  className="border border-copper rounded-btn px-2 py-1 text-xs text-teal focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-teal/40 mb-1">Fim</label>
                <input
                  type="date"
                  value={editPlanEndDate}
                  onChange={e => setEditPlanEndDate(e.target.value)}
                  className="border border-copper rounded-btn px-2 py-1 text-xs text-teal focus:outline-none"
                />
              </div>
              <div className="flex gap-2 items-center pb-0.5">
                <button type="button" onClick={handleSavePlanDates} className="text-xs text-copper font-medium">Salvar</button>
                <button type="button" onClick={() => setEditingPlanDates(false)} className="text-xs text-teal/40">Cancelar</button>
              </div>
            </div>
          ) : (
            <div
              className="mt-1.5 cursor-pointer group inline-block"
              onClick={() => {
                setEditPlanStartDate(plan?.start_date ?? '')
                setEditPlanEndDate(plan?.end_date ?? '')
                setEditingPlanDates(true)
              }}
              title="Clique para editar datas"
            >
              {plan?.start_date || plan?.end_date ? (
                <p className="text-xs text-teal/50 bg-teal/[0.04] rounded px-2 py-1 group-hover:border-copper/30 border border-transparent transition-colors">
                  {plan.start_date && new Date(plan.start_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {plan.start_date && plan.end_date && ' – '}
                  {plan.end_date && new Date(plan.end_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              ) : (
                <p className="text-xs text-teal/30 hover:text-copper transition-colors">+ Adicionar período da ficha</p>
              )}
            </div>
          )}

          {/* Plan notes — editable */}
          {editingPlanNotes ? (
            <div className="mt-2">
              <textarea
                value={editPlanNotesVal}
                onChange={e => setEditPlanNotesVal(e.target.value)}
                autoFocus
                rows={3}
                className="w-full border border-copper rounded-btn px-3 py-2 text-sm text-teal focus:outline-none resize-none"
                placeholder="Observações da ficha..."
              />
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={handleSavePlanNotes} className="text-xs text-copper font-medium">Salvar</button>
                <button type="button" onClick={() => setEditingPlanNotes(false)} className="text-xs text-teal/40">Cancelar</button>
              </div>
            </div>
          ) : (
            <div
              className="mt-2 cursor-pointer group"
              onClick={() => { setEditPlanNotesVal(plan?.notes ?? ''); setEditingPlanNotes(true) }}
              title="Clique para editar observações"
            >
              {plan?.notes ? (
                <p className="text-sm text-teal/60 bg-teal/[0.04] rounded-lg px-3 py-2 leading-relaxed group-hover:border-copper/30 border border-transparent transition-colors">
                  {plan.notes}
                </p>
              ) : (
                <p className="text-xs text-teal/30 hover:text-copper transition-colors">+ Adicionar observações da ficha</p>
              )}
            </div>
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
            const isEditingThisWorkout = editingWorkoutId === workout.id
            return (
              <div
                key={workout.id}
                className="bg-white rounded-card border border-teal/[0.09] shadow-card overflow-hidden"
              >
                {/* Workout header */}
                <div className="flex items-center justify-between p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedWorkoutId(isExpanded ? null : workout.id)}
                    className="flex-1 text-left"
                  >
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
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Edit workout button */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingWorkoutId(workout.id)
                        setEditWorkoutNameVal(workout.name)
                        setEditWorkoutNotesVal(workout.notes ?? '')
                        setExpandedWorkoutId(workout.id)
                      }}
                      className="text-teal/20 hover:text-copper transition-colors p-1"
                      title="Editar treino"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                      </svg>
                    </button>
                    {/* Delete workout */}
                    {confirmDeleteWorkoutId === workout.id ? (
                      <div className="flex items-center gap-1 ml-1">
                        <button type="button" onClick={() => setConfirmDeleteWorkoutId(null)} className="text-xs text-teal/40">N</button>
                        <button type="button" onClick={() => handleDeleteWorkout(workout.id)} className="text-xs text-red-500 font-medium">S</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteWorkoutId(workout.id)}
                        className="text-teal/20 hover:text-red-400 transition-colors p-1"
                        title="Remover treino"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                    <svg
                      onClick={() => setExpandedWorkoutId(isExpanded ? null : workout.id)}
                      className={`w-4 h-4 text-teal/30 shrink-0 transition-transform cursor-pointer ml-1 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-teal/[0.06] px-4 pb-4">
                    {/* Inline edit workout name/notes */}
                    {isEditingThisWorkout && (
                      <div className="mt-3 space-y-2 p-3 bg-surface rounded-lg">
                        <input
                          type="text"
                          value={editWorkoutNameVal}
                          onChange={e => setEditWorkoutNameVal(e.target.value)}
                          className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal focus:outline-none focus:border-copper transition-colors"
                          placeholder="Nome do treino"
                        />
                        <textarea
                          value={editWorkoutNotesVal}
                          onChange={e => setEditWorkoutNotesVal(e.target.value)}
                          rows={2}
                          className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal focus:outline-none focus:border-copper transition-colors resize-none"
                          placeholder="Observações do treino (opcional)"
                        />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setEditingWorkoutId(null)} className="text-xs text-teal/40">Cancelar</button>
                          <button type="button" onClick={() => handleSaveWorkoutEdit(workout.id)} className="text-xs text-copper font-medium">Salvar</button>
                        </div>
                      </div>
                    )}

                    {/* Workout notes */}
                    {!isEditingThisWorkout && workout.notes && (
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
                          <div key={ex.id} className="flex items-start gap-3 py-1.5 group">
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
                              {ex.notes && (
                                <p className="text-xs text-teal/50 italic mt-0.5 truncate">{ex.notes}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              {ex.demo_url && (
                                <a href={ex.demo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-copper hover:underline">
                                  Demo
                                </a>
                              )}
                              {confirmDeleteExId === ex.id ? (
                                <>
                                  <button type="button" onClick={() => setConfirmDeleteExId(null)} className="text-xs text-teal/40 px-1">N</button>
                                  <button type="button" onClick={() => handleDeleteExercise(workout.id, ex.id)} className="text-xs text-red-500 font-medium px-1">S</button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteExId(ex.id)}
                                  className="text-teal/20 hover:text-red-400 transition-colors p-0.5"
                                  title="Remover exercício"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add exercise form */}
                    {workout.format === 'freeform' ? null : addingExerciseToId === workout.id ? (
                      <form onSubmit={e => handleAddExercise(e, workout.id)} className="mt-3 space-y-3 pt-3 border-t border-teal/[0.06]">
                        <div className="relative">
                          <input
                            type="text"
                            value={exName}
                            onChange={e => handleExNameChange(e.target.value)}
                            onFocus={() => { if (exSuggestions.length > 0) setExShowDropdown(true) }}
                            onBlur={() => { setTimeout(() => setExShowDropdown(false), 150) }}
                            required
                            autoComplete="off"
                            placeholder="Nome do exercício — busca no catálogo"
                            className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors"
                          />
                          {exCatalogId && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-copper bg-copper/10 px-1.5 py-0.5 rounded">
                              catálogo
                            </span>
                          )}
                          {exShowDropdown && exSuggestions.length > 0 && (
                            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-teal/[0.12] rounded-btn shadow-card max-h-48 overflow-y-auto">
                              {exSuggestions.map(s => (
                                <button
                                  type="button"
                                  key={s.id}
                                  onMouseDown={e => { e.preventDefault(); pickSuggestion(s) }}
                                  className="w-full text-left px-3 py-2 text-sm text-teal hover:bg-surface transition-colors flex items-center justify-between gap-2"
                                >
                                  <span className="truncate">{s.name}</span>
                                  {s.demo_url && <span className="text-[10px] text-copper shrink-0">vídeo</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-teal/40 -mt-1">
                          Novos nomes entram no catálogo automaticamente. Vídeo se gerencia em <Link to="/coach/catalogo" className="text-copper hover:underline">Catálogo</Link>.
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-teal/40 mb-1">Séries</label>
                            <input
                              type="number" inputMode="numeric" value={exSets} onChange={e => setExSets(e.target.value)}
                              required min={1} placeholder="3"
                              className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-teal/40 mb-1">Reps mín</label>
                            <input
                              type="number" inputMode="numeric" value={exRepsMin} onChange={e => setExRepsMin(e.target.value)}
                              required min={1} placeholder="8"
                              className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-teal/40 mb-1">Reps máx</label>
                            <input
                              type="number" inputMode="numeric" value={exRepsMax} onChange={e => setExRepsMax(e.target.value)}
                              min={1} placeholder="12"
                              className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-teal/40 mb-1">Descanso entre séries (segundos)</label>
                          <input
                            type="number" inputMode="numeric" value={exRest} onChange={e => setExRest(e.target.value)}
                            min={0} placeholder="60"
                            className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                          />
                        </div>

                        <textarea
                          value={exNotes} onChange={e => setExNotes(e.target.value)}
                          rows={2}
                          placeholder="Observações do movimento (opcional) — ex: manter coluna neutra"
                          className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors resize-none"
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
                                    key={wt.value} type="button"
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
                                    type="number" inputMode="numeric" value={exWarmupSets} onChange={e => setExWarmupSets(e.target.value)}
                                    required={exWarmupEnabled} min={1} placeholder="2"
                                    className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="block text-xs text-teal/40 mb-1">Reps</label>
                                  <input
                                    type="number" inputMode="numeric" value={exWarmupReps} onChange={e => setExWarmupReps(e.target.value)}
                                    required={exWarmupEnabled} min={1} placeholder="10"
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
              type="text" value={workoutName} onChange={e => setWorkoutName(e.target.value)}
              required placeholder="Ex: Treino A — Peito e Tríceps"
              className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors"
            />

            {/* Format selector */}
            <div>
              <label className="block text-xs text-teal/40 mb-1.5">Formato</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setWorkoutFormat('structured')}
                  className={`flex-1 rounded-btn py-2 text-xs font-medium transition-all ${workoutFormat === 'structured' ? 'bg-copper text-white shadow-btn' : 'border border-teal/[0.15] text-teal/60'}`}>
                  Estruturado
                </button>
                <button type="button" onClick={() => setWorkoutFormat('freeform')}
                  className={`flex-1 rounded-btn py-2 text-xs font-medium transition-all ${workoutFormat === 'freeform' ? 'bg-copper text-white shadow-btn' : 'border border-teal/[0.15] text-teal/60'}`}>
                  Livre
                </button>
              </div>
              <p className="text-xs text-teal/40 mt-1">
                {workoutFormat === 'structured' ? 'Exercícios com séries, reps e carga' : 'Texto livre — ideal pra corrida, WOD, circuitos'}
              </p>
            </div>

            {workoutFormat === 'freeform' && (
              <textarea
                value={workoutContent} onChange={e => setWorkoutContent(e.target.value)}
                required rows={6}
                placeholder={"Ex:\n5km corrida moderada\n— ou —\n21-15-9\nThrusters 43kg\nPull-ups"}
                className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors resize-none font-jetbrains"
              />
            )}

            <div className="flex gap-2">
              {schedType === 'fixed_days' && (
                <div className="flex-1">
                  <label className="block text-xs text-teal/40 mb-1">Dia da semana</label>
                  <select
                    value={workoutWeekday} onChange={e => setWorkoutWeekday(parseInt(e.target.value, 10))}
                    className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal bg-white focus:outline-none focus:border-copper transition-colors"
                  >
                    {WEEKDAYS.map((day, i) => <option key={i} value={i}>{day}</option>)}
                  </select>
                </div>
              )}
              <div className="flex-1">
                <label className="block text-xs text-teal/40 mb-1">Duração (min)</label>
                <input
                  type="number" inputMode="numeric" value={workoutDuration} onChange={e => setWorkoutDuration(e.target.value)}
                  placeholder="60" min={1}
                  className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors font-jetbrains"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-teal/40 mb-1">Observações do treino <span className="text-teal/25">(opcional)</span></label>
              <textarea
                value={workoutNotes} onChange={e => setWorkoutNotes(e.target.value)} rows={2}
                placeholder="Dicas ou orientações específicas para este treino..."
                className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors resize-none"
              />
            </div>

            {workoutError && <p className="text-xs text-red-500">{workoutError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAddingWorkout(false); setWorkoutError('') }}
                className="flex-1 border border-teal/[0.15] rounded-btn py-2.5 text-sm font-medium text-teal/60 hover:bg-surface transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={savingWorkout || !workoutName.trim()}
                className="flex-1 bg-copper text-white rounded-btn py-2.5 text-sm font-medium shadow-btn hover:opacity-90 disabled:opacity-40 transition-all">
                {savingWorkout ? 'Salvando...' : 'Adicionar treino'}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAddingWorkout(true)}
            className="mt-4 w-full border-2 border-dashed border-teal/[0.12] rounded-card py-4 text-sm font-medium text-teal/40 hover:border-copper/30 hover:text-copper transition-colors">
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
