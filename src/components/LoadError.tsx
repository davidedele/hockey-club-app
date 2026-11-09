import { t } from '../i18n'
import PageHeader from './PageHeader'

export default function LoadError({ title, message, onRetry, back }: {title: string; message: string; onRetry: () => void; back?: {to: string; label: string}}) {
  return <div className="page wide">
    <PageHeader title={title} back={back} />
    <p className="error" role="alert">{message}</p>
    <button type="button" className="secondary" onClick={onRetry}>{t('common.retry')}</button>
  </div>
}
