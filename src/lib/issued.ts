// Finds the date of issue in the text read from a photo of a medical certificate (decisions 94, 105).
// Pure text work, no network and no engine: the reading itself is in ocr.ts.
//
// The club's certificates state only "validity 1 year" and no end date, so the date to find is the day
// of the visit, which is the date of issue. An Italian certificate carries several dates (the date of
// birth, the visit, sometimes an expiry, a stamp), so the date is looked for next to the words that
// announce it ("data visita", "rilasciato il", "emesso il"), and only dates that are plausible for a
// certificate are considered: not in the future, not older than three years. A date that follows
// "scadenza" or "valido fino" is an end date and is left out. When nothing announces a date and the
// page holds more than one plausible date, nothing is guessed and the member types it.

const KEYWORDS = [
  'data della visita',
  'data di visita',
  'data visita',
  'visita del',
  'visita effettuata il',
  'visita medica del',
  'data di rilascio',
  'data rilascio',
  'data di emissione',
  'rilasciato il',
  'rilasciata il',
  'rilasciato in data',
  'emesso il',
  'emessa il',
  'emesso in data',
  'in data',
  'rilascio',
  'emissione',
  'visita',
  'data',
]
// Words that announce an end date, which is not what is looked for.
const END_WORDS = ['scadenza', 'scade il', 'scade', 'valido fino', 'valida fino', 'validita fino', 'valido sino', 'fino al', 'sino al', 'entro il']

// 12/03/2027, 12.3.27, 12-03-2027
const DAY_FIRST = /(?<!\d)(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})/g
// 12 marzo 2027, 12 mar 2027
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const MONTH_NAMED = new RegExp(`(\\d{1,2})\\s*(?:°|o)?\\s*(${MONTHS.join('|')}|${MONTHS.map((m) => m.slice(0, 3)).join('|')})\\.?\\s*(\\d{4})`, 'g')
// 2027-03-12
const YEAR_FIRST = /(\d{4})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{1,2})/g

const YEARS_BACK = 3
const NEAR = 60
const END_NEAR = 40

// Letters without accents and single spaces, so the words and the dates can be found by position.
export function flatten(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(?<![a-z0-9])[0-9oli]{1,2}\s*[/.\-]\s*[0-9oli]{1,2}\s*[/.\-]\s*[0-9oli]{2,4}(?![a-z0-9])/g, fixDigits)
}

// The reading often takes a 0 for an O and a 1 for an l or an i. Inside something shaped like a date
// that is certainly a digit.
function fixDigits(token: string): string {
  return token.replace(/o/g, '0').replace(/[li]/g, '1')
}

function iso(year: number, month: number, day: number): string | null {
  const full = year < 100 ? 2000 + year : year
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(full, month - 1, day))
  if (date.getUTCFullYear() !== full || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${String(full).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Every date in the text, with where it sits, in the order they appear.
export function dates(flat: string): { at: number; value: string }[] {
  const found: { at: number; value: string }[] = []
  for (const m of flat.matchAll(YEAR_FIRST)) {
    const value = iso(Number(m[1]), Number(m[2]), Number(m[3]))
    if (value && m.index !== undefined) found.push({ at: m.index, value })
  }
  for (const m of flat.matchAll(DAY_FIRST)) {
    const value = iso(Number(m[3]), Number(m[2]), Number(m[1]))
    if (value && m.index !== undefined && !found.some((f) => f.at === m.index)) found.push({ at: m.index, value })
  }
  for (const m of flat.matchAll(MONTH_NAMED)) {
    const name = m[2]
    const month = MONTHS.findIndex((x) => x === name || x.slice(0, 3) === name) + 1
    const value = iso(Number(m[3]), month, Number(m[1]))
    if (value && m.index !== undefined && !found.some((f) => f.at === m.index)) found.push({ at: m.index, value })
  }
  return found.sort((a, b) => a.at - b.at)
}

// A date of issue is a day in the past (a day ahead is allowed for a clock difference) and not much older
// than the three years the database accepts.
function plausible(value: string, today: string): boolean {
  const year = Number(today.slice(0, 4))
  const next = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
  return value >= `${year - YEARS_BACK}${today.slice(4)}` && value <= next
}

export function findIssueDate(text: string, today: string): string | null {
  const flat = flatten(text)
  const all = dates(flat).filter((d) => plausible(d.value, today))
  // A date that comes right after a word for an end date is the end date.
  const ends = END_WORDS.flatMap((word) => {
    const out: number[] = []
    for (let at = flat.indexOf(word); at >= 0; at = flat.indexOf(word, at + word.length)) out.push(at)
    return out
  })
  const candidates = all.filter((d) => !ends.some((at) => d.at >= at && d.at - at <= END_NEAR))
  if (candidates.length === 0) return null
  for (const word of KEYWORDS) {
    for (let at = flat.indexOf(word); at >= 0; at = flat.indexOf(word, at + word.length)) {
      // A whole word only: "data" inside "validata" or "update" is not a keyword.
      if (/[a-z]/.test(flat[at - 1] ?? ' ') || /[a-z]/.test(flat[at + word.length] ?? ' ')) continue
      const near = candidates.find((d) => d.at >= at && d.at <= at + NEAR)
      if (near) return near.value
    }
  }
  const distinct = [...new Set(candidates.map((d) => d.value))]
  return distinct.length === 1 ? distinct[0] : null
}
