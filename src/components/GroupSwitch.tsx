import { t } from '../i18n'
import { useGroupFilter } from '../lib/groupfilter'

// Picks the group the whole app looks at. It stays chosen until it is changed.
// On computers the groups are buttons in a row, on phones a compact list to save room in the header.
export default function GroupSwitch({ className, short = false, chips = false }: { className?: string; short?: boolean; chips?: boolean }) {
  const { groups, groupId, setGroupId } = useGroupFilter()
  if (groups.length < 2) return null
  if (chips) {
    return (
      <div role="group" aria-label={t('group.switch')} className={className ? `group-chips ${className}` : 'group-chips'}>
        <button type="button" aria-pressed={groupId === null} onClick={() => setGroupId(null)}>{t('group.allShort')}</button>
        {groups.map((g) => (
          <button type="button" key={g.id} aria-pressed={groupId === g.id} onClick={() => setGroupId(g.id)}>{g.name}</button>
        ))}
      </div>
    )
  }
  return (
    <div className={className ? `group-switch ${className}` : 'group-switch'}>
      <select aria-label={t('group.switch')} value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">{t(short ? 'group.allShort' : 'group.all')}</option>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    </div>
  )
}
