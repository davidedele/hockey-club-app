import { t } from '../i18n'
import { useGroupFilter } from '../lib/groupfilter'
import MenuSelect from './MenuSelect'

// Picks the group the whole app looks at. It stays chosen until it is changed.
// A button shows the group in use and opens the list; on phones it is shortened to fit the header.
export default function GroupSwitch({ className, short = false }: { className?: string; short?: boolean }) {
  const { groups, groupId, setGroupId, scope } = useGroupFilter()
  if (groups.length < 2) return null
  const options = [
    { value: null as number | null, label: t(scope ? (short ? 'group.mineShort' : 'group.mine') : short ? 'group.allShort' : 'group.all') },
    ...groups.map((g) => ({ value: g.id as number | null, label: g.name })),
  ]
  // In the phone top bar the selector is a round 44 pixel button like the others: the group code in a
  // circle, or an icon for all the groups. The list that opens is the same.
  const chosen = groups.find((g) => g.id === groupId)
  const badge = short ? (
    chosen ? (
      <span className="grp-badge" aria-hidden="true">{chosen.code}</span>
    ) : (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 5.2a3 3 0 0 1 0 5.6M18 14.5a6 6 0 0 1 3 5.5" /></svg>
    )
  ) : undefined
  return <MenuSelect className={className} label={t('group.switch')} value={groupId} options={options} onChange={setGroupId} icon={badge} />
}
