import { t } from '../i18n'
import { pageCount } from '../lib/table'

export const PAGE_SIZES = [25, 50, 100]

// Rows per page and the page buttons under a table.
export default function TablePager({ total, page, size, onPage, onSize }: {
  total: number
  page: number
  size: number
  onPage: (page: number) => void
  onSize: (size: number) => void
}) {
  const pages = pageCount(total, size)
  const from = total === 0 ? 0 : (page - 1) * size + 1
  const to = Math.min(total, page * size)
  // At most seven buttons: the first, the last, and the pages around the current one.
  const shown = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1)
  return (
    <div className="pager">
      <div className="pager-size" role="group" aria-label={t('table.size')}>
        <span>{t('table.size')}</span>
        {PAGE_SIZES.map((n) => (
          <button key={n} className={n === size ? 'chip on' : 'chip'} aria-pressed={n === size} onClick={() => onSize(n)}>{n}</button>
        ))}
      </div>
      <span className="pager-range" role="status">{t('table.range', { from: String(from), to: String(to), total: String(total) })}</span>
      <nav className="pager-pages" aria-label={t('table.pages')}>
        <button className="chip" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('table.prev')}>‹</button>
        {shown.map((n, i) => (
          <span key={n} className="pager-item">
            {i > 0 && n - shown[i - 1] > 1 && <span aria-hidden="true">…</span>}
            <button className={n === page ? 'chip on' : 'chip'} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>
          </span>
        ))}
        <button className="chip" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('table.next')}>›</button>
      </nav>
    </div>
  )
}
