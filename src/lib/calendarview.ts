export type CalendarView = 'week' | 'month' | 'list'
const KEY = 'calendar-view'
export function savedCalendarView(): CalendarView {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'month' || value === 'list' ? value : 'week'
  } catch { return 'week' }
}
export function rememberCalendarView(view: CalendarView) {
  try { localStorage.setItem(KEY, view) } catch { /* The choice still works until the page closes. */ }
}
