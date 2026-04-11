import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { useAuth } from '../hooks/useAuth'

const roleLabel: Record<string, string> = {
  admin: 'Admin',
  coach: 'Coach',
  student: 'Aluno',
}

const roleBadge: Record<string, string> = {
  admin: 'bg-teal/10 text-teal',
  coach: 'bg-copper/10 text-copper',
  student: 'bg-gray text-teal/50',
}

export default function Profile() {
  const { user, role, signOut } = useAuth()
  const navigate = useNavigate()

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    ''
  const initial = displayName.charAt(0).toUpperCase()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <AppLayout>
      <div className="px-4 py-6 md:px-8 max-w-lg">
        <h1 className="page-title mb-6">Perfil</h1>

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
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${roleBadge[role ?? 'student']}`}>
                {roleLabel[role ?? 'student']}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="
            w-full border border-teal/[0.15] rounded-btn py-3
            text-sm font-medium text-teal/60
            hover:bg-surface active:scale-[0.98]
            transition-all
          "
        >
          Sair da conta
        </button>
      </div>
    </AppLayout>
  )
}
