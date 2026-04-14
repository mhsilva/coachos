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

type StudentList = Student[]

interface Invite {
  id: string
  status: string
  created_at: string
  students: {
    user_id: string
    profiles: {
      full_name: string | null
      avatar_url: string | null
    } | null
  } | null
}

export default function CoachStudents() {
  const { session } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState(false)

  function fetchStudents() {
    if (!session?.access_token) return
    const api = createApi(session.access_token)
    Promise.all([
      api.get<StudentList>('/dashboard/coach/students'),
      api.get<Invite[]>('/auth/invites/sent'),
    ])
      .then(([studentList, invites]) => {
        setStudents(studentList)
        setPendingInvites(invites.filter(i => i.status === 'pending'))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(fetchStudents, [session])

  async function handleInviteStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.access_token) return
    setInviting(true)
    setInviteError('')
    setInviteSuccess(false)
    try {
      await createApi(session.access_token).post('/auth/invite-student', {
        student_email: emailInput,
      })
      setInviteSuccess(true)
      setEmailInput('')
      fetchStudents()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao convidar aluno')
    } finally {
      setInviting(false)
    }
  }

  function closeModal() {
    setModalOpen(false)
    setEmailInput('')
    setInviteError('')
    setInviteSuccess(false)
  }

  const initial = (s: Student) =>
    (s.profiles?.full_name ?? s.user_id).charAt(0).toUpperCase()

  const [cancellingId, setCancellingId] = useState<string | null>(null)

  async function handleCancelInvite(inviteId: string) {
    if (!session?.access_token) return
    setCancellingId(inviteId)
    try {
      await createApi(session.access_token).delete(`/auth/invites/${inviteId}`)
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId))
    } catch (err) {
      console.error(err)
    } finally {
      setCancellingId(null)
    }
  }

  const inviteInitial = (i: Invite) =>
    (i.students?.profiles?.full_name ?? '?').charAt(0).toUpperCase()

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
            + Convidar aluno
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
              Convide um aluno pelo email usando o botão acima.
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

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <div className="mt-8">
            <h2 className="font-syne font-bold text-teal text-sm mb-3">
              Convites pendentes
            </h2>
            <div className="space-y-2">
              {pendingInvites.map(inv => (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 bg-white rounded-card border border-copper/20 p-4"
                >
                  <div className="w-10 h-10 rounded-full bg-copper/10 flex items-center justify-center text-sm font-bold text-copper shrink-0">
                    {inviteInitial(inv)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-teal truncate">
                      {inv.students?.profiles?.full_name ?? 'Aluno'}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-copper bg-copper/10 px-2 py-0.5 rounded-full shrink-0">
                    Aguardando
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCancelInvite(inv.id)}
                    disabled={cancellingId === inv.id}
                    className="text-teal/30 hover:text-red-500 transition-colors p-1 shrink-0 disabled:opacity-40"
                    title="Cancelar convite"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Invite student modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-teal/40 backdrop-blur-sm"
            onClick={closeModal}
          />

          <div className="relative w-full max-w-sm bg-white rounded-card shadow-xl p-6">
            <h2 className="font-syne font-bold text-lg text-teal mb-1">Convidar aluno</h2>
            <p className="text-sm text-teal/50 mb-5">
              O aluno precisa ter criado uma conta. Ele receberá um convite para aceitar.
            </p>

            <form onSubmit={handleInviteStudent} className="space-y-4">
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

              {inviteError && <p className="text-sm text-red-500">{inviteError}</p>}
              {inviteSuccess && (
                <p className="text-sm text-teal font-medium">Convite enviado com sucesso!</p>
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
                  disabled={inviting}
                  className="flex-1 bg-copper text-white rounded-btn py-2.5 text-sm font-medium shadow-btn hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  {inviting ? 'Enviando...' : 'Convidar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
