import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { t } from '../i18n'
import { useSession } from '../lib/session'
import AttendanceGrid from './AttendanceGrid'
import AttendanceSummary from './AttendanceSummary'

// The attendance of the club in one page: the summary per player, and the grid per event.
export default function Attendance() {
  const { isStaff } = useSession()
  const [params] = useSearchParams()
  if (!isStaff) return <Navigate to="/events" replace />
  const tab = params.get('tab') === 'events' ? 'events' : 'summary'
  return (
    <div className="page wide attendance-page">
      <h1>{t('summary.title')}</h1>
      <nav className="ev-tabs" aria-label={t('summary.title')}>
        <Link to={{ search: '' }} replace aria-current={tab === 'summary' ? 'page' : undefined}>{t('att.tabSummary')}</Link>
        <Link to={{ search: '?tab=events' }} replace aria-current={tab === 'events' ? 'page' : undefined}>{t('att.tabEvents')}</Link>
      </nav>
      {tab === 'summary' ? <AttendanceSummary /> : <AttendanceGrid embedded />}
    </div>
  )
}
