import type { FormEvent } from 'react'
import { t, type MessageKey } from '../i18n'

// The browser's own form check is turned off (noValidate), because iPhone Safari blocks a submit
// without saying why. The app checks required fields and length limits itself, writes an Italian
// message under each field with a problem, marks it with aria-invalid and aria-describedby, and
// moves the focus to the first one.

export type FieldFacts = {
  type: string
  tag: string
  required: boolean
  value: string
  files?: number
  checked?: boolean
  minLength: number
  maxLength: number
  typeMismatch: boolean
  rangeUnderflow: boolean
  rangeOverflow: boolean
}

// What is wrong with a field, as a message key and values, or null when it is fine.
export function problemOf(f: FieldFacts): { key: MessageKey; values?: Record<string, string> } | null {
  const empty = f.type === 'file' ? !f.files : f.type === 'checkbox' || f.type === 'radio' ? !f.checked : f.value.trim() === ''
  if (f.required && empty) {
    if (f.type === 'checkbox') return { key: 'check.requiredCheck' }
    if (f.type === 'file') return { key: 'check.requiredFile' }
    if (f.tag === 'select') return { key: 'check.requiredChoice' }
    if (f.type === 'date') return { key: 'check.requiredDate' }
    if (f.type === 'time') return { key: 'check.requiredTime' }
    if (f.type === 'email') return { key: 'check.requiredEmail' }
    if (f.type === 'password') return { key: 'check.requiredPassword' }
    if (f.type === 'number') return { key: 'check.requiredNumber' }
    return { key: 'check.required' }
  }
  if (f.value === '' || f.type === 'file') return null
  if (f.type === 'email' && f.typeMismatch) return { key: 'check.badEmail' }
  if (f.minLength > 0 && f.value.length < f.minLength) {
    return { key: f.type === 'password' ? 'check.passwordShort' : 'check.tooShort', values: { n: String(f.minLength) } }
  }
  if (f.maxLength >= 0 && f.value.length > f.maxLength) return { key: 'check.tooLong', values: { n: String(f.maxLength) } }
  if (f.rangeUnderflow || f.rangeOverflow) return { key: 'check.outOfRange' }
  return null
}

function factsOf(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): FieldFacts {
  const input = el as HTMLInputElement
  return {
    type: el.tagName === 'INPUT' ? input.type : '',
    tag: el.tagName.toLowerCase(),
    required: el.required,
    value: el.value,
    files: input.files?.length,
    checked: input.checked,
    minLength: 'minLength' in el ? (el as HTMLInputElement).minLength : -1,
    maxLength: 'maxLength' in el ? (el as HTMLInputElement).maxLength : -1,
    typeMismatch: el.validity.typeMismatch,
    rangeUnderflow: el.validity.rangeUnderflow,
    rangeOverflow: el.validity.rangeOverflow,
  }
}

let counter = 0
const MARK = 'data-field-error'

function clearOne(el: Element) {
  const id = el.getAttribute('aria-describedby')
  el.removeAttribute('aria-invalid')
  if (id) {
    const own = (el.getAttribute('aria-describedby') ?? '').split(' ').filter((x) => !x.startsWith('fe-'))
    const message = document.getElementById(id.split(' ').find((x) => x.startsWith('fe-')) ?? '')
    message?.remove()
    if (own.length) el.setAttribute('aria-describedby', own.join(' '))
    else el.removeAttribute('aria-describedby')
  }
}

export function clearErrors(form: HTMLFormElement) {
  for (const el of form.querySelectorAll(`[${MARK}]`)) {
    clearOne(el)
    el.removeAttribute(MARK)
  }
}

// Checks every field of the form. Returns true when all are fine; otherwise shows the messages and
// focuses the first field with a problem.
export function checkForm(form: HTMLFormElement): boolean {
  clearErrors(form)
  let first: HTMLElement | null = null
  const seenGroups = new Set<string>()
  for (const el of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
    if (el.disabled || (el as HTMLInputElement).type === 'hidden' || (el as HTMLInputElement).type === 'submit') continue
    if ((el as HTMLInputElement).type === 'radio') {
      if (seenGroups.has(el.name)) continue
      seenGroups.add(el.name)
    }
    const problem = problemOf(factsOf(el))
    if (!problem) continue
    const id = `fe-${++counter}`
    const message = document.createElement('p')
    message.id = id
    message.className = 'field-error'
    message.textContent = t(problem.key, problem.values)
    // After the label that wraps the field, or after the field itself when it has no wrapping label.
    const anchor = el.closest('label') ?? el
    anchor.after(message)
    el.setAttribute('aria-invalid', 'true')
    el.setAttribute('aria-describedby', [el.getAttribute('aria-describedby'), id].filter(Boolean).join(' '))
    el.setAttribute(MARK, '')
    const fix = () => {
      clearOne(el)
      el.removeAttribute(MARK)
      el.removeEventListener('input', fix)
      el.removeEventListener('change', fix)
    }
    el.addEventListener('input', fix)
    el.addEventListener('change', fix)
    first ??= el
  }
  first?.focus()
  return first === null
}

// Props for a form: no browser check, the app's own check first, then the form's own handler.
export function checked(handler: (e: FormEvent<HTMLFormElement>) => void) {
  return {
    noValidate: true,
    onSubmit: (e: FormEvent<HTMLFormElement>) => {
      if (!checkForm(e.currentTarget)) {
        e.preventDefault()
        return
      }
      handler(e)
    },
  }
}
