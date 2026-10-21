import { useClub } from '../lib/club'

// The club logo, or a stick and puck until staff add one.
export default function Crest() {
  const { logoUrl } = useClub()
  return (
    <span className="crest" aria-hidden="true">
      {logoUrl ? (
        <img src={logoUrl} alt="" />
      ) : (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3 13 20H23" />
          <ellipse cx="21" cy="12.5" rx="4" ry="1.8" />
        </svg>
      )}
    </span>
  )
}
