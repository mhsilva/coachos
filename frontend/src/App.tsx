import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './router/ProtectedRoute'

import Login from './pages/Login'
import Pending from './pages/Pending'
import CoachDashboard from './pages/coach/Dashboard'
import CoachStudents from './pages/coach/Students'
import CoachStudentDetail from './pages/coach/StudentDetail'
import StudentToday from './pages/student/Today'
import StudentHistory from './pages/student/History'
import StudentProfile from './pages/student/Profile'
import AdminCoaches from './pages/admin/Coaches'

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
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/pending" element={<Pending />} />
          <Route path="/" element={<RoleRedirect />} />

          <Route element={<ProtectedRoute allowedRoles={['coach']} />}>
            <Route path="/coach" element={<CoachDashboard />} />
            <Route path="/coach/students" element={<CoachStudents />} />
            <Route path="/coach/students/:id" element={<CoachStudentDetail />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['student']} />}>
            <Route path="/student" element={<StudentToday />} />
            <Route path="/student/history" element={<StudentHistory />} />
            <Route path="/student/profile" element={<StudentProfile />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<AdminCoaches />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
