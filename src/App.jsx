// STC Operations application routes
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoadingScreen from './components/LoadingScreen'
import LoginPage from './pages/LoginPage'
import AppLayout from './layouts/AppLayout'
import DashboardPage from './pages/DashboardPage'
import ProductivityPage from './pages/ProductivityPage'
import NewSubmissionPage from './pages/NewSubmissionPage'
import PeoplePage from './pages/PeoplePage'
import AttendancePage from './pages/AttendancePage'
import ProjectsPage from './pages/ProjectsPage'
import SectionsPage from './pages/SectionsPage'
import ComparisonPage from './pages/ComparisonPage'
import AuditPage from './pages/AuditPage'
import ExecutiveReportPage from './pages/ExecutiveReportPage'
import QuarterReportPage from './pages/QuarterReportPage'
import ProjectProgressPage from './pages/ProjectProgressPage'
import NewProjectProgressPage from './pages/NewProjectProgressPage'
import UsersAdminPage from './pages/UsersAdminPage'
import Project360Page from './pages/Project360Page'

function RequireAuth({ children }) {
  const { session, profile, loading, error, signOut } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (error && !profile) {
    return (
      <div className="auth-fatal-screen">
        <div className="route-error-card">
          <h3>تعذر تحميل صلاحيات الحساب</h3>
          <p>{error}</p>
          <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>إعادة المحاولة</button>
          <button className="btn btn-ghost" type="button" onClick={signOut}>تسجيل الخروج</button>
        </div>
      </div>
    )
  }
  return children
}

function RequireCreate({ children }) {
  const { permissions } = useAuth()
  return permissions.canCreateSubmission ? children : <Navigate to="/" replace />
}

function RequireAdmin({ children }) {
  const { permissions } = useAuth()
  return permissions.isAdmin ? children : <Navigate to="/" replace />
}

export default function App() {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="productivity" element={<ProductivityPage />} />
        <Route path="productivity/new" element={<RequireCreate><NewSubmissionPage /></RequireCreate>} />
        <Route path="people/engineer" element={<PeoplePage key="engineer" role="engineer" />} />
        <Route path="people/technician" element={<PeoplePage key="technician" role="technician" />} />
        <Route path="people/assistant" element={<PeoplePage key="assistant" role="assistant" />} />
        <Route path="people/worker" element={<PeoplePage key="worker" role="worker" />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="project-progress" element={<ProjectProgressPage />} />
        <Route path="project-progress/new" element={<RequireCreate><NewProjectProgressPage /></RequireCreate>} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<Project360Page />} />
        <Route path="sections" element={<SectionsPage />} />
        <Route path="comparison" element={<ComparisonPage />} />
        <Route path="report" element={<ExecutiveReportPage />} />
        <Route path="quarter" element={<QuarterReportPage />} />
        <Route path="audit" element={<RequireAdmin><AuditPage /></RequireAdmin>} />
        <Route path="admin/users" element={<RequireAdmin><UsersAdminPage /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
    </Routes>
  )
}
