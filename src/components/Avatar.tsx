// A person's picture, or their initials when they have not added one.
export default function Avatar({ first, last, url, size = '' }: { first: string; last: string; url?: string | null; size?: '' | 'small' | 'medium' | 'large' }) {
  const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
  return (
    <span className={size ? `avatar ${size}` : 'avatar'} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initials}
    </span>
  )
}
