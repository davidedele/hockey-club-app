import { useEffect, useId, useRef, useState } from 'react'
import { t } from '../i18n'

// The window that asks before something is removed or told to other people. It names what it is
// about, shows each action as a button (red for the ones that cannot be undone) and puts the focus
// on Annulla, so Enter never does the action; Escape closes it and does nothing.
export interface ConfirmChoice {
  label: string
  onChoose: () => void
}

export function ConfirmDialog(props: {
  open: boolean
  title: string
  body: string
  choices: ConfirmChoice[]
  busy?: boolean
  onClose: () => void
}) {
  const { open, title, body, choices, busy = false, onClose } = props
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

  if (!open) return null
  return (
    <dialog ref={ref} className="output-dialog" aria-labelledby={id} onClose={onClose}>
      <h2 id={id}>{title}</h2>
      <p>{body}</p>
      <div className="actions">
        {choices.map((c) => (
          <button key={c.label} type="button" className="danger" disabled={busy} onClick={() => { ref.current?.close(); c.onChoose() }}>{c.label}</button>
        ))}
        <button ref={cancel} type="button" className="secondary" onClick={() => ref.current?.close()}>{t('common.cancel')}</button>
      </div>
    </dialog>
  )
}

// A link style button for an action that removes something. It opens the window above.
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
  return (
    <>
      <button type="button" className="link" disabled={disabled} onClick={() => setOpen(true)}>{label}</button>
      <ConfirmDialog open={open} title={title} body={body} choices={[{ label: confirm, onChoose: onConfirm }]} onClose={() => setOpen(false)} />
    </>
  )
}
