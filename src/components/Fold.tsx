import { useId, useState, type ReactNode } from 'react'

// One open at a time, all closed at first. The state lives in the page, so it survives a save that
// reloads the data (the rows stay mounted, only hidden).
export function useFolds(): { open: string | null; toggle: (id: string) => void } {
  const [open, setOpen] = useState<string | null>(null)
  return { open, toggle: (id) => setOpen((now) => (now === id ? null : id)) }
}

// A group of settings as a folded row: a real button with aria-expanded, the title and a one line
// summary of what is set. The body is hidden, not removed, so forms keep what was typed.
export default function Fold(props: { id: string; title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const { id, title, summary, open, onToggle, children } = props
  const base = useId()
  const body = `${base}-body`
  return (
    <section className={open ? 'fold open' : 'fold'} data-fold={id}>
      <h2>
        <button type="button" className="fold-head" id={`${base}-head`} aria-expanded={open} aria-controls={body} onClick={onToggle}>
          <span className="fold-text">
            <span className="fold-title">{title}</span>
            <span className="fold-summary">{summary}</span>
          </span>
          <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </h2>
      <div id={body} role="region" aria-labelledby={`${base}-head`} hidden={!open} className="fold-body">
        {children}
      </div>
    </section>
  )
}
