import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { createApi } from '../lib/api'

// ─────────────────────────────────────────────
// Types — mirror backend GET /students/{id}/profile
// ─────────────────────────────────────────────

type Sex = 'M' | 'F'
type Level =
  | 'iniciante_absoluto'
  | 'iniciante'
  | 'intermediario'
  | 'avancado'
  | 'extremamente_avancado'
type PrimaryGoal =
  | 'hipertrofia'
  | 'emagrecimento'
  | 'forca_maxima'
  | 'performance_esportiva'
  | 'saude'
  | 'reabilitacao'
  | 'condicionamento'
type Exercise = 'supino' | 'agachamento' | 'terra' | 'puxada'

interface StudentBasic {
  id: string
  birth_date: string | null
  weight_kg: number | null
  height_cm: number | null
  profiles: { full_name: string | null; avatar_url: string | null } | null
}

interface ProfileRow {
  student_id: string
  sex: Sex | null
  health_clearance_required: boolean | null

  primary_goal: PrimaryGoal | null
  primary_goal_detail: string | null
  body_focus_areas: string[] | null
  aesthetic_reference: string | null

  has_secondary_sport: boolean | null
  secondary_sport: string | null
  secondary_sport_months: number | null
  secondary_sport_days_per_week: number | null
  secondary_sport_session_minutes: number | null
  secondary_sport_has_competition: boolean | null
  secondary_sport_competition_note: string | null
  secondary_sport_objective: string | null
  same_day_training: boolean | null
  same_day_order: 'antes' | 'depois' | null
  is_sport_cycle: boolean | null

  total_days_per_week: number | null
  strength_days_per_week: number | null
  max_session_minutes: number | null
  preferred_period: 'manha' | 'tarde' | 'noite' | null
  fixed_rest_days: string[] | null

  current_strength_training: boolean | null
  continuous_months: number | null
  detraining_months: number | null
  total_experience_months: number | null
  sports_history: string | null

  sleep_hours: number | null
  sleep_quality: 'ruim' | 'razoavel' | 'boa' | null
  work_type: 'sedentario' | 'moderado' | 'fisico' | null
  stress_level: 'baixo' | 'moderado' | 'alto' | null
  smokes: boolean | null
  smoke_details: string | null
  drinks: boolean | null
  drink_details: string | null

  has_nutritionist: boolean | null
  uses_supplements: boolean | null
  supplements: string[] | null
  protein_intake_perception: 'baixa' | 'adequada' | 'alta' | null

  p1_score: number | null
  p2_score: number | null
  p3_score: number | null
  p4_avg: number | null
  p5_avg: number | null
  final_score: number | null
  level: Level | null
  pyramid_stage: number | null

  source_chat_id: string | null
  extracted_at: string | null
  updated_at: string | null
  manually_edited_fields: string[] | null
}

interface StrengthRow {
  exercise: Exercise
  technique_score: number | null
  load_kg: number | null
  reps: number | null
  estimated_1rm: number | null
  relative_strength_pct: number | null
  strength_score: number | null
  recorded_at: string
}

interface InjuryRow {
  id: string
  body_part: string | null
  description: string
  severity: 'leve' | 'moderada' | 'grave' | null
  active: boolean
  occurred_at: string | null
  source: 'anamnese' | 'workout_feedback' | 'manual'
  recorded_at: string
}

interface HealthConditionRow {
  id: string
  condition: string
  notes: string | null
  active: boolean
  source: 'anamnese' | 'manual'
  recorded_at: string
}

interface MedicationRow {
  id: string
  medication: string
  dosage: string | null
  active: boolean
  source: 'anamnese' | 'manual'
  recorded_at: string
}

interface SurgeryRow {
  id: string
  procedure_name: string
  occurred_at: string | null
  notes: string | null
  source: 'anamnese' | 'manual'
  recorded_at: string
}

interface ProfilePayload {
  student: StudentBasic
  profile: ProfileRow | null
  strength: StrengthRow[]
  injuries: InjuryRow[]
  health_conditions: HealthConditionRow[]
  medications: MedicationRow[]
  surgeries: SurgeryRow[]
}

