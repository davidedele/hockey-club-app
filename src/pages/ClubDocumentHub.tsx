import ClubRequests from '../components/ClubRequests'
import Fold, { useFolds } from '../components/Fold'
import { t } from '../i18n'
import { useSession } from '../lib/session'
import DocumentSettings from './DocumentSettings'
import ClubDocuments from './ClubDocuments'
export default function ClubDocumentHub(){
 const folds=useFolds()
 const {isBoard}=useSession()
 return <div className="section"><ClubRequests manage />{isBoard&&<><Fold id="library" summary={t('requests.libraryHint')} open={folds.open==='library'} onToggle={()=>folds.toggle('library')} title={t('requests.library')}><ClubDocuments manage /></Fold><Fold id="existing" summary={t('requests.existingHint')} open={folds.open==='existing'} onToggle={()=>folds.toggle('existing')} title={t('requests.existing')}><DocumentSettings /></Fold></>}</div>
}
