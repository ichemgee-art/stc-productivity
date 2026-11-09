// STC Operations application routes
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoadingScreen from './components/LoadingScreen'
const LoginPage = lazy(() => import('./pages/LoginPage'))
const AppLayout = lazy(() => import('./layouts/AppLayout'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ProductivityPage = lazy(() => import('./pages/ProductivityPage'))
const NewSubmissionPage = lazy(() => import('./pages/NewSubmissionPage'))
const PeoplePage = lazy(() => import('./pages/PeoplePage'))
const AttendancePage = lazy(() => import('./pages/AttendancePage'))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'))
const SectionsPage = lazy(() => import('./pages/SectionsPage'))
const ComparisonPage = lazy(() => import('./pages/ComparisonPage'))
const AuditPage = lazy(() => import('./pages/AuditPage'))
const ExecutiveReportPage = lazy(() => import('./pages/ExecutiveReportPage'))
const QuarterReportPage = lazy(() => import('./pages/QuarterReportPage'))
const ProjectProgressPage = lazy(() => import('./pages/ProjectProgressPage'))
const NewProjectProgressPage = lazy(() => import('./pages/NewProjectProgressPage'))
const UsersAdminPage = lazy(() => import('./pages/UsersAdminPage'))
const SystemUsagePage = lazy(() => import('./pages/SystemUsagePage'))
const ProjectProgressDetailsPage = lazy(() => import('./pages/ProjectProgressDetailsPage'))

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
    <Suspense fallback={<LoadingScreen />}>
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
        <Route path="project-progress/:recordId" element={<ProjectProgressDetailsPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="sections" element={<SectionsPage />} />
        <Route path="comparison" element={<ComparisonPage />} />
        <Route path="report" element={<ExecutiveReportPage />} />
        <Route path="quarter" element={<QuarterReportPage />} />
        <Route path="audit" element={<RequireAdmin><AuditPage /></RequireAdmin>} />
        <Route path="admin/users" element={<RequireAdmin><UsersAdminPage /></RequireAdmin>} />
        <Route path="admin/system-usage" element={<RequireAdmin><SystemUsagePage /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
    </Routes>
    </Suspense>
  )
}
