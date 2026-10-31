import { t } from '../i18n'

// What shows while data is on its way (docs/UI_RULES.md, rule 1.8): grey blocks in the shape of what is
// coming instead of a line of text. A screen reader still hears that something is loading.
export function PageSkeleton(props: { band?: boolean }) {
  return (
    <div className="page wide" role="status" aria-busy="true">
      <span className="sr-only">{t('common.loading')}</span>
      {props.band !== false && <div className="skeleton sb-skel" aria-hidden="true" />}
      <div className="skeleton list-skel" aria-hidden="true" />
    </div>
  )
}

export function ChipsSkeleton(props: { count?: number }) {
  return (
    <div className="chips wrap" aria-hidden="true">
      {Array.from({ length: props.count ?? 5 }, (_, i) => <span key={i} className="skeleton chip-skel" />)}
    </div>
  )
}
