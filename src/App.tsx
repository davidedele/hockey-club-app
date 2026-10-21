import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { t } from './i18n'
import { isConfigured } from './lib/supabase'
import Avatar from './components/Avatar'
import Crest from './components/Crest'
import { useAvatarUrls } from './lib/avatars'
import { useClub } from './lib/club'
import { getPendingInvite } from './lib/invite'
import { useSession } from './lib/session'
import { supabase } from './lib/supabase'
import AttendanceSummary from './pages/AttendanceSummary'
import ClubSettings from './pages/ClubSettings'
import GroupSettings from './pages/GroupSettings'
import Settings from './pages/Settings'
import EventDetail from './pages/EventDetail'
import EventForm from './pages/EventForm'
import Events from './pages/Events'
import ForgotPassword from './pages/ForgotPassword'
import Invites from './pages/Invites'
import Join from './pages/Join'
import Login from './pages/Login'
import MemberEdit from './pages/MemberEdit'
import Members from './pages/Members'
import Unanswered from './pages/Unanswered'
import ProfilePage from './pages/Profile'
import ResetPassword from './pages/ResetPassword'

const ICONS = {
  events: <path d="M7 3v3M17 3v3M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16" />,
  members: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.2a3.2 3.2 0 0 1 0 5.6M18.5 14.8c1.6.7 2.5 2.2 2.5 4.2" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  invites: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />,
  attendance: <path d="M5 20V11M12 20V5M19 20v-6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
}

function TabIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

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

  if (count === 0 || location.pathname === '/events') return null
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
  const club = useClub()
  const mine = useAvatarUrls([profile?.avatar_path])
  if (loading) return <p className="center">{t('common.loading')}</p>
  if (!session) return <Navigate to="/login" replace />
  if (!profile) {
    const pending = getPendingInvite()
    return <Navigate to={pending ? `/join/${pending}` : '/login'} replace />
  }
  const photo = profile.avatar_path ? mine.get(profile.avatar_path) : null
  const fullName = `${profile.first_name} ${profile.last_name}`
  const main = (
    <>
      <NavLink to="/events"><TabIcon name="events" />{t('nav.events')}</NavLink>
      <NavLink to="/" end><TabIcon name="members" />{t('nav.members')}</NavLink>
      {isStaff && <NavLink to="/attendance"><TabIcon name="attendance" />{t('nav.attendance')}</NavLink>}
    </>
  )
  return (
    <div className="shell">
      <aside className="side">
        <Link className="club" to="/events"><Crest /><span className="club-name">{club.name || t('app.name')}</span></Link>
        <nav aria-label={t('nav.main')}>{main}</nav>
        <nav className="side-foot" aria-label={t('nav.account')}>
          {isStaff && <NavLink to="/settings"><TabIcon name="settings" />{t('settings.title')}</NavLink>}
          <NavLink to="/profile"><Avatar first={profile.first_name} last={profile.last_name} url={photo} size="small" />{fullName}</NavLink>
        </nav>
      </aside>
      <div className="body">
        <header className="top">
          <Link className="club" to="/events"><Crest /><span className="club-name">{club.name || t('app.name')}</span></Link>
          <NavLink className="me" to="/profile" aria-label={t('nav.profileOf', { name: fullName })}><Avatar first={profile.first_name} last={profile.last_name} url={photo} /></NavLink>
        </header>
        <PendingBanner />
        <main>
          <Outlet />
        </main>
      </div>
      <nav className="tabs" aria-label={t('nav.main')}>
        {main}
        <NavLink to="/profile"><TabIcon name="profile" />{t('nav.profile')}</NavLink>
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
        <Route path="/events/unanswered" element={<Unanswered />} />
        <Route path="/attendance" element={<AttendanceSummary />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/events/:id/edit" element={<EventForm />} />
        <Route path="/members/:id" element={<MemberEdit />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/club" element={<ClubSettings />} />
        <Route path="/settings/groups" element={<GroupSettings />} />
        <Route path="/settings/invites" element={<Invites />} />
        <Route path="/invites" element={<Navigate to="/settings/invites" replace />} />
        <Route path="/club" element={<Navigate to="/settings/club" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
