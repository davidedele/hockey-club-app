import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { clock, emptyShifts, putOn, shiftMs, stop, totalMs, type Shifts } from '../lib/shifts'

const LINES = [
  ...[1, 2, 3, 4].map((n) => ({ key: `f${n}`, label: t('lineup.line', { n: String(n) }) })),
  ...[1, 2, 3].map((n) => ({ key: `d${n}`, label: t('lineup.pair', { n: String(n) }) })),
]
const LIMITS = [30, 45, 60, 90]

// The substitution timer (V10): the coach taps the line that goes on; the app shows how long each line has been
// on the ice and in total, and the phone vibrates after the chosen time. It runs on the phone only.
export default function ShiftTimer() {
  const [shifts, setShifts] = useState<Shifts>(emptyShifts)
  const [now, setNow] = useState(Date.now())
  const [limit, setLimit] = useState(60)
  const warned = useRef<string | null>(null)

  useEffect(() => {
    if (shifts.onIce === null) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [shifts.onIce])

  const onMs = shifts.onIce ? shiftMs(shifts, shifts.onIce, now) : 0
  useEffect(() => {
    const mark = shifts.onIce ? `${shifts.onIce}-${shifts.since}` : null
    if (mark && onMs >= limit * 1000 && warned.current !== mark) {
      warned.current = mark
      navigator.vibrate?.([300, 150, 300])
    }
  }, [onMs, limit, shifts.onIce, shifts.since])

  function tap(key: string) {
    const at = Date.now()
    setNow(at)
    setShifts((s) => putOn(s, key, at))
  }

  return (
    <section className="card shift-timer" aria-labelledby="shift-title">
      <h2 id="shift-title">{t('shift.title')}</h2>
      <p className="hint">{t('shift.hint')}</p>
      <label htmlFor="shift-limit">{t('shift.limit')}</label>
      <select id="shift-limit" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
        {LIMITS.map((s) => <option key={s} value={s}>{t('shift.seconds', { n: String(s) })}</option>)}
      </select>
      <ul className="shift-lines">
        {LINES.map((l) => {
          const on = shifts.onIce === l.key
          return (
            <li key={l.key}>
              <button type="button" className={on ? 'shift on' : 'shift'} aria-pressed={on} onClick={() => tap(l.key)}>
                <span>{l.label}</span>
                <span className="shift-times">
                  <b className={on && onMs >= limit * 1000 ? 'over' : undefined}>{on ? clock(onMs) : '0:00'}</b>
                  <small>{t('shift.total', { time: clock(totalMs(shifts, l.key, now)) })}</small>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="actions">
        <button type="button" className="secondary" disabled={shifts.onIce === null} onClick={() => setShifts((s) => stop(s, Date.now()))}>{t('shift.stop')}</button>
        <button type="button" className="link" onClick={() => setShifts(emptyShifts())}>{t('shift.reset')}</button>
      </div>
    </section>
  )
}
