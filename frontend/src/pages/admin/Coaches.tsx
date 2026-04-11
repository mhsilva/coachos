import { useEffect, useState } from 'react'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'

type Role = 'admin' | 'coach' | 'student'

interface UserRow {
  id: string
  email: string | null
  role: Role
  full_name: string | null
  avatar_url: string | null
  is_active: boolean
  coach_requested_at: string | null
  created_at: string
}

const roleLabel: Record<Role, string> = {
  admin: 'Admin',
  coach: 'Coach',
  student: 'Aluno',
}

const roleBadge: Record<Role, string> = {
  admin: 'bg-teal/10 text-teal',
  coach: 'bg-copper/10 text-copper',
  student: 'bg-gray text-teal/50',
}

type Tab = 'all' | 'requests'

export default function AdminCoaches() {
  const { session } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [settingId, setSettingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')

  async function fetchUsers() {
    if (!session?.access_token) return
    try {
      const data = await createApi(session.access_token).get<UserRow[]>('/auth/users')
      setUsers(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [session])

  async function handleSetRole(userId: string, role: Role) {
    if (!session?.access_token) return
    setSettingId(userId)
    try {
      await createApi(session.access_token).post('/auth/set-role', { user_id: userId, role })
      setUsers(prev =>
        prev.map(u =>
          u.id === userId ? { ...u, role, coach_requested_at: null } : u,
        ),
      )
    } catch (err) {
      console.error(err)
    } finally {
      setSettingId(null)
    }
  }

  async function handleDelete(userId: string) {
    if (!session?.access_token) return
    setDeletingId(userId)
    try {
      await createApi(session.access_token).delete(`/auth/users/${userId}`)
      setUsers(prev => prev.filter(u => u.id !== userId))
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingId(null)
      setConfirmId(null)
    }
  }

  const initial = (u: UserRow) =>
    (u.full_name ?? u.email ?? u.id).charAt(0).toUpperCase()

  const term = search.toLowerCase().trim()
  const filtered = term
    ? users.filter(
        u =>
          (u.full_name ?? '').toLowerCase().includes(term) ||
          (u.email ?? '').toLowerCase().includes(term),
      )
    : users

  // Apply tab filter
  const tabFiltered = tab === 'requests'
    ? filtered.filter(u => u.coach_requested_at)
    : filtered

  // Sort: coach requests first, then by name
  const sorted = [...tabFiltered].sort((a, b) => {
    if (a.coach_requested_at && !b.coach_requested_at) return -1
    if (!a.coach_requested_at && b.coach_requested_at) return 1
    return (a.full_name ?? '').localeCompare(b.full_name ?? '')
  })

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-2xl">
        <h1 className="page-title mb-4">Usuários</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-teal/[0.09]">
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === 'all'
                ? 'border-copper text-copper'
                : 'border-transparent text-teal/40 hover:text-teal/60'
            }`}
          >
            Todos os Usuários
          </button>
          <button
            type="button"
            onClick={() => setTab('requests')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              tab === 'requests'
                ? 'border-copper text-copper'
                : 'border-transparent text-teal/40 hover:text-teal/60'
            }`}
          >
            Solicitações de Coach
            {users.filter(u => u.coach_requested_at).length > 0 && (
              <span className="bg-copper text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {users.filter(u => u.coach_requested_at).length}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou email..."
          className="
            w-full border border-teal/[0.15] rounded-btn px-4 py-2.5 mb-5
            text-sm text-teal placeholder:text-teal/30
            focus:outline-none focus:border-copper transition-colors
          "
        />

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-copper border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">👥</p>
            <p className="font-medium text-teal">
              {term ? 'Nenhum resultado encontrado' : 'Nenhum usuário cadastrado'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(u => (
              <div
                key={u.id}
                className={`flex items-center gap-3 bg-white rounded-card border shadow-card p-4 ${
                  u.coach_requested_at
                    ? 'border-copper/30'
                    : 'border-teal/[0.09]'
                }`}
              >
                {/* Avatar */}
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center text-sm font-bold text-teal shrink-0">
                    {initial(u)}
                  </div>
                )}

                {/* Name + email + badges */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-teal truncate">
                    {u.full_name ?? 'Usuário'}
                  </p>
                  <p className="text-xs text-teal/40 truncate">{u.email}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBadge[u.role]}`}>
                      {roleLabel[u.role]}
                    </span>
                    {u.coach_requested_at && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-copper/10 text-copper">
                        Quer ser Coach
                      </span>
                    )}
                  </div>
                </div>

                {/* Role selector */}
                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={u.role}
                    disabled={settingId === u.id}
                    onChange={e => handleSetRole(u.id, e.target.value as Role)}
                    className="
                      border border-teal/[0.15] rounded-btn px-2 py-1.5
                      text-sm text-teal bg-white
                      focus:outline-none focus:border-copper
                      disabled:opacity-40 transition-colors
                    "
                  >
                    <option value="student">Aluno</option>
                    <option value="coach">Coach</option>
                    <option value="admin">Admin</option>
                  </select>

                  {confirmId === u.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(u.id)}
                        disabled={deletingId === u.id}
                        className="text-xs font-medium text-white bg-red-500 rounded-btn px-2 py-1.5 hover:bg-red-600 disabled:opacity-40 transition-colors"
                      >
                        {deletingId === u.id ? '...' : 'Sim'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="text-xs font-medium text-teal/50 border border-teal/[0.15] rounded-btn px-2 py-1.5 hover:border-teal/30 transition-colors"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(u.id)}
                      className="text-teal/30 hover:text-red-500 transition-colors p-1.5"
                      title="Deletar usuário"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
