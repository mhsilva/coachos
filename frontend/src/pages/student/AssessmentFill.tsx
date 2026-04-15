import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type PhotoSlot = 'front' | 'back' | 'side'

const PHOTO_LABELS: Record<PhotoSlot, string> = {
  front: 'Frente',
  back:  'Costas',
  side:  'Lateral',
}

interface MeasurementField {
  key:
    | 'chest_cm'
    | 'waist_narrow_cm'
    | 'waist_navel_cm'
    | 'hip_cm'
    | 'biceps_r_cm'
    | 'forearm_r_cm'
    | 'thigh_r_cm'
    | 'calf_r_cm'
  label: string
  hint?: string
}

const MEASUREMENTS: MeasurementField[] = [
  { key: 'chest_cm',        label: 'Peito' },
  { key: 'waist_narrow_cm', label: 'Cintura (parte mais fina)' },
  { key: 'waist_navel_cm',  label: 'Cintura (na altura do umbigo)' },
  { key: 'hip_cm',          label: 'Quadril' },
  { key: 'biceps_r_cm',     label: 'Bíceps direito' },
  { key: 'forearm_r_cm',    label: 'Antebraço direito' },
  { key: 'thigh_r_cm',      label: 'Coxa medial direita' },
  { key: 'calf_r_cm',       label: 'Panturrilha direita' },
]

type MeasurementsState = Record<MeasurementField['key'], string>

