// People's names are shown with capital initials: "pansini mattia" becomes "Pansini Mattia" and
// "DE LUCA" becomes "De Luca". A name typed with its own mix of capitals ("McKenzie") keeps them,
// only the first letter of each word is raised. The database applies the same rule when saving.
export function tidyName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ')
  const flat = s === s.toLowerCase() || s === s.toUpperCase()
  return s.replace(/\p{L}+/gu, (w) => w.charAt(0).toUpperCase() + (flat ? w.slice(1).toLowerCase() : w.slice(1)))
}

// A name may not contain digits. The database refuses them too.
export const nameHasDigits = (s: string) => /\d/.test(s)

// A person's name is written surname first everywhere, as in every list and table of the app
// ("Rossi Marco"), so the same person never reads two ways on one screen.
export const personName = (p: { first_name: string; last_name: string }) => `${p.last_name} ${p.first_name}`
