import { t, type MessageKey } from '../i18n'
import type { EventScope } from '../lib/types'
export default function EventScopeSelect({ value, onChange, disabled = false }: { value: EventScope; onChange: (scope: EventScope) => void; disabled?: boolean }) {
  return <label>{t('series.scope')}<select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as EventScope)}>
    {(['one', 'following', 'future'] as const).map((scope) => <option key={scope} value={scope}>{t(`series.${scope}` as MessageKey)}</option>)}
  </select><span className="hint">{t('series.hint')}</span></label>
}
