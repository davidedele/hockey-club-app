import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { t } from './i18n'
import { isConfigured } from './lib/supabase'
import { useSession } from './lib/session'
import { supabase } from './lib/supabase'
import EventDetail from './pages/EventDetail'
import EventForm from './pages/EventForm'
import Events from './pages/Events'
import ForgotPassword from './pages/ForgotPassword'
import Invites from './pages/Invites'
import Join from './pages/Join'
import Login from './pages/Login'
import MemberEdit from './pages/MemberEdit'
import Members from './pages/Members'
import ProfilePage from './pages/Profile'
import ResetPassword from './pages/ResetPassword'

const BANNER_DAYS = 14

// A banner on every screen while an event in the next two weeks has no answer yet.
function PendingBanner() {
  const { profile } = useSession()
  const location = useLocation()
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    if (!profile) return
    const now = new Date()
    const until = new Date(now.getTime() + BANNER_DAYS * 86400000)
    const [e, a] = await Promise.all([
      supabase.from('events').select('id, event_groups(group_id)').gt('ends_at', now.toISOString()).lt('starts_at', until.toISOString()),
      supabase.from('attendance_answers').select('event_id').eq('user_id', profile.id),
    ])
    const answered = new Set(((a.data ?? []) as { event_id: string }[]).map((x) => x.event_id))
    const mine = await supabase.from('group_members').select('group_id').eq('user_id', profile.id)
    const myGroups = new Set(((mine.data ?? []) as { group_id: number }[]).map((x) => x.group_id))
    const events = (e.data ?? []) as unknown as { id: string; event_groups: { group_id: number }[] }[]
    setCount(events.filter((x) => !answered.has(x.id) && x.event_groups.some((g) => myGroups.has(g.group_id))).length)
  }, [profile])

  useEffect(() => {
    void load()
  }, [load, location.pathname])

  useEffect(() => {
    window.addEventListener('attendance-changed', load)
    return () => window.removeEventListener('attendance-changed', load)
  }, [load])

  if (count === 0) return null
  return (
    <div className="banner" role="status">
      <span>{count === 1 ? t('banner.one') : t('banner.many', { n: String(count) })}</span>
      <Link to="/events">{t('banner.action')}</Link>
    </div>
  )
}

// Signed in people with a profile get the app. Everyone else is sent to log in.
function Protected() {
  const { loading, session, profile, isStaff } = useSession()
  if (loading) return <p className="center">{t('common.loading')}</p>
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/login" replace />
  return (
    <div className="shell">
      <PendingBanner />
      <main>
        <Outlet />
      </main>
      <nav className="tabs">
        <NavLink to="/events">{t('nav.events')}</NavLink>
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
        <Route path="/events" element={<Events />} />
        <Route path="/events/new" element={<EventForm />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/events/:id/edit" element={<EventForm />} />
        <Route path="/members/:id" element={<MemberEdit />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/invites" element={<Invites />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
