import { useEffect, useState } from 'react'
import { t, type MessageKey } from '../i18n'
import { personName } from '../lib/names'
import { supabase } from '../lib/supabase'
import { seasonLabel } from '../lib/time'

interface Leader {
  category: string
  user_id: string
  first_name: string
  last_name: string
  value: number
}

const CATEGORIES = ['goals', 'assists', 'points', 'mvp', 'present']

// The hall of fame (V8): the leaders of every season, newest first, from the season statistics.
export default function HallOfFame({ seasons }: { seasons: number[] }) {
  const [data, setData] = useState<Map<number, Leader[]> | null>(null)

  useEffect(() => {
    let live = true
    void Promise.all(seasons.map((s) => supabase.rpc('season_leaders', { p_season: s }).then(({ data: rows }) => [s, (rows ?? []) as Leader[]] as const))).then((all) => {
      if (live) setData(new Map(all))
    })
    return () => { live = false }
  }, [seasons])

  if (data === null) return null
  const filled = seasons.filter((s) => (data.get(s) ?? []).length > 0)
  return (
    <>
      <p className="hint">{t('hall.intro')}</p>
      {filled.length === 0 && <p className="hint">{t('hall.empty')}</p>}
      {filled.map((s) => (
        <section key={s} className="card hall" aria-labelledby={`hall-${s}`}>
          <h2 id={`hall-${s}`}>{t('hall.season', { season: seasonLabel(s) })}</h2>
          <dl className="home-facts">
            {CATEGORIES.map((c) => {
              const rows = (data.get(s) ?? []).filter((l) => l.category === c)
              if (rows.length === 0) return null
              return (
                <div key={c}>
                  <dt>{t(`hall.${c}` as MessageKey)}</dt>
                  <dd>{rows.map((r) => personName(r)).join(', ')} <small className="hint">{rows[0].value}</small></dd>
                </div>
              )
            })}
          </dl>
        </section>
      ))}
    </>
  )
}
