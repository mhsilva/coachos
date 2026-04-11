import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../contexts/NotificationContext'

interface NavItem {
  label: string
  path: string
}

const coachNav: NavItem[] = [
  { label: 'Dashboard', path: '/coach' },
  { label: 'Alunos', path: '/coach/students' },
]

const studentNav: NavItem[] = [
  { label: 'Treinos', path: '/student' },
  { label: 'Histórico', path: '/student/history' },
  { label: 'Perfil', path: '/student/profile' },
]

const adminNav: NavItem[] = [
  { label: 'Usuários', path: '/admin' },
]

export function BottomNav() {
  const { role } = useAuth()
  const { unreadCount } = useNotifications()

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

        {/* Notification bell */}
        <NavLink
          to="/notifications"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-3 min-h-[56px] text-xs font-medium transition-colors ${
              isActive ? 'text-copper' : 'text-white/50'
            }`
          }
        >
          <span className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.515 1.076 32.91 32.91 0 003.256.508 3.5 3.5 0 006.972 0 32.903 32.903 0 003.256-.508.75.75 0 00.515-1.076A11.448 11.448 0 0116 8a6 6 0 00-6-6zm0 14.5a2 2 0 01-1.95-1.557 33.146 33.146 0 003.9 0A2 2 0 0110 16.5z" clipRule="evenodd" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </span>
        </NavLink>
      </div>
    </nav>
  )
}
