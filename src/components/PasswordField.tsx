import { useId, useState, type InputHTMLAttributes } from 'react'
import { t } from '../i18n'
export default function PasswordField({ hint, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { hint?: string }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return <div className="password-field">
    <label htmlFor={id}>{t('common.password')}</label>
    <div className="password-control">
      <input {...props} id={id} type={visible ? 'text' : 'password'} data-password-field="true" aria-describedby={hint ? `${id}-hint` : undefined} />
      <button type="button" className="password-eye" aria-label={t(visible ? 'password.hide' : 'password.show')} aria-controls={id} aria-pressed={visible} onClick={() => setVisible(!visible)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>{visible && <path d="M3 3l18 18"/>}</svg>
      </button>
    </div>
    {hint && <span id={`${id}-hint`} className="hint">{hint}</span>}
  </div>
}
