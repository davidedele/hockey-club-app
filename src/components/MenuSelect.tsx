import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface MenuOption<T> {
  value: T
  label: string
  mark?: ReactNode
}

// A button that opens a short list to choose from, such as the group or the view. Arrow keys move
// through the list, Enter or Space choose, Escape closes it and returns to the button.
export default function MenuSelect<T extends string | number | null>(props: {
  label: string
  value: T
  options: MenuOption<T>[]
  onChange: (value: T) => void
  className?: string
  // Shown on the button instead of the label and value, for a compact header.
  icon?: ReactNode
  align?: 'start' | 'end'
}) {
  const { label, value, options, onChange, className, icon, align = 'start' } = props
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const at = Math.max(0, options.findIndex((o) => o.value === value))
    items.current[at]?.focus()
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open, options, value])

  function close(focus = true) {
    setOpen(false)
    if (focus) button.current?.focus()
  }

  function onKey(e: KeyboardEvent) {
    const list = items.current.filter(Boolean) as HTMLButtonElement[]
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    const go = (n: number) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus() }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(list.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Tab') close(false)
  }

  return (
    <div className={`menu-select${className ? ` ${className}` : ''}`} ref={box}>
      <button
        ref={button}
        type="button"
        className={icon ? 'ms-button icon-only' : 'ms-button'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={icon ? `${label}: ${current?.label ?? ''}` : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) } }}
      >
        {icon ?? (
          <>
            <span className="ms-text">
              <span className="ms-label">{label}</span>
              <span className="ms-value">{current?.mark}{current?.label}</span>
            </span>
            <svg className="ms-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </>
        )}
      </button>
      {open && (
        <ul id={id} role="menu" aria-label={label} className={`ms-list ${align}`} onKeyDown={onKey}>
          {options.map((o, i) => (
            <li role="none" key={String(o.value)}>
              <button
                ref={(el) => { items.current[i] = el }}
                type="button"
                role="menuitemradio"
                aria-checked={o.value === value}
                tabIndex={-1}
                onClick={() => { onChange(o.value); close() }}
              >
                {o.mark}
                <span>{o.label}</span>
                {o.value === value && <svg className="ms-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
