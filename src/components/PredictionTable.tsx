import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { personName } from '../lib/names'
import { supabase } from '../lib/supabase'
import TableScroll from './TableScroll'

interface Row {
  user_id: string
  first_name: string
  last_name: string
  predictions: number
  exact: number
  points: number
}

// The season table of the match predictions (V7).
export default function PredictionTable({ season }: { season: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    let live = true
    setRows(null)
    void supabase.rpc('prediction_table', { p_season: season }).then(({ data }) => {
      if (live) setRows((data ?? []) as Row[])
    })
    return () => { live = false }
  }, [season])

  return (
    <>
      <p className="hint">{t('predict.tableIntro')}</p>
      {rows !== null && rows.length === 0 && <p className="hint">{t('predict.tableEmpty')}</p>}
      {rows !== null && rows.length > 0 && (
        <TableScroll>
          <table className="stats-table">
            <thead>
              <tr>
                <th scope="col">{t('predict.colPlayer')}</th>
                <th scope="col">{t('predict.colGuesses')}</th>
                <th scope="col">{t('predict.colExact')}</th>
                <th scope="col">{t('predict.colPoints')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id}>
                  <th scope="row"><span data-person-name>{personName(r)}</span></th>
                  <td>{r.predictions}</td>
                  <td>{r.exact || '–'}</td>
                  <td className="strong">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </>
  )
}
