import { useState } from 'react'
import { SetBubble, type SetStatus } from './SetBubble'
import { LogInput } from './LogInput'

export interface Exercise {
  id: string
  name: string
  sets: number
  reps_min: number
  reps_max: number | null
  order_index: number
  demo_url: string | null
}

interface SetState {
  status: SetStatus
  weight: string
  reps: string
}

interface Props {
  exercise: Exercise
  onLogSet: (
    exerciseId: string,
    setNumber: number,
    weightKg: number | null,
    repsDone: number | null,
  ) => Promise<void>
  onComplete: (exerciseId: string) => void
}

export function ExerciseCard({ exercise, onLogSet, onComplete }: Props) {
  const [sets, setSets] = useState<SetState[]>(
    Array.from({ length: exercise.sets }, (_, i) => ({
      status: (i === 0 ? 'active' : 'pending') as SetStatus,
      weight: '',
      reps: '',
    })),
  )
  const [activeIdx, setActiveIdx] = useState(0)
  const [logging, setLogging] = useState(false)

  const allDone = sets.every(s => s.status === 'done')
  const repsLabel = exercise.reps_max
    ? `${exercise.reps_min}–${exercise.reps_max} reps`
    : `${exercise.reps_min} reps`

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
          next[nextActiveIdx] = { ...next[nextActiveIdx], status: 'active' }
          setActiveIdx(nextActiveIdx)
        } else {
          // All sets done
          setTimeout(() => onComplete(exercise.id), 0)
        }
        return next
      })
    } finally {
      setLogging(false)
    }
  }

  return (
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
          </p>
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
  )
}
