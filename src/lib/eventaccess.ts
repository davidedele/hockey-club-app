import type { EventDetailKey, EventRow } from './types'
export const EVENT_DETAILS: EventDetailKey[] = ['presence', 'lineup', 'plan', 'discussion', 'game']
export const invitedTo = (event: Pick<EventRow, 'event_groups'>, groups: readonly number[]) => event.event_groups.some((g) => groups.includes(g.group_id))
export const detailAllowed = (event: EventRow, detail: EventDetailKey, staff: boolean, invited: boolean) =>
  staff || (invited ? event.participant_details ?? EVENT_DETAILS : event.observer_details ?? []).includes(detail)
export const canAnswerEvent = (event: EventRow, groups: readonly number[], notCalled: boolean, now = Date.now()) =>
  !event.cancelled_at && !notCalled && new Date(event.ends_at).getTime() > now && invitedTo(event, groups)

export const unassignedTraining = (event: Pick<EventRow, 'type' | 'event_groups'>) => event.type === 'training' && event.event_groups.length === 0
