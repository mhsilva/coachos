import { useCallback, useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { createApi } from '../lib/api'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type AssessmentMetric =
  | 'weight_kg'
  | 'body_fat_pct'
  | 'chest_cm'
  | 'waist_narrow_cm'
  | 'waist_navel_cm'
  | 'hip_cm'
  | 'biceps_r_cm'
  | 'forearm_r_cm'
  | 'thigh_r_cm'
  | 'calf_r_cm'

export interface AssessmentRow {
  id: string
  status: 'pending' | 'submitted' | 'cancelled'
  requested_at: string
  submitted_at: string | null
  weight_kg: number | null
  body_fat_pct: number | null
  chest_cm: number | null
  waist_narrow_cm: number | null
  waist_navel_cm: number | null
  hip_cm: number | null
  biceps_r_cm: number | null
  forearm_r_cm: number | null
  thigh_r_cm: number | null
  calf_r_cm: number | null
  photo_front_path: string | null
  photo_back_path: string | null
  photo_side_path: string | null
}

interface AssessmentDetail extends AssessmentRow {
  photo_front_url: string | null
  photo_back_url: string | null
  photo_side_url: string | null
}

interface SeriesPoint {
  submitted_at: string
  value: number
}

// ─────────────────────────────────────────────
// Config (labels + units)
// ─────────────────────────────────────────────

const METRICS: { key: AssessmentMetric; label: string; unit: string }[] = [
  { key: 'weight_kg',       label: 'Peso',                unit: 'kg' },
  { key: 'body_fat_pct',    label: 'BF%',                 unit: '%'  },
  { key: 'chest_cm',        label: 'Peito',               unit: 'cm' },
  { key: 'waist_narrow_cm', label: 'Cintura (mais fina)', unit: 'cm' },
  { key: 'waist_navel_cm',  label: 'Cintura (umbigo)',    unit: 'cm' },
  { key: 'hip_cm',          label: 'Quadril',             unit: 'cm' },
  { key: 'biceps_r_cm',     label: 'Bíceps D',            unit: 'cm' },
  { key: 'forearm_r_cm',    label: 'Antebraço D',         unit: 'cm' },
  { key: 'thigh_r_cm',      label: 'Coxa D',              unit: 'cm' },
  { key: 'calf_r_cm',       label: 'Panturrilha D',       unit: 'cm' },
]

const METRIC_INFO = Object.fromEntries(METRICS.map(m => [m.key, m])) as Record<
  AssessmentMetric,
  { key: AssessmentMetric; label: string; unit: string }
>

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function AssessmentsTab({
  studentId,
  token,
}: {
  studentId: string
  token: string
}) {
  const [assessments, setAssessments] = useState<AssessmentRow[]>([])
  const [metric, setMetric] = useState<AssessmentMetric>('weight_kg')
  const [series, setSeries] = useState<SeriesPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [requestSuccess, setRequestSuccess] = useState('')
  const [detail, setDetail] = useState<AssessmentDetail | null>(null)
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)

  const api = createApi(token)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, serie] = await Promise.all([
        api.get<AssessmentRow[]>(`/assessments/student/${studentId}?limit=5`),
        api.get<SeriesPoint[]>(`/assessments/student/${studentId}/series?metric=${metric}`),
      ])
      setAssessments(list)
      setSeries(serie)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
    // api is recreated every render; only studentId + metric really matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, metric])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRequest() {
    if (requesting) return
    setRequesting(true)
    setRequestError('')
    setRequestSuccess('')
    try {
      await api.post('/assessments/request', { student_id: studentId })
      setRequestSuccess('Avaliação solicitada')
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Erro ao solicitar')
    } finally {
      setRequesting(false)
    }
  }

  async function openDetail(id: string) {
    if (detailLoadingId) return
    setDetailLoadingId(id)
    try {
      const data = await api.get<AssessmentDetail>(`/assessments/${id}`)
      setDetail(data)
    } catch (err) {
      console.error(err)
    } finally {
      setDetailLoadingId(null)
    }
  }

  const metricInfo = METRIC_INFO[metric]
  const chartData = series.map(p => ({
    date: formatDateShort(p.submitted_at),
    value: p.value,
  }))

  return (
    <div>
      {/* Header: request button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-syne font-bold text-lg text-teal">Avaliações</h2>
        <button
          type="button"
          onClick={handleRequest}
          disabled={requesting}
          className="bg-copper text-white rounded-btn px-4 py-2 text-sm font-medium shadow-btn hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
        >
          {requesting ? 'Solicitando...' : 'Solicitar avaliação'}
        </button>
      </div>

      {requestError && (
        <p className="text-sm text-red-500 bg-red-50 rounded-btn px-4 py-2.5 mb-3">
          {requestError}
        </p>
      )}
      {requestSuccess && (
        <p className="text-sm text-teal bg-teal/10 rounded-btn px-4 py-2.5 mb-3">
          {requestSuccess}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-4 border-copper border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Chart card */}
          <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5 mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <p className="font-syne font-bold text-teal">Evolução</p>
              <select
                value={metric}
                onChange={e => setMetric(e.target.value as AssessmentMetric)}
                className="border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal focus:outline-none focus:border-copper bg-white transition-colors"
              >
                {METRICS.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>

            {chartData.length === 0 ? (
              <p className="text-sm text-teal/40 py-8 text-center">
                Sem dados ainda. Assim que o aluno preencher avaliações, o gráfico aparece aqui.
              </p>
            ) : (
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
                      unit={` ${metricInfo.unit}`}
                      domain={['auto', 'auto']}
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
                      formatter={(value: number) => [`${value} ${metricInfo.unit}`, metricInfo.label]}
                      labelFormatter={(label: string) => label}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#B76E4D"
                      strokeWidth={2}
                      dot={{ fill: '#B76E4D', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Last assessments list */}
          <p className="font-syne font-bold text-teal mb-3">Últimas avaliações</p>
          {assessments.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-card border border-teal/[0.09]">
              <p className="text-sm text-teal/50">Nenhuma avaliação enviada ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {assessments.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openDetail(a.id)}
                  disabled={detailLoadingId === a.id}
                  className="w-full text-left bg-white rounded-card border border-teal/[0.09] shadow-card p-4 hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-teal">
                        Avaliação de {a.submitted_at ? formatDateShort(a.submitted_at) : '—'}
                      </p>
                      <p className="text-xs text-teal/50 mt-0.5 font-jetbrains">
                        {a.weight_kg !== null ? `${a.weight_kg} kg` : '—'}
                        {a.body_fat_pct !== null && ` · ${a.body_fat_pct}% BF`}
                      </p>
                    </div>
                    <span className="text-teal/30 text-sm">
                      {detailLoadingId === a.id ? '...' : '→'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {detail && <AssessmentDetailModal detail={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

// ─────────────────────────────────────────────
// Detail modal
// ─────────────────────────────────────────────

function AssessmentDetailModal({
  detail,
  onClose,
}: {
  detail: AssessmentDetail
  onClose: () => void
}) {
  const photos: { label: string; url: string | null }[] = [
    { label: 'Frente',  url: detail.photo_front_url },
    { label: 'Costas',  url: detail.photo_back_url  },
    { label: 'Lateral', url: detail.photo_side_url  },
  ]

  const rows: { label: string; value: number | null; unit: string }[] = [
    { label: 'Peso',                value: detail.weight_kg,       unit: 'kg' },
    { label: 'BF%',                 value: detail.body_fat_pct,    unit: '%'  },
    { label: 'Peito',               value: detail.chest_cm,        unit: 'cm' },
    { label: 'Cintura (mais fina)', value: detail.waist_narrow_cm, unit: 'cm' },
    { label: 'Cintura (umbigo)',    value: detail.waist_navel_cm,  unit: 'cm' },
    { label: 'Quadril',             value: detail.hip_cm,          unit: 'cm' },
    { label: 'Bíceps D',            value: detail.biceps_r_cm,     unit: 'cm' },
    { label: 'Antebraço D',         value: detail.forearm_r_cm,    unit: 'cm' },
    { label: 'Coxa D',              value: detail.thigh_r_cm,      unit: 'cm' },
    { label: 'Panturrilha D',       value: detail.calf_r_cm,       unit: 'cm' },
  ]

  return (
    <div
      className="fixed inset-0 bg-teal/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full md:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-card md:rounded-card"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-surface px-5 py-4 flex items-center justify-between border-b border-teal/[0.08]">
          <p className="font-syne font-bold text-teal">
            Avaliação de {detail.submitted_at ? formatDateShort(detail.submitted_at) : '—'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-teal/50 hover:text-teal text-2xl leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* Photos */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-3 gap-2">
            {photos.map(p => (
              <figure key={p.label} className="flex flex-col items-center">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer" className="block w-full">
                    <img
                      src={p.url}
                      alt={p.label}
                      className="w-full aspect-[3/4] object-cover rounded-card bg-teal/5"
                    />
                  </a>
                ) : (
                  <div className="w-full aspect-[3/4] rounded-card bg-teal/5 flex items-center justify-center text-teal/30 text-xs">
                    sem foto
                  </div>
                )}
                <figcaption className="text-xs text-teal/50 mt-1.5">{p.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>

        {/* Measurements */}
        <div className="px-5 py-4">
          <div className="bg-white rounded-card border border-teal/[0.09] shadow-card divide-y divide-teal/[0.06]">
            {rows.map(r => (
              <div key={r.label} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-teal/50">{r.label}</span>
                <span className="text-sm font-medium text-teal font-jetbrains">
                  {r.value !== null ? `${r.value} ${r.unit}` : <span className="text-teal/25 font-inter">—</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