// ─────────────────────────────────────────────
// Labels (internal keys → Portuguese display)
// ─────────────────────────────────────────────

const LEVEL_LABEL: Record<Level, string> = {
  iniciante_absoluto: 'INICIANTE ABSOLUTO',
  iniciante: 'INICIANTE',
  intermediario: 'INTERMEDIÁRIO',
  avancado: 'AVANÇADO',
  extremamente_avancado: 'EXTREMAMENTE AVANÇADO',
}

const PYRAMID_LABEL: Record<number, string> = {
  1: 'Técnica',
  2: 'Força',
  3: 'Volume',
  4: 'Variação',
}

const GOAL_LABEL: Record<PrimaryGoal, string> = {
  hipertrofia: 'Hipertrofia',
  emagrecimento: 'Emagrecimento',
  forca_maxima: 'Força máxima',
  performance_esportiva: 'Performance esportiva',
  saude: 'Saúde / longevidade',
  reabilitacao: 'Reabilitação',
  condicionamento: 'Condicionamento geral',
}

const EXERCISE_LABEL: Record<Exercise, string> = {
  supino: 'Supino',
  agachamento: 'Agachamento',
  terra: 'Terra',
  puxada: 'Puxada',
}

const PERIOD_LABEL: Record<string, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
}

const SLEEP_LABEL: Record<string, string> = {
  ruim: 'Ruim',
  razoavel: 'Razoável',
  boa: 'Boa',
}

const WORK_LABEL: Record<string, string> = {
  sedentario: 'Sedentário',
  moderado: 'Moderado',
  fisico: 'Físico pesado',
}

const STRESS_LABEL: Record<string, string> = {
  baixo: 'Baixo',
  moderado: 'Moderado',
  alto: 'Alto',
}

const PROTEIN_LABEL: Record<string, string> = {
  baixa: 'Baixa',
  adequada: 'Adequada',
  alta: 'Alta',
}

// ─────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────

function Stars({ score }: { score: number | null }) {
  if (score === null) return <span className="text-teal/25">—</span>
  return (
    <span className="font-jetbrains text-copper tracking-tighter">
      {'★'.repeat(score)}
      <span className="text-teal/20">{'★'.repeat(Math.max(0, 4 - score))}</span>
    </span>
  )
}

