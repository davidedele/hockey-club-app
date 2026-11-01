import type { MessageKey } from '../i18n'

// Why a guess was refused with "prediction_closed": the database gives one code for four causes, so the page
// looks at the game and says which one it is. The order is the order a person would notice them in.
export function closedReason(game: { cancelled: boolean; started: boolean; inGroups: boolean }): MessageKey {
  if (game.cancelled) return 'predict.closedCancelled'
  if (game.started) return 'predict.closedStarted'
  if (!game.inGroups) return 'predict.closedGroups'
  return 'error.prediction_closed'
}
