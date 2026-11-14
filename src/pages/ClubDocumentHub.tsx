import LoadError from '../components/LoadError'
import { PageSkeleton } from '../components/Skeleton'
import { useClub } from '../lib/club'
import PageHeader from '../components/PageHeader'
import RequirementManager from '../components/RequirementManager'
import Fold, { useFolds } from '../components/Fold'
import { t } from '../i18n'
import { useSession } from '../lib/session'
import ClubDocuments from './ClubDocuments'

export default function ClubDocumentHub() {
  const club = useClub()
  const folds = useFolds()
  const { isBoard } = useSession()
  if (isBoard && !club.ready) return club.loadError
    ? <LoadError title={t('settings.documents')} message={club.loadError} back={{to:'/settings',label:t('settings.title')}} onRetry={() => void club.reload()} />
    : <PageSkeleton />
  return (
    <div className="section">
      <PageHeader title={t('settings.documents')} back={{to:'/settings',label:t('settings.title')}} />
      <RequirementManager />
      <Fold id="library" title={t('requests.library')} summary={t('requests.libraryHint')} open={folds.open === 'library'} onToggle={() => folds.toggle('library')}>
        <ClubDocuments manage />
      </Fold>
    </div>
  )
}
