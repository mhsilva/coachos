import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'

interface Student {
  id: string
  user_id: string
  coach_id: string | null
  profiles: {
    full_name: string | null
    avatar_url: string | null
    is_active: boolean
  } | null
}

interface DashboardData {
  students: Student[]
}

export default function CoachStudents() {
  const { session } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [linkSuccess, setLinkSuccess] = useState(false)

  function fetchStudents() {
    if (!session?.access_token) return
    createApi(session.access_token)
      .get<DashboardData>('/dashboard/coach')
      .then(d => setStudents(d.students))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(fetchStudents, [session])

  async function handleLinkStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.access_token) return
    setLinking(true)
    setLinkError('')
    setLinkSuccess(false)
    try {
      await createApi(session.access_token).post('/auth/link-student', {
        student_email: emailInput,
      })
      setLinkSuccess(true)
      setEmailInput('')
      fetchStudents()
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Erro ao vincular aluno')
    } finally {
      setLinking(false)
    }
  }

  function closeModal() {
    setModalOpen(false)
    setEmailInput('')
    setLinkError('')
    setLinkSuccess(false)
  }

  const initial = (s: Student) =>
    (s.profiles?.full_name ?? s.user_id).charAt(0).toUpperCase()

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="page-title">Alunos</h1>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="bg-copper text-white rounded-btn px-4 py-2 text-sm font-medium shadow-btn hover:opacity-90 active:scale-95 transition-all"
          >
            + Vincular aluno
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-copper border-t-transparent rounded-full animate-spin" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">👥</p>
            <p className="font-medium text-teal">Nenhum aluno vinculado</p>
            <p className="text-sm text-teal/50 mt-1">
              Vincule um aluno pelo email usando o botão acima.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {students.map(s => (
              <Link
                key={s.id}
                to={`/coach/students/${s.id}`}
                className="flex items-center gap-4 bg-white rounded-card border border-teal/[0.09] shadow-card p-4 hover:border-copper/30 active:scale-[0.99] transition-all"
              >
                {/* Avatar */}
                {s.profiles?.avatar_url ? (
                  <img
                    src={s.profiles.avatar_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center text-sm font-bold text-teal shrink-0">
                    {initial(s)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-teal truncate">
                    {s.profiles?.full_name ?? 'Aluno'}
                  </p>
                </div>

                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                    s.profiles?.is_active
                      ? 'bg-teal/10 text-teal'
                      : 'bg-gray text-teal/40'
                  }`}
                >
                  {s.profiles?.is_active ? 'Ativo' : 'Inativo'}
                </span>

                <svg className="w-4 h-4 text-teal/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Link student modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-teal/40 backdrop-blur-sm"
            onClick={closeModal}
          />

          <div className="relative w-full max-w-sm bg-white rounded-card shadow-xl p-6">
            <h2 className="font-syne font-bold text-lg text-teal mb-1">Vincular aluno</h2>
            <p className="text-sm text-teal/50 mb-5">
              O aluno precisa ter criado uma conta antes de ser vinculado.
            </p>

            <form onSubmit={handleLinkStudent} className="space-y-4">
              <div>
                <label className="block text-sm text-teal/60 mb-1.5">Email do aluno</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  required
                  placeholder="aluno@email.com"
                  className="
                    w-full border border-teal/[0.15] rounded-btn px-3 py-2.5
                    text-sm text-teal placeholder:text-teal/25
                    focus:outline-none focus:border-copper transition-colors
                  "
                />
              </div>

              {linkError && <p className="text-sm text-red-500">{linkError}</p>}
              {linkSuccess && (
                <p className="text-sm text-teal font-medium">Aluno vinculado com sucesso!</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 border border-teal/[0.15] rounded-btn py-2.5 text-sm font-medium text-teal/60 hover:bg-surface transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={linking}
                  className="flex-1 bg-copper text-white rounded-btn py-2.5 text-sm font-medium shadow-btn hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  {linking ? 'Vinculando...' : 'Vincular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
