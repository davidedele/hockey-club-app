import { t } from '../i18n'
import type { Dir } from '../lib/table'

// A column heading that sorts the table when it is pressed.
export default function SortHeader({ label, active, dir, onSort, className }: {
  label: string
  active: boolean
  dir: Dir
  onSort: () => void
  className?: string
}) {
  return (
    <th scope="col" className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className="sort" onClick={onSort} aria-label={`${t('table.sortBy')} ${label}`}>
        {label}
        <span aria-hidden="true">{active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  )
}
