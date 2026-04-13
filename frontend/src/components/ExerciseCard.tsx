import { useState } from 'react'
import { SetBubble, type SetStatus } from './SetBubble'
import { LogInput } from './LogInput'
import { RestTimerModal } from './RestTimerModal'

export interface Exercise {
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

export interface LastSetLog {
  exercise_id: string
  set_number: number
  weight_kg: number | null
  reps_done: number | null
}

interface SetState {
  status: SetStatus
  weight: string
  reps: string
}

interface Props {
  exercise: Exercise
  lastLogs?: LastSetLog[]
  onLogSet: (
    exerciseId: string,
    setNumber: number,
    weightKg: number | null,
    repsDone: number | null,
  ) => Promise<void>
  onComplete: (exerciseId: string) => void
}

const WARMUP_LABEL: Record<string, string> = {
  aquecimento: 'Aquecimento',
  reconhecimento: 'Reconhecimento',
}

function buildInitialSets(exercise: Exercise, lastLogs?: LastSetLog[]): SetState[] {
  return Array.from({ length: exercise.sets }, (_, i) => {
    const log = lastLogs?.find(l => l.exercise_id === exercise.id && l.set_number === i + 1)
    return {
      status: (i === 0 ? 'active' : 'pending') as SetStatus,
      weight: log?.weight_kg != null ? String(log.weight_kg) : '',
      reps: log?.reps_done != null ? String(log.reps_done) : '',
    }
  })
}

export function ExerciseCard({ exercise, lastLogs, onLogSet, onComplete }: Props) {
  const [sets, setSets] = useState<SetState[]>(() => buildInitialSets(exercise, lastLogs))
  const [activeIdx, setActiveIdx] = useState(0)
  const [logging, setLogging] = useState(false)
  const [showTimer, setShowTimer] = useState(false)

  const allDone = sets.every(s => s.status === 'done')
  const repsLabel = exercise.reps_max
    ? `${exercise.reps_min}–${exercise.reps_max} reps`
    : `${exercise.reps_min} reps`

  const hasWarmup = !!exercise.warmup_type
  const hasHistory = lastLogs && lastLogs.some(l => l.exercise_id === exercise.id)

  function activateSet(idx: number) {
    if (sets[idx].status === 'done') return
    setSets(prev =>
      prev.map((s, i) => ({
        ...s,
        status: i === idx ? 'active' : s.status === 'active' ? 'pending' : s.status,
      })),
    )
    setActiveIdx(idx)
  }

  async function handleConfirm() {
    setLogging(true)
    try {
      const current = sets[activeIdx]
      await onLogSet(
        exercise.id,
        activeIdx + 1,
        current.weight ? parseFloat(current.weight) : null,
        current.reps ? parseInt(current.reps, 10) : null,
      )

      setSets(prev => {
        const next = [...prev]
        next[activeIdx] = { ...next[activeIdx], status: 'done' }
        const nextActiveIdx = activeIdx + 1
        if (nextActiveIdx < next.length) {
          // Carry over weight/reps from current set if next set is empty
          const nextSet = next[nextActiveIdx]
          next[nextActiveIdx] = {
            ...nextSet,
            status: 'active',
            weight: nextSet.weight || current.weight,
            reps: nextSet.reps || current.reps,
          }
          setActiveIdx(nextActiveIdx)
          if (exercise.rest_seconds && exercise.rest_seconds > 0) {
            setShowTimer(true)
          }
        } else {
          setTimeout(() => onComplete(exercise.id), 0)
        }
        return next
      })
    } finally {
      setLogging(false)
    }
  }

  return (
    <>
      {showTimer && exercise.rest_seconds && (
        <RestTimerModal
          seconds={exercise.rest_seconds}
          onClose={() => setShowTimer(false)}
        />
      )}

      <div
        className={`bg-white rounded-card border p-4 transition-all ${
          allDone
            ? 'border-teal/[0.06] opacity-60'
            : 'border-teal/[0.09] shadow-card'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-syne font-bold text-base text-teal">{exercise.name}</h3>
            <p className="text-xs text-teal/50 mt-0.5">
              {exercise.sets} séries · {repsLabel}
              {exercise.rest_seconds ? ` · ${exercise.rest_seconds}s descanso` : ''}
            </p>
            {hasHistory && !allDone && (
              <p className="text-xs text-copper/60 mt-0.5">Valores do último treino</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {allDone && (
              <span className="text-xs font-medium text-teal bg-teal/10 px-2 py-0.5 rounded-full">
                Concluído
              </span>
            )}
            {exercise.demo_url && (
              <a
                href={exercise.demo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-copper hover:underline"
              >
                Demo
              </a>
            )}
          </div>
        </div>

        {/* Exercise notes */}
        {exercise.notes && (
          <div className="mt-2 bg-teal/[0.04] rounded-lg px-3 py-2">
            <p className="text-xs text-teal/55 leading-relaxed">{exercise.notes}</p>
          </div>
        )}

        {/* Warmup block */}
        {hasWarmup && (
          <div className="mt-3 flex items-center gap-2 bg-teal/[0.04] rounded-lg px-3 py-2">
            <span className="text-xs font-medium text-teal/60 uppercase tracking-wide">
              {WARMUP_LABEL[exercise.warmup_type!]}
            </span>
            <span className="text-teal/20">·</span>
            <span className="text-xs font-jetbrains text-teal/60">
              {exercise.warmup_sets}×{exercise.warmup_reps} reps
            </span>
          </div>
        )}

        {/* Set bubbles */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {sets.map((s, i) => (
            <SetBubble
              key={i}
              setNumber={i + 1}
              status={s.status}
              onClick={() => activateSet(i)}
            />
          ))}
        </div>

        {/* Log input — only shown when there's an active set */}
        {!allDone && sets[activeIdx]?.status === 'active' && (
          <LogInput
            weight={sets[activeIdx].weight}
            reps={sets[activeIdx].reps}
            onWeightChange={v =>
              setSets(prev => {
                const next = [...prev]
                next[activeIdx] = { ...next[activeIdx], weight: v }
                return next
              })
            }
            onRepsChange={v =>
              setSets(prev => {
                const next = [...prev]
                next[activeIdx] = { ...next[activeIdx], reps: v }
                return next
              })
            }
            onConfirm={handleConfirm}
            loading={logging}
          />
        )}
      </div>
    </>
  )
}
