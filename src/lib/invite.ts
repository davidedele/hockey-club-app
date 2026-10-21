const KEY = 'pending-invite'

// The invite link is remembered on this device while the person confirms their email,
// so they end up in the club even if the confirmation link opens a different page.
export function savePendingInvite(token: string) {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // Private mode: the person can still open the invite link again.
  }
}

export function getPendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
