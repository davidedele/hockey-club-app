import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { t } from '../i18n'
import { useSession } from '../lib/session'
import AttendanceGrid from './AttendanceGrid'
import AttendanceSummary from './AttendanceSummary'
import Unanswered from './Unanswered'
import PageHeader from '../components/PageHeader'

// The attendance of the club in one page: the summary per player, the grid per event, and who has
// not answered yet for the coming days.
export default function Attendance() {
  const { isStaff } = useSession()
  const [params] = useSearchParams()
  if (!isStaff) return <Navigate to="/events" replace />
  const raw = params.get('tab')
  const tab = raw === 'events' || raw === 'missing' ? raw : 'summary'
  return (
    <div className="page wide attendance-page">
      <PageHeader title={t('summary.title')} />
      <nav className="ev-tabs" aria-label={t('summary.title')}>
        <Link to={{ search: '' }} replace aria-current={tab === 'summary' ? 'page' : undefined}>{t('att.tabSummary')}</Link>
        <Link to={{ search: '?tab=events' }} replace aria-current={tab === 'events' ? 'page' : undefined}>{t('att.tabEvents')}</Link>
        <Link to={{ search: '?tab=missing' }} replace aria-current={tab === 'missing' ? 'page' : undefined}>{t('att.tabMissing')}</Link>
      </nav>
      {tab === 'summary' && <AttendanceSummary />}
      {tab === 'events' && <AttendanceGrid embedded />}
      {tab === 'missing' && <Unanswered />}
    </div>
  )
}
