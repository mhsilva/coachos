import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface NavItem {
  label: string
  path: string
}

const coachNav: NavItem[] = [
  { label: 'Dashboard', path: '/coach' },
  { label: 'Alunos', path: '/coach/students' },
]

const studentNav: NavItem[] = [
  { label: 'Treino', path: '/student' },
  { label: 'Histórico', path: '/student/history' },
]

const adminNav: NavItem[] = [
  { label: 'Coaches', path: '/admin' },
]

export function BottomNav() {
  const { role } = useAuth()

  const navItems =
    role === 'coach' ? coachNav :
    role === 'student' ? studentNav :
    role === 'admin' ? adminNav : []

  if (!navItems.length) return null

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-teal border-t border-white/10 pb-safe">
      <div className="flex">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-3 min-h-[56px] text-xs font-medium transition-colors ${
                isActive ? 'text-copper' : 'text-white/50'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