function PBar({ score, max = 4 }: { score: number | null; max?: number }) {
  const pct = score !== null ? (score / max) * 100 : 0
  return (
    <div className="h-2 bg-teal/10 rounded-full overflow-hidden">
      <div
        className="h-full bg-copper transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function Badge({ children, tone = 'teal' }: { children: ReactNode; tone?: 'teal' | 'copper' | 'red' }) {
  const classes =
    tone === 'copper'
      ? 'bg-copper/10 text-copper'
      : tone === 'red'
      ? 'bg-red-100 text-red-700'
      : 'bg-teal/10 text-teal'
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${classes}`}>
      {children}
    </span>
  )
}

function SectionCard({
  title,
  children,
  right,
}: {
  title: string
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-syne font-bold text-teal">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

function KV({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-teal/[0.06] last:border-b-0">
      <span className="text-sm text-teal/50">{label}</span>
      <span className="text-sm text-teal font-medium text-right max-w-[60%]">
        {value ?? <span className="text-teal/25 font-inter">—</span>}
      </span>
    </div>
  )
}

function formatMonths(m: number | null): string | null {
  if (m === null || m === undefined) return null
  if (m < 12) return `${m.toFixed(0)} meses`
  const years = Math.floor(m / 12)
  const rest = Math.round(m - years * 12)
  return rest > 0 ? `${years}a ${rest}m` : `${years} ano${years !== 1 ? 's' : ''}`
}

function formatDateShort(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const birth = new Date(birthDate + 'T00:00:00')
  if (isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function ProfileTab({
  studentId,
  token,
}: {
  studentId: string
  token: string
}) {
  const [data, setData] = useState<ProfilePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const api = useMemo(() => createApi(token), [token])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<ProfilePayload>(`/students/${studentId}/profile`)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar perfil')
    } finally {
      setLoading(false)
    }
  }, [api, studentId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-4 border-copper border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-sm text-red-500 bg-red-50 rounded-btn px-4 py-3">
        {error}
      </p>
    )
  }

  if (!data) return null

  const { profile, strength, injuries, health_conditions, medications, surgeries, student } = data

  // ─── Empty state: no anamnese yet ──────────────────────────
  if (!profile) {
    return (
      <div>
        <div className="text-center py-10 bg-white rounded-card border border-teal/[0.09]">
          <p className="text-teal/30 text-3xl mb-2">🧬</p>
          <p className="text-sm text-teal/50">Perfil ainda não extraído.</p>
          <p className="text-xs text-teal/30 mt-1">Envie uma anamnese na aba Anamnese para gerar o perfil estruturado.</p>
        </div>

        {/* Even without a profile, coach may have added injuries/meds manually — show if any */}
        {(injuries.length + health_conditions.length + medications.length + surgeries.length) > 0 && (
          <div className="mt-5">
            <HealthSection
              studentId={studentId}
              token={token}
              injuries={injuries}
              health_conditions={health_conditions}
              medications={medications}
              surgeries={surgeries}
              onChanged={load}
            />
          </div>
        )}
      </div>
    )
  }

  const age = calcAge(student.birth_date)
  const activeInjuries = injuries.filter(i => i.active)

  return (
    <div>
      {/* Top banner: level + pyramid */}
      <div className="bg-gradient-to-br from-teal to-teal/80 rounded-card p-5 mb-5 text-white shadow-card">
        <p className="text-xs uppercase tracking-[0.15em] text-white/60 mb-1 font-jetbrains">
          Classificação
        </p>
        <p className="font-syne font-extrabold text-2xl md:text-3xl mb-2 tracking-[-0.02em]">
          {profile.level ? LEVEL_LABEL[profile.level] : 'PERFIL INCOMPLETO'}
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {profile.final_score !== null && (
            <Badge tone="copper">
              <span className="font-jetbrains">{profile.final_score.toFixed(2)}/4</span>
            </Badge>
          )}
          {profile.pyramid_stage !== null && (
            <span className="text-sm text-white/80">
              Pirâmide — degrau {profile.pyramid_stage}: <span className="font-semibold">{PYRAMID_LABEL[profile.pyramid_stage]}</span>
            </span>
          )}
        </div>
        {profile.extracted_at && (
          <p className="text-xs text-white/50">
            Extraído em {formatDateShort(profile.extracted_at)}
            {profile.source_chat_id && (
              <>
                {' · '}
                <Link
                  to={`/coach/students/${studentId}/chats/${profile.source_chat_id}`}
                  className="underline hover:text-white"
                >
                  ver transcrição
                </Link>
              </>
            )}
          </p>
        )}
        {profile.health_clearance_required && (
          <div className="mt-3 text-xs bg-red-500/20 border border-red-300/40 px-3 py-2 rounded-btn">
            ⚠ Requer liberação médica antes de iniciar
          </div>
        )}
      </div>

      {/* Salles scoring */}
      <SectionCard title="Pontuação Salles">
        <div className="space-y-2.5">
          <ScoreRow label="P1" sub="Tempo contínuo atual" score={profile.p1_score} />
          <ScoreRow label="P2" sub="Status de destreino" score={profile.p2_score} />
          <ScoreRow label="P3" sub="Experiência prévia total" score={profile.p3_score} />
          <ScoreRowAvg label="P4" sub="Técnica (média dos 4)" score={profile.p4_avg} />
          <ScoreRowAvg label="P5" sub="Força relativa (média dos 4)" score={profile.p5_avg} />
        </div>
      </SectionCard>

      {/* Strength per exercise */}
      {strength.length > 0 && (
        <SectionCard title="Força nos exercícios-base">
          <div className="divide-y divide-teal/[0.06]">
            {(['supino', 'agachamento', 'terra', 'puxada'] as Exercise[]).map(ex => {
              const row = strength.find(s => s.exercise === ex)
              return (
                <div key={ex} className="py-3 grid grid-cols-[1fr_auto_auto] items-center gap-3">
                  <span className="text-sm font-medium text-teal">{EXERCISE_LABEL[ex]}</span>
                  <span className="text-xs text-teal/60 font-jetbrains whitespace-nowrap">
                    {row?.load_kg !== undefined && row?.load_kg !== null
                      ? `${row.load_kg}kg × ${row.reps ?? '?'}`
                      : <span className="text-teal/25">—</span>}
                    {row?.relative_strength_pct !== undefined && row?.relative_strength_pct !== null && (
                      <span className="ml-2 text-teal/40">· {row.relative_strength_pct}%PC</span>
                    )}
                  </span>
                  <span className="text-xs flex items-center gap-1">
                    <Stars score={row?.technique_score ?? null} />
                    <span className="text-teal/30">·</span>
                    <Stars score={row?.strength_score ?? null} />
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-teal/40 mt-3 tracking-wide uppercase font-jetbrains">
            Técnica · Força
          </p>
        </SectionCard>
      )}

      {/* Identification */}
      <SectionCard title="Identificação">
        <KV label="Sexo" value={profile.sex === 'M' ? 'Masculino' : profile.sex === 'F' ? 'Feminino' : null} />
        <KV label="Idade" value={age !== null ? `${age} anos` : null} />
        <KV label="Peso" value={student.weight_kg !== null ? `${student.weight_kg} kg` : null} />
        <KV label="Estatura" value={student.height_cm !== null ? `${student.height_cm} cm` : null} />
      </SectionCard>

      {/* Objective */}
      <SectionCard title="Objetivo">
        <KV label="Principal" value={profile.primary_goal ? GOAL_LABEL[profile.primary_goal] : null} />
        <KV label="Detalhes" value={profile.primary_goal_detail} />
        <KV
          label="Áreas de foco"
          value={
            profile.body_focus_areas && profile.body_focus_areas.length > 0
              ? profile.body_focus_areas.join(', ')
              : null
          }
        />
        <KV label="Referência estética" value={profile.aesthetic_reference} />
      </SectionCard>

      {/* Secondary sport */}
      {profile.has_secondary_sport && (
        <SectionCard title="Modalidade complementar">
          <KV label="Modalidade" value={profile.secondary_sport} />
          <KV label="Tempo de prática" value={formatMonths(profile.secondary_sport_months)} />
          <KV label="Dias por semana" value={profile.secondary_sport_days_per_week} />
          <KV
            label="Duração por sessão"
            value={profile.secondary_sport_session_minutes !== null ? `${profile.secondary_sport_session_minutes} min` : null}
          />
          <KV
            label="Competição"
            value={
              profile.secondary_sport_has_competition === null
                ? null
                : profile.secondary_sport_has_competition
                ? profile.secondary_sport_competition_note ?? 'Sim'
                : 'Não'
            }
          />
          <KV label="Objetivo da musculação" value={profile.secondary_sport_objective} />
          <KV
            label="Mesmo dia"
            value={
              profile.same_day_training === null
                ? null
                : profile.same_day_training
                ? `Sim (${profile.same_day_order === 'antes' ? 'musculação antes' : 'musculação depois'})`
                : 'Dias separados'
            }
          />
          <KV
            label="Formato"
            value={
              profile.is_sport_cycle === null
                ? null
                : profile.is_sport_cycle
                ? 'Ciclo de preparação'
                : 'Paralelo indefinido'
            }
          />
        </SectionCard>
      )}

      {/* Availability */}
      <SectionCard title="Rotina & disponibilidade">
        <KV label="Dias totais/semana" value={profile.total_days_per_week} />
        <KV label="Dias de musculação" value={profile.strength_days_per_week} />
        <KV
          label="Duração máx./sessão"
          value={profile.max_session_minutes !== null ? `${profile.max_session_minutes} min` : null}
        />
        <KV
          label="Período"
          value={profile.preferred_period ? PERIOD_LABEL[profile.preferred_period] : null}
        />
        <KV
          label="Descansos fixos"
          value={
            profile.fixed_rest_days && profile.fixed_rest_days.length > 0
              ? profile.fixed_rest_days.join(', ')
              : null
          }
        />
      </SectionCard>

      {/* Training history */}
      <SectionCard title="Histórico de treino">
        <KV
          label="Treinando atualmente"
          value={
            profile.current_strength_training === null
              ? null
              : profile.current_strength_training
              ? 'Sim'
              : 'Não'
          }
        />
        <KV label="Continuamente há" value={formatMonths(profile.continuous_months)} />
        <KV label="Parado há" value={formatMonths(profile.detraining_months)} />
        <KV label="Experiência total" value={formatMonths(profile.total_experience_months)} />
        <KV label="Outros esportes" value={profile.sports_history} />
      </SectionCard>

      {/* Active injuries — highlighted */}
      {activeInjuries.length > 0 && (
        <SectionCard title={`Lesões ativas · ${activeInjuries.length}`}>
          <div className="space-y-2">
            {activeInjuries.map(inj => (
              <div key={inj.id} className="bg-red-50 border border-red-100 rounded-btn p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-teal">
                      {inj.body_part ? `${inj.body_part} — ` : ''}{inj.description}
                    </p>
                    <div className="flex gap-2 mt-1">
                      {inj.severity && <Badge tone="red">{inj.severity}</Badge>}
                      {inj.source !== 'manual' && <Badge>{inj.source}</Badge>}
                      {inj.occurred_at && (
                        <span className="text-[11px] text-teal/50">
                          {formatDateShort(inj.occurred_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Health (history) */}
      <HealthSection
        studentId={studentId}
        token={token}
        injuries={injuries}
        health_conditions={health_conditions}
        medications={medications}
        surgeries={surgeries}
        onChanged={load}
      />

      {/* Habits */}
      <SectionCard title="Hábitos de vida">
        <KV label="Horas de sono" value={profile.sleep_hours !== null ? `${profile.sleep_hours}h` : null} />
        <KV label="Qualidade do sono" value={profile.sleep_quality ? SLEEP_LABEL[profile.sleep_quality] : null} />
        <KV label="Tipo de trabalho" value={profile.work_type ? WORK_LABEL[profile.work_type] : null} />
        <KV label="Estresse" value={profile.stress_level ? STRESS_LABEL[profile.stress_level] : null} />
        <KV
          label="Fuma"
          value={
            profile.smokes === null
              ? null
              : profile.smokes
              ? profile.smoke_details ?? 'Sim'
              : 'Não'
          }
        />
        <KV
          label="Bebe"
          value={
            profile.drinks === null
              ? null
              : profile.drinks
              ? profile.drink_details ?? 'Sim'
              : 'Não'
          }
        />
      </SectionCard>

      {/* Nutrition */}
      <SectionCard title="Nutrição">
        <KV
          label="Acompanhamento nutricional"
          value={profile.has_nutritionist === null ? null : profile.has_nutritionist ? 'Sim' : 'Não'}
        />
        <KV
          label="Suplementação"
          value={
            profile.supplements && profile.supplements.length > 0
              ? profile.supplements.join(', ')
              : profile.uses_supplements === true
              ? 'Sim'
              : profile.uses_supplements === false
              ? 'Não'
              : null
          }
        />
        <KV
          label="Ingestão de proteína"
          value={profile.protein_intake_perception ? PROTEIN_LABEL[profile.protein_intake_perception] : null}
        />
      </SectionCard>
    </div>
  )
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function ScoreRow({ label, sub, score }: { label: string; sub: string; score: number | null }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm">
          <span className="font-jetbrains font-bold text-teal">{label}</span>
          <span className="text-teal/50 ml-2">{sub}</span>
        </span>
        <span className="font-jetbrains text-sm text-teal">
          {score !== null ? `${score}/4` : '—'}
        </span>
      </div>
      <PBar score={score} />
    </div>
  )
}

function ScoreRowAvg({ label, sub, score }: { label: string; sub: string; score: number | null }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm">
          <span className="font-jetbrains font-bold text-teal">{label}</span>
          <span className="text-teal/50 ml-2">{sub}</span>
        </span>
        <span className="font-jetbrains text-sm text-teal">
          {score !== null ? `${score.toFixed(2)}/4` : '—'}
        </span>
      </div>
      <PBar score={score} />
    </div>
  )
}

// ─── Health section: injuries + conditions + meds + surgeries ─

interface HealthSectionProps {
  studentId: string
  token: string
  injuries: InjuryRow[]
  health_conditions: HealthConditionRow[]
  medications: MedicationRow[]
  surgeries: SurgeryRow[]
  onChanged: () => void
}

function HealthSection({
  studentId,
  token,
  injuries,
  health_conditions,
  medications,
  surgeries,
  onChanged,
}: HealthSectionProps) {
  const [adding, setAdding] = useState<null | 'injury' | 'condition' | 'medication' | 'surgery'>(null)
  const api = useMemo(() => createApi(token), [token])

  async function remove(table: 'injuries' | 'health-conditions' | 'medications' | 'surgeries', id: string) {
    await api.delete(`/students/${studentId}/${table}/${id}`)
    onChanged()
  }

  async function toggleInjuryActive(inj: InjuryRow) {
    await api.patch(`/students/${studentId}/injuries/${inj.id}`, { active: !inj.active })
    onChanged()
  }

  const inactiveInjuries = injuries.filter(i => !i.active)

  return (
    <>
      <SectionCard
        title="Histórico de lesões"
        right={
          <button
            type="button"
            onClick={() => setAdding('injury')}
            className="text-xs text-copper font-medium hover:underline"
          >
            + Adicionar
          </button>
        }
      >
        {injuries.length === 0 ? (
          <p className="text-sm text-teal/40 py-2">Nenhuma lesão registrada.</p>
        ) : (
          <div className="space-y-1.5">
            {injuries.map(inj => (
              <div
                key={inj.id}
                className={`flex items-start justify-between gap-2 py-2 border-b border-teal/[0.06] last:border-b-0 ${
                  !inj.active ? 'opacity-50' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-teal">
                    {inj.body_part ? <span className="font-medium">{inj.body_part}</span> : null}
                    {inj.body_part && ' — '}
                    {inj.description}
                  </p>
                  <div className="flex gap-2 mt-0.5 flex-wrap">
                    {inj.severity && <Badge tone="red">{inj.severity}</Badge>}
                    {inj.source !== 'manual' && <Badge>{inj.source}</Badge>}
                    {inj.occurred_at && (
                      <span className="text-[11px] text-teal/50">{formatDateShort(inj.occurred_at)}</span>
                    )}
                    {!inj.active && <Badge>resolvida</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleInjuryActive(inj)}
                    className="text-xs text-teal/50 hover:text-teal"
                  >
                    {inj.active ? 'Resolver' : 'Reativar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove('injuries', inj.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
            {inactiveInjuries.length > 0 && (
              <p className="text-[11px] text-teal/40 pt-1">
                {inactiveInjuries.length} resolvida{inactiveInjuries.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}
        {adding === 'injury' && (
          <AddInjuryForm
            studentId={studentId}
            token={token}
            onClose={() => setAdding(null)}
            onSaved={() => {
              setAdding(null)
              onChanged()
            }}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Condições de saúde"
        right={
          <button
            type="button"
            onClick={() => setAdding('condition')}
            className="text-xs text-copper font-medium hover:underline"
          >
            + Adicionar
          </button>
        }
      >
        {health_conditions.length === 0 ? (
          <p className="text-sm text-teal/40 py-2">Nenhuma condição registrada.</p>
        ) : (
          <div className="space-y-1.5">
            {health_conditions.map(hc => (
              <SimpleHistoryRow
                key={hc.id}
                title={hc.condition}
                subtitle={hc.notes}
                source={hc.source}
                onDelete={() => remove('health-conditions', hc.id)}
              />
            ))}
          </div>
        )}
        {adding === 'condition' && (
          <AddConditionForm
            studentId={studentId}
            token={token}
            onClose={() => setAdding(null)}
            onSaved={() => {
              setAdding(null)
              onChanged()
            }}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Medicamentos"
        right={
          <button
            type="button"
            onClick={() => setAdding('medication')}
            className="text-xs text-copper font-medium hover:underline"
          >
            + Adicionar
          </button>
        }
      >
        {medications.length === 0 ? (
          <p className="text-sm text-teal/40 py-2">Nenhum medicamento registrado.</p>
        ) : (
          <div className="space-y-1.5">
            {medications.map(m => (
              <SimpleHistoryRow
                key={m.id}
                title={m.medication}
                subtitle={m.dosage}
                source={m.source}
                onDelete={() => remove('medications', m.id)}
              />
            ))}
          </div>
        )}
        {adding === 'medication' && (
          <AddMedicationForm
            studentId={studentId}
            token={token}
            onClose={() => setAdding(null)}
            onSaved={() => {
              setAdding(null)
              onChanged()
            }}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Cirurgias"
        right={
          <button
            type="button"
            onClick={() => setAdding('surgery')}
            className="text-xs text-copper font-medium hover:underline"
          >
            + Adicionar
          </button>
        }
      >
        {surgeries.length === 0 ? (
          <p className="text-sm text-teal/40 py-2">Nenhuma cirurgia registrada.</p>
        ) : (
          <div className="space-y-1.5">
            {surgeries.map(s => (
              <SimpleHistoryRow
                key={s.id}
                title={s.procedure_name}
                subtitle={s.occurred_at ? formatDateShort(s.occurred_at) : s.notes}
                source={s.source}
                onDelete={() => remove('surgeries', s.id)}
              />
            ))}
          </div>
        )}
        {adding === 'surgery' && (
          <AddSurgeryForm
            studentId={studentId}
            token={token}
            onClose={() => setAdding(null)}
            onSaved={() => {
              setAdding(null)
              onChanged()
            }}
          />
        )}
      </SectionCard>
    </>
  )
}

function SimpleHistoryRow({
  title,
  subtitle,
  source,
  onDelete,
}: {
  title: string
  subtitle?: string | null
  source: 'anamnese' | 'manual' | 'workout_feedback'
  onDelete: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-teal/[0.06] last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-teal">{title}</p>
        {subtitle && <p className="text-xs text-teal/50 mt-0.5">{subtitle}</p>}
        {source !== 'manual' && <span className="inline-block mt-1"><Badge>{source}</Badge></span>}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-red-400 hover:text-red-600 shrink-0"
      >
        Excluir
      </button>
    </div>
  )
}

// ─── Add-forms (inline, minimal) ──────────────────────────

function FormShell({
  onCancel,
  children,
}: {
  onCancel: () => void
  children: ReactNode
}) {
  return (
    <div className="mt-3 pt-3 border-t border-teal/[0.08] space-y-2">
      {children}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-teal/50 hover:text-teal px-3 py-1.5"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-xs text-teal/50 block mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal focus:outline-none focus:border-copper bg-white"
      />
    </label>
  )
}

function FormSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs text-teal/50 block mb-1">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-teal/[0.15] rounded-btn px-3 py-2 text-sm text-teal focus:outline-none focus:border-copper bg-white"
      >
        <option value="">—</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

function SubmitButton({
  onClick,
  loading,
  disabled,
}: {
  onClick: () => void
  loading: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="bg-copper text-white rounded-btn px-4 py-1.5 text-xs font-medium shadow-btn hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
    >
      {loading ? 'Salvando...' : 'Salvar'}
    </button>
  )
}

function AddInjuryForm({
  studentId,
  token,
  onClose,
  onSaved,
}: {
  studentId: string
  token: string
  onClose: () => void
  onSaved: () => void
}) {
  const [bodyPart, setBodyPart] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const api = createApi(token)

  async function save() {
    if (!description.trim()) return
    setSaving(true)
    setErr('')
    try {
      await api.post(`/students/${studentId}/injuries`, {
        body_part: bodyPart || null,
        description: description.trim(),
        severity: severity || null,
        active: true,
        occurred_at: occurredAt || null,
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormShell onCancel={onClose}>
      <FormInput label="Parte do corpo" value={bodyPart} onChange={setBodyPart} placeholder="Ex: ombro direito" />
      <FormInput label="Descrição" value={description} onChange={setDescription} placeholder="Tendinite supraespinhoso" />
      <FormSelect
        label="Gravidade"
        value={severity}
        onChange={setSeverity}
        options={[
          { value: 'leve', label: 'Leve' },
          { value: 'moderada', label: 'Moderada' },
          { value: 'grave', label: 'Grave' },
        ]}
      />
      <FormInput label="Quando ocorreu" value={occurredAt} onChange={setOccurredAt} type="date" />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex justify-end">
        <SubmitButton onClick={save} loading={saving} disabled={!description.trim()} />
      </div>
    </FormShell>
  )
}

function AddConditionForm({
  studentId,
  token,
  onClose,
  onSaved,
}: {
  studentId: string
  token: string
  onClose: () => void
  onSaved: () => void
}) {
  const [condition, setCondition] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const api = createApi(token)

  async function save() {
    if (!condition.trim()) return
    setSaving(true)
    setErr('')
    try {
      await api.post(`/students/${studentId}/health-conditions`, {
        condition: condition.trim(),
        notes: notes || null,
        active: true,
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormShell onCancel={onClose}>
      <FormInput label="Condição" value={condition} onChange={setCondition} placeholder="Hipertensão" />
      <FormInput label="Observações" value={notes} onChange={setNotes} placeholder="Opcional" />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex justify-end">
        <SubmitButton onClick={save} loading={saving} disabled={!condition.trim()} />
      </div>
    </FormShell>
  )
}

function AddMedicationForm({
  studentId,
  token,
  onClose,
  onSaved,
}: {
  studentId: string
  token: string
  onClose: () => void
  onSaved: () => void
}) {
  const [med, setMed] = useState('')
  const [dose, setDose] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const api = createApi(token)

  async function save() {
    if (!med.trim()) return
    setSaving(true)
    setErr('')
    try {
      await api.post(`/students/${studentId}/medications`, {
        medication: med.trim(),
        dosage: dose || null,
        active: true,
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormShell onCancel={onClose}>
      <FormInput label="Medicamento" value={med} onChange={setMed} placeholder="Losartana" />
      <FormInput label="Dose" value={dose} onChange={setDose} placeholder="50mg 1x ao dia" />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex justify-end">
        <SubmitButton onClick={save} loading={saving} disabled={!med.trim()} />
      </div>
    </FormShell>
  )
}

function AddSurgeryForm({
  studentId,
  token,
  onClose,
  onSaved,
}: {
  studentId: string
  token: string
  onClose: () => void
  onSaved: () => void
}) {
  const [procedureName, setProcedureName] = useState('')
  const [occurred, setOccurred] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const api = createApi(token)

  async function save() {
    if (!procedureName.trim()) return
    setSaving(true)
    setErr('')
    try {
      await api.post(`/students/${studentId}/surgeries`, {
        procedure_name: procedureName.trim(),
        occurred_at: occurred || null,
        notes: notes || null,
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormShell onCancel={onClose}>
      <FormInput label="Procedimento" value={procedureName} onChange={setProcedureName} placeholder="Hérnia inguinal" />
      <FormInput label="Data" value={occurred} onChange={setOccurred} type="date" />
      <FormInput label="Observações" value={notes} onChange={setNotes} placeholder="Opcional" />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex justify-end">
        <SubmitButton onClick={save} loading={saving} disabled={!procedureName.trim()} />
      </div>
    </FormShell>
  )
}
