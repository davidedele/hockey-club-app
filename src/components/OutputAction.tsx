import { useEffect, useId, useRef, useState } from 'react'
import { t } from '../i18n'

// A print or export button that asks first. The window says what is about to happen, so nothing
// is printed or downloaded by a stray click. Escape and Annulla close it without doing anything.
export default function OutputAction(props: {
  kind: 'print' | 'csv'
  label: string
  // How many rows the file will hold. Only used for the CSV window.
  rows?: number
  // The file holds names, emails or phone numbers.
  personal?: boolean
  disabled?: boolean
  onRun: () => void
}) {
  const { kind, label, rows = 0, personal = false, disabled = false, onRun } = props
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const d = ref.current
    if (open && d && !d.open) d.showModal()
  }, [open])

  // The window is gone before the page is printed, so it is not on the paper.
  function run() {
    // Closing it through the window itself gives the focus back to the button that opened it.
    ref.current?.close()
    window.setTimeout(onRun, 150)
  }

  return (
    <>
      <button type="button" className="chip" disabled={disabled} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <dialog ref={ref} className="output-dialog" aria-labelledby={id} onClose={() => setOpen(false)}>
          <h2 id={id}>{t(kind === 'print' ? 'out.printTitle' : 'out.csvTitle')}</h2>
          <p>{kind === 'print' ? t('out.printBody') : t('out.csvBody', { n: String(rows) })}</p>
          {personal && <p className="hint">{t('out.personal')}</p>}
          <div className="actions">
            <button type="button" onClick={run}>{t(kind === 'print' ? 'out.printGo' : 'out.csvGo')}</button>
            <button type="button" className="secondary" onClick={() => ref.current?.close()}>{t('common.cancel')}</button>
          </div>
        </dialog>
      )}
    </>
  )
}
