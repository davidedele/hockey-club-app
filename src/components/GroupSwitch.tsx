import { t } from '../i18n'
import { useGroupFilter } from '../lib/groupfilter'
import MenuSelect from './MenuSelect'

// Picks the group the whole app looks at. It stays chosen until it is changed.
// A button shows the group in use and opens the list; on phones it is shortened to fit the header.
export default function GroupSwitch({ className, short = false }: { className?: string; short?: boolean }) {
  const { groups, groupId, setGroupId } = useGroupFilter()
  if (groups.length < 2) return null
  const options = [
    { value: null as number | null, label: t(short ? 'group.allShort' : 'group.all') },
    ...groups.map((g) => ({ value: g.id as number | null, label: g.name })),
  ]
  return <MenuSelect className={className} label={t('group.switch')} value={groupId} options={options} onChange={setGroupId} />
}
