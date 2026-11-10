import LoadError from '../components/LoadError'
import { PageSkeleton } from '../components/Skeleton'
import { useClub } from '../lib/club'
import PageHeader from '../components/PageHeader'
import ClubRequests from '../components/ClubRequests'
import Fold, { useFolds } from '../components/Fold'
import { t } from '../i18n'
import { useSession } from '../lib/session'
import DocumentSettings from './DocumentSettings'
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
      <ClubRequests manage />
      <Fold id="library" title={t('requests.library')} summary={t('requests.libraryHint')} open={folds.open === 'library'} onToggle={() => folds.toggle('library')}>
        <ClubDocuments manage />
      </Fold>
      {isBoard && <Fold id="existing" title={t('requests.existing')} summary={t('requests.existingHint')} open={folds.open === 'existing'} onToggle={() => folds.toggle('existing')}>
        <DocumentSettings />
      </Fold>}
    </div>
  )
}
