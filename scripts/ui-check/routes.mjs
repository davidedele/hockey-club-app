export function interfaceRoutes(ids) {
  const { training, game, member, futureGame } = ids
  return [
  ['event-theory', `/events/${ids.theory}`, 'sub'], ['event-new-linked', `/events/new?parent=${training}&position=before`, 'sub'], ['settings-requirement-new', '/settings/documents/new', 'sub'], ['settings-requirement-edit', `/settings/documents/${ids.reqCert}`, 'sub'], ['settings-requirement-rules', `/settings/documents/${ids.reqRules}`, 'sub'], ['profile-requests-player','/profile/documents','player'],
  ['home', '/'], ['events', '/events'], ['members', '/members'], ['championship', '/campionato'], ['championship-assists', '/campionato?stats=assists'], ['championship-penalties', '/campionato?stats=penalties'], ['league-match', '/campionato/partita/501', 'sub'], ['stats', '/stats'], ['stats-players', '/stats?tab=players'], ['stats-predictions', '/stats?tab=predictions'], ['stats-hall', '/stats?tab=hall'], ['stats-fanta', '/stats?tab=fanta'], ['stats-fanta-player', '/stats?tab=fanta', 'player'], ['stats-fanta-nogames', '/stats?tab=fanta', 'nogames'],
  ['attendance', '/attendance'], ['attendance-events', '/attendance?tab=events'],
  ['event-training', `/events/${training}`, 'sub'], ['event-game', `/events/${game}`, 'sub'], ['event-game-last-tab', `/events/${game}?tab=lineup`, 'sub'], ['event-training-last-tab', `/events/${training}?tab=plan`, 'sub'], ['event-future-game', `/events/${futureGame}`, 'sub'],
  ['events-list', '/events'], ['events-list-player', '/events', 'player'], ['events-month-player', '/events', 'player'],
  ['event-consultation', `/events/${ids.consultation}`, 'player'],
  ['event-consultation-shared', `/events/${ids.shared}`, 'player'],
  ['event-consultation-discussion', `/events/${ids.shared}?tab=discussion`, 'player'],
  ['event-unassigned', `/events/${ids.unassigned}`, 'player'],
  ['event-hidden-details', `/events/${ids.hidden}`, 'player'],
  ['event-edit-series', `/events/${training}/edit`, 'sub'],
  ['event-new-visibility', '/events/new', 'sub'], ['event-new-pending', '/events/new', 'sub'],
  ['event-new', '/events/new', 'sub'], ['attendance-missing', '/attendance?tab=missing'],
  ['announcements', '/announcements', 'sub'], ['drills', '/drills'],
  ['review', '/members/review', 'sub'], ['member-edit', `/members/${member}`, 'sub'], ['member-documents', `/members/${member}/documents`, 'sub'],
  ['profile', '/profile'], ['profile-info', '/profile/info', 'sub'], ['profile-documents', '/documents', 'sub'],
  ['profile-absences', '/profile/absences', 'sub'], ['profile-season', '/profile/season', 'sub'], ['profile-club-documents', '/profile/club-documents', 'sub'], ['profile-security', '/profile/security', 'sub'], ['profile-notifications', '/profile/notifications', 'sub'],
  ['profile-calendar', '/profile/calendar', 'sub'], ['offline', '/offline', 'sub'], ['profile-app', '/profile/app', 'sub'],
  ['settings', '/settings'], ['settings-club', '/settings/club', 'sub'], ['settings-documents', '/settings/documents', 'sub'], ['settings-groups', '/settings/groups', 'sub'],
  ['settings-rinks', '/settings/rinks', 'sub'], ['settings-ice', '/settings/ice', 'sub'], ['settings-league', '/settings/league', 'sub'], ['settings-invites', '/settings/invites', 'sub'],
  ['login', '/login', 'auth'],
]
}
