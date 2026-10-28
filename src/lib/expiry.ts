// Finds the expiry date in the text read from a photo of a medical certificate.
// Pure text work, no network and no engine: the reading itself is in ocr.ts.
//
// An Italian certificate carries several dates (when it was issued, the date of birth, the expiry),
// so the date is looked for next to the words that announce it. Failing that, the furthest date
// ahead is taken, because that is the one a certificate is about.

const KEYWORDS = [
  'scadenza',
  'scade il',
  'valido fino',
  'valida fino',
  'validita fino',
  'valido sino',
  'fino al',
  'sino al',
  'validita',
]

// 12/03/2027, 12.3.27, 12-03-2027
const DAY_FIRST = /(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})/g
// 2027-03-12
const YEAR_FIRST = /(\d{4})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{1,2})/g

const YEARS_BACK = 2
const YEARS_ON = 5
const NEAR = 80

// Letters without accents and single spaces, so the words and the dates can be found by position.
export function flatten(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
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
  return found.sort((a, b) => a.at - b.at)
}

// A certificate lasts a year, so a date many years either way is something else on the page.
function plausible(value: string, today: string): boolean {
  const year = Number(today.slice(0, 4))
  return value >= `${year - YEARS_BACK}${today.slice(4)}` && value <= `${year + YEARS_ON}${today.slice(4)}`
}

export function findExpiry(text: string, today: string): string | null {
  const flat = flatten(text)
  const all = dates(flat).filter((d) => plausible(d.value, today))
  if (all.length === 0) return null
  for (const word of KEYWORDS) {
    let from = 0
    for (;;) {
      const at = flat.indexOf(word, from)
      if (at < 0) break
      const near = all.find((d) => d.at >= at && d.at <= at + NEAR)
      if (near) return near.value
      from = at + word.length
    }
  }
  const ahead = all.filter((d) => d.value >= today)
  if (ahead.length === 0) return null
  return ahead.reduce((latest, d) => (d.value > latest.value ? d : latest)).value
}
