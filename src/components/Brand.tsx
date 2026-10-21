import { t } from '../i18n'
import { useClub } from '../lib/club'
import Crest from './Crest'

// The club logo and name, shown on the signed out pages.
export default function Brand() {
  const { name } = useClub()
  return (
    <div className="brand">
      <Crest />
      <span>{name || t('app.name')}</span>
    </div>
  )
}
