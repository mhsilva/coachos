import { useEffect, useState } from 'react'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'

interface StudentData {
  id: string
  birth_date: string | null
  weight_kg: number | null
  email: string | null
  profiles: {
    full_name: string | null
    avatar_url: string | null
  } | null
}

export default function StudentProfile() {
  const { user, session, coachRequested } = useAuth()
  const [requested, setRequested] = useState(coachRequested)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Student data from backend
  const [studentData, setStudentData] = useState<StudentData | null>(null)
  const [birthDate, setBirthDate] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    ''
  const initial = displayName.charAt(0).toUpperCase()

  useEffect(() => {
    if (!session?.access_token) return
    createApi(session.access_token)
      .get<StudentData>('/students/me')
      .then(data => {
        setStudentData(data)
        if (data.birth_date) setBirthDate(data.birth_date)
        if (data.weight_kg !== null) setWeightKg(String(data.weight_kg))
      })
      .catch(() => { /* ignore — endpoint may not exist yet */ })
  }, [session])

  async function handleSave() {
    if (!session?.access_token || saving) return
    setSaving(true)
    setSaveSuccess(false)
    setError('')
    try {
      await createApi(session.access_token).patch('/students/me', {
        birth_date: birthDate || null,
        weight_kg: weightKg ? parseFloat(weightKg) : null,
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleRequestCoach() {
    if (!session?.access_token) return
    setLoading(true)
    setError('')
    try {
      await createApi(session.access_token).post('/auth/request-coach', {})
      setRequested(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar solicitação')
    } finally {
      setLoading(false)
    }
  }

  const origBirth = studentData?.birth_date ?? ''
  const origWeight = studentData?.weight_kg != null ? String(studentData.weight_kg) : ''
  const hasChanges = birthDate !== origBirth || weightKg !== origWeight

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-lg">
        <h1 className="page-title mb-6">Perfil</h1>

        {/* User info card */}
        <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5 mb-6">
          <div className="flex items-center gap-4">
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url as string}
                alt=""
                className="w-14 h-14 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-teal/10 flex items-center justify-center text-xl font-bold text-teal shrink-0">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-syne font-bold text-lg text-teal truncate">
                {displayName}
              </p>
              <p className="text-sm text-teal/50">{user?.email}</p>
              <span className="inline-block text-xs font-medium bg-gray text-teal/50 px-2 py-0.5 rounded-full mt-1">
                Aluno
              </span>
            </div>
          </div>
        </div>

        {/* Personal data */}
        <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5 mb-6">
          <h2 className="font-syne font-bold text-teal mb-4">Dados pessoais</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-teal/60 mb-1.5">Data de nascimento</label>
              <input
                type="date"
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                className="
                  w-full border border-teal/[0.15] rounded-btn px-3 py-2.5
                  text-sm text-teal font-jetbrains
                  focus:outline-none focus:border-copper transition-colors
                  bg-white
                "
              />
            </div>

            <div>
              <label className="block text-sm text-teal/60 mb-1.5">Peso (kg)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="500"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
                placeholder="ex: 75.5"
                className="
                  w-full border border-teal/[0.15] rounded-btn px-3 py-2.5
                  text-sm text-teal font-jetbrains placeholder:text-teal/25
                  focus:outline-none focus:border-copper transition-colors
                  bg-white
                "
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="
              w-full mt-5 bg-copper text-white rounded-btn py-3
              text-sm font-medium shadow-btn
              hover:opacity-90 active:scale-[0.98]
              transition-all disabled:opacity-40
            "
          >
            {saving ? 'Salvando...' : saveSuccess ? 'Salvo!' : 'Salvar'}
          </button>
        </div>

        {/* Coach request card */}
        <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5">
          <h2 className="font-syne font-bold text-teal mb-2">Quer ser Coach?</h2>
          <p className="text-sm text-teal/60 leading-relaxed mb-4">
            Solicite a promoção para coach e crie fichas de treino para seus alunos.
            Um administrador irá analisar sua solicitação.
          </p>

          {requested ? (
            <div className="bg-copper/10 text-copper rounded-btn px-4 py-3 text-sm font-medium text-center">
              Solicitação enviada — aguardando aprovação
            </div>
          ) : (
            <button
              type="button"
              onClick={handleRequestCoach}
              disabled={loading}
              className="
                w-full bg-copper text-white rounded-btn py-3
                text-sm font-medium shadow-btn
                hover:opacity-90 active:scale-[0.98]
                transition-all disabled:opacity-40
              "
            >
              {loading ? 'Enviando...' : 'Solicitar perfil de Coach'}
            </button>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
