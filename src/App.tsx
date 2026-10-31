import { personName } from './lib/names'
import { PageSkeleton } from './components/Skeleton'
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { t, type MessageKey } from './i18n'
import { isConfigured } from './lib/supabase'
import Avatar from './components/Avatar'
import Bell from './components/Bell'
import GroupSwitch from './components/GroupSwitch'
import ViewSwitch from './components/ViewSwitch'
import Crest from './components/Crest'
import { useAvatarUrls } from './lib/avatars'
import { useClub } from './lib/club'
import { useCrumbLeaf } from './lib/crumb'
import { useGroupFilter } from './lib/groupfilter'
import { useNotifications } from './lib/notifications'
import { getPendingInvite } from './lib/invite'
import { useSession } from './lib/session'
import Announcements from './pages/Announcements'
import Attendance from './pages/Attendance'
import ClubSettings from './pages/ClubSettings'
import Documents from './pages/Documents'
import Championship from './pages/Championship'
import DocumentsBanner from './components/DocumentsBanner'
import UpdateBanner from './components/UpdateBanner'
import GroupSettings from './pages/GroupSettings'
import IceHours from './pages/IceHours'
import RinkSettings from './pages/RinkSettings'
import Settings from './pages/Settings'
import Stats from './pages/Stats'
import EventDetail from './pages/EventDetail'
import EventForm from './pages/EventForm'
import Events from './pages/Events'
import ForgotPassword from './pages/ForgotPassword'
import Invites from './pages/Invites'
import Drills from './pages/Drills'
import Join from './pages/Join'
import LeagueMatch from './pages/LeagueMatch'
import Lineup from './pages/Lineup'
import Plan from './pages/Plan'
import Login from './pages/Login'
import MemberEdit from './pages/MemberEdit'
import Members from './pages/Members'
import Home from './pages/Home'
import ProfileLayout, { ProfileAbsences, ProfileApp, ProfileCalendar, ProfileInfo, ProfileNotifications } from './pages/Profile'
import ResetPassword from './pages/ResetPassword'

