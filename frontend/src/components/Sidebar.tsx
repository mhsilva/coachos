import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface NavItem {
  label: string
  path: string
  icon: string
}

const coachNav: NavItem[] = [
  { label: 'Dashboard', path: '/coach', icon: '◈' },
  { label: 'Alunos', path: '/coach/students', icon: '⊞' },
]

const studentNav: NavItem[] = [
  { label: 'Treino do Dia', path: '/student', icon: '◎' },
  { label: 'Histórico', path: '/student/history', icon: '◷' },
  { label: 'Perfil', path: '/student/profile', icon: '◉' },
]

const adminNav: NavItem[] = [
  { label: 'Coaches', path: '/admin', icon: '◈' },
]

export function Sidebar() {
  const { user, role, signOut } = useAuth()
  const navigate = useNavigate()

  const navItems =
    role === 'coach' ? coachNav :
    role === 'student' ? studentNav :
    role === 'admin' ? adminNav : []

  const roleLabel =
    role === 'coach' ? 'Coach' :
    role === 'student' ? 'Aluno' :
    role === 'admin' ? 'Admin' : ''

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const displayName =
    user?.user_metadata?.full_name as string | undefined ??
    user?.email?.split('@')[0] ?? ''

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen bg-teal text-white shrink-0">
      {/* Logo */}
      <div className="px-6 pt-8 pb-6">
        <h1 className="font-syne font-extrabold text-2xl tracking-[-0.02em]">
          CoachOS
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-btn text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-copper text-white shadow-btn'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="px-4 py-5 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold uppercase shrink-0">
            {displayName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{displayName}</p>
            <p className="text-xs text-white/40">{roleLabel}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-white/40 hover:text-white transition-colors"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
