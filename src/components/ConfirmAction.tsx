import { useEffect, useId, useRef, useState } from 'react'
import { t } from '../i18n'

// A link style button for an action that removes something. It first opens a window that names
// what is removed, with the action in red and Annulla focused, so Enter or Escape never removes.
export default function ConfirmAction(props: {
  label: string
  title: string
  body: string
  confirm: string
  disabled?: boolean
  onConfirm: () => void
}) {
  const { label, title, body, confirm, disabled = false, onConfirm } = props
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    const d = ref.current
    if (open && d && !d.open) {
      d.showModal()
      // The window would focus its first button, the red one; Annulla is the safe default.
      cancel.current?.focus()
    }
  }, [open])

  return (
    <>
      <button type="button" className="link" disabled={disabled} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <dialog ref={ref} className="output-dialog" aria-labelledby={id} onClose={() => setOpen(false)}>
          <h2 id={id}>{title}</h2>
          <p>{body}</p>
          <div className="actions">
            <button type="button" className="danger" onClick={() => { ref.current?.close(); onConfirm() }}>{confirm}</button>
            <button ref={cancel} type="button" className="secondary" onClick={() => ref.current?.close()}>{t('common.cancel')}</button>
          </div>
        </dialog>
      )}
    </>
  )
}
