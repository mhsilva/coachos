import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { ProtectedRoute } from './router/ProtectedRoute'

import Login from './pages/Login'
import Pending from './pages/Pending'
import CoachDashboard from './pages/coach/Dashboard'
import CoachStudents from './pages/coach/Students'
import CoachStudentDetail from './pages/coach/StudentDetail'
import CoachPlanBuilder from './pages/coach/PlanBuilder'
import StudentToday from './pages/student/Today'
import StudentHistory from './pages/student/History'
import StudentProfile from './pages/student/Profile'
import StudentChat from './pages/student/Chat'
import CoachChatTranscript from './pages/coach/ChatTranscript'
import AdminCoaches from './pages/admin/Coaches'
import Notifications from './pages/Notifications'
import Profile from './pages/Profile'

function RoleRedirect() {
  const { user, role, loading } = useAuth()
  if (loading) return null
  if (role === 'coach') return <Navigate to="/coach" replace />
  if (role === 'student') return <Navigate to="/student" replace />
  if (role === 'admin') return <Navigate to="/admin" replace />
  // Logged in but no role yet — waiting for admin activation
  if (user) return <Navigate to="/pending" replace />
  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/pending" element={<Pending />} />
            <Route path="/" element={<RoleRedirect />} />

            <Route element={<ProtectedRoute allowedRoles={['coach']} />}>
              <Route path="/coach" element={<CoachDashboard />} />
              <Route path="/coach/students" element={<CoachStudents />} />
              <Route path="/coach/students/:id" element={<CoachStudentDetail />} />
              <Route path="/coach/students/:id/plans/new" element={<CoachPlanBuilder />} />
              <Route path="/coach/students/:id/plans/:planId" element={<CoachPlanBuilder />} />
              <Route path="/coach/students/:id/chats/:chatId" element={<CoachChatTranscript />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['student']} />}>
              <Route path="/student" element={<StudentToday />} />
              <Route path="/student/history" element={<StudentHistory />} />
              <Route path="/student/profile" element={<StudentProfile />} />
              <Route path="/student/chat/:id" element={<StudentChat />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="/admin" element={<AdminCoaches />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['coach', 'student', 'admin']} />}>
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/profile" element={<Profile />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
