import { t } from '../i18n'
import { useGroupFilter } from '../lib/groupfilter'

// Picks the group the whole app looks at. It stays chosen until it is changed.
export default function GroupSwitch({ className, short = false }: { className?: string; short?: boolean }) {
  const { groups, groupId, setGroupId } = useGroupFilter()
  if (groups.length < 2) return null
  return (
    <label className={className ? `group-switch ${className}` : 'group-switch'}>
      <span className="sr-only">{t('group.switch')}</span>
      <select value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">{t(short ? 'group.allShort' : 'group.all')}</option>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    </label>
  )
}