const EMPTY_MEASUREMENTS: MeasurementsState = {
  chest_cm: '',
  waist_narrow_cm: '',
  waist_navel_cm: '',
  hip_cm: '',
  biceps_r_cm: '',
  forearm_r_cm: '',
  thigh_r_cm: '',
  calf_r_cm: '',
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function StudentAssessmentFill() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()

  const [exists, setExists] = useState<boolean | null>(null) // null = loading
  const [photos, setPhotos] = useState<Record<PhotoSlot, File | null>>({
    front: null, back: null, side: null,
  })
  const [previews, setPreviews] = useState<Record<PhotoSlot, string | null>>({
    front: null, back: null, side: null,
  })
  const [weight, setWeight] = useState('')
  const [bf, setBf] = useState('')
  const [measurements, setMeasurements] = useState<MeasurementsState>(EMPTY_MEASUREMENTS)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Validate on mount that the assessment exists and is still pending for this student
  useEffect(() => {
    if (!session?.access_token || !id) return
    createApi(session.access_token)
      .get<{ id: string; status: string }>(`/assessments/${id}`)
      .then(data => {
        setExists(data.status === 'pending')
      })
      .catch(() => setExists(false))
  }, [session, id])

  // Keep object URLs in sync with the File picked for each slot
  useEffect(() => {
    const urls: Partial<Record<PhotoSlot, string>> = {}
    const next: Record<PhotoSlot, string | null> = { front: null, back: null, side: null }
    for (const slot of ['front', 'back', 'side'] as const) {
      const f = photos[slot]
      if (f) {
        const u = URL.createObjectURL(f)
        urls[slot] = u
        next[slot] = u
      }
    }
    setPreviews(next)
    return () => {
      for (const u of Object.values(urls)) {
        if (u) URL.revokeObjectURL(u)
      }
    }
  }, [photos])

  const canSubmit = useMemo(() => {
    if (!photos.front || !photos.back || !photos.side) return false
    const w = parseFloat(weight)
    if (!weight || Number.isNaN(w) || w <= 0) return false
    return true
  }, [photos, weight])

  function handlePhoto(slot: PhotoSlot, file: File | null) {
    setPhotos(prev => ({ ...prev, [slot]: file }))
  }

  function handleMeasurement(key: MeasurementField['key'], value: string) {
    setMeasurements(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (!canSubmit || !session?.access_token || !id || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const form = new FormData()
      form.append('photo_front', photos.front!)
      form.append('photo_back',  photos.back!)
      form.append('photo_side',  photos.side!)
      form.append('weight_kg', weight)
      if (bf) form.append('body_fat_pct', bf)
      for (const m of MEASUREMENTS) {
        const v = measurements[m.key]
        if (v) form.append(m.key, v)
      }
      await createApi(session.access_token).postForm(`/assessments/${id}/submit`, form)
      setDone(true)
      setTimeout(() => navigate('/student'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render states ──

  if (exists === null) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-4 border-copper border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (!exists) {
    return (
      <AppLayout>
        <div className="px-4 py-6 md:px-8 max-w-lg">
          <h1 className="page-title mb-4">Avaliação</h1>
          <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-6 text-center">
            <p className="text-teal/50">Esta avaliação não está mais disponível.</p>
            <button
              type="button"
              onClick={() => navigate('/student')}
              className="mt-5 bg-copper text-white rounded-btn px-5 py-2.5 text-sm font-medium shadow-btn hover:opacity-90 transition-all"
            >
              Voltar
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (done) {
    return (
      <AppLayout>
        <div className="px-4 py-10 md:px-8 max-w-lg text-center">
          <p className="text-5xl mb-3">✅</p>
          <h1 className="page-title">Avaliação enviada!</h1>
          <p className="text-sm text-teal/50 mt-2">Bom trabalho, parceiro.</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-lg">
        <h1 className="page-title mb-1">Avaliação física</h1>
        <p className="text-sm text-teal/50 mb-6">
          3 fotos, peso e algumas medidas. Campos de medidas são opcionais — preencha o que conseguir medir.
        </p>

        {/* ── Photos ── */}
        <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5 mb-5">
          <p className="font-syne font-bold text-teal mb-3">Fotos</p>
          <div className="grid grid-cols-3 gap-2">
            {(['front', 'back', 'side'] as const).map(slot => {
              const preview = previews[slot]
              return (
                <label
                  key={slot}
                  className="relative flex flex-col items-center cursor-pointer"
                >
                  <div className="w-full aspect-[3/4] rounded-card overflow-hidden bg-teal/5 border border-teal/[0.09] flex items-center justify-center">
                    {preview ? (
                      <img src={preview} alt={PHOTO_LABELS[slot]} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-teal/30 text-xs">toque</span>
                    )}
                  </div>
                  <span className="text-xs text-teal/60 mt-1.5">{PHOTO_LABELS[slot]}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={e => handlePhoto(slot, e.target.files?.[0] ?? null)}
                  />
                </label>
              )
            })}
          </div>
        </div>

        {/* ── Peso + BF ── */}
        <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5 mb-5">
          <p className="font-syne font-bold text-teal mb-3">Composição</p>
          <div className="space-y-4">
            <NumberField
              label="Peso (kg)"
              value={weight}
              onChange={setWeight}
              placeholder="ex: 75.5"
              required
            />
            <NumberField
              label="BF% (opcional)"
              value={bf}
              onChange={setBf}
              placeholder="ex: 18"
            />
          </div>
        </div>

        {/* ── Medidas ── */}
        <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5 mb-5">
          <p className="font-syne font-bold text-teal mb-3">Medidas (cm)</p>
          <div className="space-y-4">
            {MEASUREMENTS.map(m => (
              <NumberField
                key={m.key}
                label={m.label}
                value={measurements[m.key]}
                onChange={v => handleMeasurement(m.key, v)}
                placeholder="—"
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 rounded-btn px-4 py-2.5 mb-4">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full bg-copper text-white rounded-btn py-3.5 text-sm font-medium shadow-btn hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40"
        >
          {submitting ? 'Enviando...' : 'Enviar avaliação'}
        </button>
      </div>
    </AppLayout>
  )
}

// ─────────────────────────────────────────────
// Small numeric field helper
// ─────────────────────────────────────────────

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm text-teal/60 mb-1.5">
        {label}
        {required && <span className="text-copper ml-1">*</span>}
      </label>
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        min="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-teal/[0.15] rounded-btn px-3 py-2.5 text-sm text-teal font-jetbrains placeholder:text-teal/25 focus:outline-none focus:border-copper transition-colors bg-white"
      />
    </div>
  )
}
