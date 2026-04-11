import { useEffect, useState } from 'react'
import { AppLayout } from '../../components/AppLayout'
import { useAuth } from '../../hooks/useAuth'
import { createApi } from '../../lib/api'

type Role = 'admin' | 'coach' | 'student'

interface UserRow {
  id: string
  role: Role
  full_name: string | null
  avatar_url: string | null
  is_active: boolean
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

export default function AdminCoaches() {
  const { session } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [settingId, setSettingId] = useState<string | null>(null)

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
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
    } catch (err) {
      console.error(err)
    } finally {
      setSettingId(null)
    }
  }

  const initial = (u: UserRow) =>
    (u.full_name ?? u.id).charAt(0).toUpperCase()

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-2xl">
        <h1 className="page-title mb-6">Usuários</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-copper border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">👥</p>
            <p className="font-medium text-teal">Nenhum usuário cadastrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div
                key={u.id}
                className="flex items-center gap-3 bg-white rounded-card border border-teal/[0.09] shadow-card p-4"
              >
                {/* Avatar */}
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center text-sm font-bold text-teal shrink-0">
                    {initial(u)}
                  </div>
                )}

                {/* Name + role badge */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-teal truncate">
                    {u.full_name ?? 'Usuário'}
                  </p>
                  <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 ${roleBadge[u.role]}`}>
                    {roleLabel[u.role]}
                  </span>
                </div>

                {/* Role selector */}
                <select
                  value={u.role}
                  disabled={settingId === u.id}
                  onChange={e => handleSetRole(u.id, e.target.value as Role)}
                  className="
                    border border-teal/[0.15] rounded-btn px-2 py-1.5
                    text-sm text-teal bg-white shrink-0
                    focus:outline-none focus:border-copper
                    disabled:opacity-40 transition-colors
                  "
                >
                  <option value="student">Aluno</option>
                  <option value="coach">Coach</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
