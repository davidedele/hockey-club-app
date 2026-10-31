import { useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n'

// A white card around a table that is wider than its space. When the table does not fit, the right
// edge shows a shadow and a line under the card says to scroll sideways, so no column is hidden
// without a sign. The card can be reached with the keyboard when it scrolls.
export default function TableScroll(props: { children: ReactNode; variant?: 'scroll' | 'table-wrap'; className?: string }) {
  const { children, variant = 'scroll', className } = props
  const ref = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOver(el.scrollWidth > el.clientWidth + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={className}>
      <div ref={ref} className={`${variant}${over ? ' over' : ''}`} {...(over ? { tabIndex: 0, role: 'region', 'aria-label': t('summary.scrollHint') } : {})}>
        {children}
      </div>
      {over && <p className="hint scroll-hint">{t('summary.scrollHint')}</p>}
    </div>
  )
}
