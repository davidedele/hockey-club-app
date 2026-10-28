// Phone numbers as Italians write them. A mobile number is shown as "333 123 4567",
// with "+39 " in front when the number was saved with the country code.
// Any other number (landlines, foreign numbers) is kept as typed, with extra spaces removed.

const separators = /[\s.\-/()]/g

export function formatPhone(raw: string | null | undefined): string {
  const text = (raw ?? '').trim()
  const compact = text.replace(separators, '')
  const mobile = compact.match(/^(\+39|0039)?(3\d{9})$/)
  if (!mobile) return text.replace(/\s+/g, ' ')
  const n = mobile[2]
  return `${mobile[1] ? '+39 ' : ''}${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
}

// The number for a tel: link, without spaces or other separators, and 0039 written as +39.
export const phoneLink = (raw: string) => `tel:${raw.replace(separators, '').replace(/^00/, '+')}`
