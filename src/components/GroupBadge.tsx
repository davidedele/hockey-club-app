import { logoUrl } from '../lib/club'
import type { Group } from '../lib/types'

// A group's picture, or its short code in the group's colours (the club colours when it has none).
export default function GroupBadge({ group, size = '' }: { group: Group; size?: '' | 'small' }) {
  const url = logoUrl(group.logo_path)
  return (
    <span className={size ? `group-badge ${size}` : 'group-badge'} aria-hidden="true" style={{ background: group.game_dark ?? undefined, color: group.game_light ?? undefined }}>
      {url ? <img src={url} alt="" /> : group.code}
    </span>
  )
}
