import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { t } from './i18n'
import { isConfigured } from './lib/supabase'
import { useSession } from './lib/session'
import ForgotPassword from './pages/ForgotPassword'
import Invites from './pages/Invites'
import Join from './pages/Join'
import Login from './pages/Login'
import MemberEdit from './pages/MemberEdit'
import Members from './pages/Members'
import ProfilePage from './pages/Profile'
import ResetPassword from './pages/ResetPassword'

// Signed in people with a profile get the app. Everyone else is sent to log in.
function Protected() {
  const { loading, session, profile, isStaff } = useSession()
  if (loading) return <p className="center">{t('common.loading')}</p>
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/login" replace />
  return (
    <div className="shell">
      <main>
        <Outlet />
      </main>
      <nav className="tabs">
        <NavLink to="/">{t('nav.members')}</NavLink>
        <NavLink to="/profile">{t('nav.profile')}</NavLink>
        {isStaff && <NavLink to="/invites">{t('nav.invites')}</NavLink>}
      </nav>
    </div>
  )
}

export default function App() {
  if (!isConfigured) return <p className="center error">{t('error.missingConfig')}</p>
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/join/:token" element={<Join />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Members />} />
        <Route path="/members/:id" element={<MemberEdit />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/invites" element={<Invites />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