const ICONS = {
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
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
  stats: <path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4v3h-4z" />,
  drills: <path d="M5 4h11l3 3v13H5zM9 9h6M9 13h6M9 17h3" />,
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

// A banner on every screen while an event in the next two weeks has no answer yet. The text names the
// two weeks, so its number never contradicts the longer list on the events page.
function PendingBanner({ count }: { count: number }) {
  const location = useLocation()
  if (count === 0 || location.pathname === '/' || location.pathname === '/events' || location.pathname.startsWith('/settings') || location.pathname.startsWith('/profile')) return null
  return (
    <div className="banner" role="status">
      <span>{count === 1 ? t('banner.one') : t('banner.many', { n: String(count) })}</span>
      <Link to="/events">{t('banner.action')}</Link>
    </div>
  )
}

const SECTION: Record<string, MessageKey> = {
  '': 'nav.home',
  members: 'nav.members',
  events: 'nav.events',
  campionato: 'nav.championship',
  stats: 'nav.stats',
  attendance: 'nav.attendance',
  profile: 'nav.profile',
  settings: 'settings.title',
  announcements: 'ann.title',
  documents: 'docs.title',
  drills: 'drills.title',
  attendance_missing: 'att.tabMissing',
}

// Where the person is: the club, the section, and the page when it names itself.
function Crumbs() {
  const { pathname } = useLocation()
  const club = useClub()
  const rawLeaf = useCrumbLeaf()
  const first = pathname.split('/')[1] ?? ''
  const key = SECTION[first]
  // A page that has the same name as its section is not named twice.
  const leaf = key && rawLeaf === t(key) ? '' : rawLeaf
  return (
    <nav className="crumbs" aria-label={t('crumb.label')}>
      <ol>
        <li><Link to="/">{club.name || t('app.name')}</Link></li>
        {key && <li>{leaf ? <Link to={first ? `/${first}` : '/'}>{t(key)}</Link> : <span aria-current="page">{t(key)}</span>}</li>}
        {key && leaf && <li><span aria-current="page">{leaf}</span></li>}
      </ol>
    </nav>
  )
}

// Signed in people with a profile get the app. Everyone else is sent to log in.
function Protected() {
  const { loading, session, profile, isStaff, isBoard } = useSession()
  const club = useClub()
  const mine = useAvatarUrls([profile?.avatar_path])
  const { pathname } = useLocation()
  const note = useNotifications()
  const { groups } = useGroupFilter()
  if (loading) return <PageSkeleton />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) {
    const pending = getPendingInvite()
    return <Navigate to={pending ? `/join/${pending}` : '/login'} replace />
  }
  const photo = profile.avatar_path ? mine.get(profile.avatar_path) : null
  const fullName = personName(profile)
  const main = (
    <>
      <NavLink to="/" end><TabIcon name="home" />{t('nav.home')}</NavLink>
      <NavLink to="/events"><TabIcon name="events" />{t('nav.events')}</NavLink>
      <NavLink to="/members"><TabIcon name="members" />{t('nav.members')}</NavLink>
      <NavLink to="/campionato" className={({ isActive }) => (isActive || pathname === '/stats' ? 'active' : undefined)}><TabIcon name="stats" />{t('nav.championship')}</NavLink>
      {isStaff && <NavLink to="/attendance"><TabIcon name="attendance" />{t('nav.attendance')}</NavLink>}
    </>
  )
  // The drill library is in the sidebar on computers; on phones the tab bar keeps five places at most,
  // and the library opens from the plan of a training.
  const drills = isStaff && <NavLink to="/drills"><TabIcon name="drills" />{t('nav.drills')}</NavLink>
  return (
    <div className="shell">
      <a className="skip" href="#main">{t('nav.skip')}</a>
      <aside className="side">
        <Link className="club" to="/"><Crest /><span className="club-name">{club.name || t('app.name')}</span></Link>
        <GroupSwitch className="side-switch" />
        <nav aria-label={t('nav.main')}>{main}{drills}</nav>
        <nav className="side-foot" aria-label={t('nav.account')}>
          {isBoard && <NavLink to="/settings"><TabIcon name="settings" />{t('settings.title')}</NavLink>}
          {isStaff && !isBoard && <NavLink to="/settings/invites"><TabIcon name="invites" />{t('nav.invites')}</NavLink>}
          <NavLink to="/profile"><Avatar first={profile.first_name} last={profile.last_name} url={photo} size="small" />{fullName}</NavLink>
        </nav>
      </aside>
      <div className="body">
        <div className="crumbbar desk-only">
          <Crumbs />
          <span className="crumb-actions">
            <ViewSwitch />
            <Bell note={note} />
          </span>
        </div>
        <header className="top">
          <Link className="club" to="/" aria-label={club.name || t('app.name')}><Crest />{groups.length < 2 && <span className="club-name">{club.name || t('app.name')}</span>}</Link>
          <GroupSwitch className="top-switch" short />
          <span className="top-actions">
          <ViewSwitch compact />
          <Bell note={note} />
          {isStaff && <NavLink className="gear" to={isBoard ? '/settings' : '/settings/invites'} aria-label={t(isBoard ? 'settings.title' : 'nav.invites')}><TabIcon name={isBoard ? 'settings' : 'invites'} /></NavLink>}
          <NavLink className="me" to="/profile" aria-label={t('nav.profileOf', { name: fullName })}><Avatar first={profile.first_name} last={profile.last_name} url={photo} /></NavLink>
          </span>
        </header>
        <div className="banners">
          <UpdateBanner />
          <PendingBanner count={note.pending} />
          <DocumentsBanner />
        </div>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <nav className="tabs" aria-label={t('nav.main')}>
        {main}
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
        <Route path="/" element={<Home />} />
        <Route path="/members" element={<Members />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/new" element={<EventForm />} />
        <Route path="/events/unanswered" element={<Navigate to="/attendance?tab=missing" replace />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/attendance/grid" element={<Navigate to="/attendance?tab=events" replace />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/campionato" element={<Championship />} />
        <Route path="/campionato/partita/:matchId" element={<LeagueMatch />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/events/:id/edit" element={<EventForm />} />
        <Route path="/events/:id/lineup" element={<Lineup />} />
        <Route path="/events/:id/plan" element={<Plan />} />
        <Route path="/drills" element={<Drills />} />
        <Route path="/members/:id" element={<MemberEdit />} />
        <Route path="/members/:id/documents" element={<Documents />} />
        <Route path="/documents" element={<Navigate to="/profile/documents" replace />} />
        <Route path="/profile" element={<ProfileLayout />}>
          <Route path="info" element={<ProfileInfo />} />
          <Route path="documents" element={<Documents />} />
          <Route path="absences" element={<ProfileAbsences />} />
          <Route path="notifications" element={<ProfileNotifications />} />
          <Route path="calendar" element={<ProfileCalendar />} />
          <Route path="app" element={<ProfileApp />} />
          <Route path="*" element={<Navigate to="/profile" replace />} />
        </Route>
        <Route path="/settings" element={<Settings />}>
          <Route path="club" element={<ClubSettings />} />
          <Route path="groups" element={<GroupSettings />} />
          <Route path="rinks" element={<RinkSettings />} />
          <Route path="ice" element={<IceHours />} />
          <Route path="invites" element={<Invites />} />
        </Route>
        <Route path="/invites" element={<Navigate to="/settings/invites" replace />} />
        <Route path="/club" element={<Navigate to="/settings/club" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
