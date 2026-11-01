import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmAction'
import MenuSelect from '../components/MenuSelect'
import PageHeader from '../components/PageHeader'
import { errorText, t } from '../i18n'
import { checked } from '../lib/formcheck'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatDay } from '../lib/time'

interface Hidden { team: string; player_name: string; hidden_at: string; hidden_by_name: string | null }

// The board hides a league player from the championship statistics for a privacy request (decision 139).
// Only the display is removed; the games the league publishes stay stored.
export default function LeagueStatsSettings() {
  const { isBoard, loading } = useSession()
  const [teams, setTeams] = useState<string[]>([])
  const [hidden, setHidden] = useState<Hidden[] | null>(null)
  const [team, setTeam] = useState('')
  const [name, setName] = useState('')
  const [names, setNames] = useState<string[]>([])
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const listId = useId()

  const load = useCallback(async () => {
    const [m, h] = await Promise.all([
      supabase.from('league_matches').select('home, away'),
      supabase.rpc('league_hidden_list'),
    ])
    const set = new Set<string>()
    for (const r of (m.data ?? []) as { home: string; away: string }[]) { set.add(r.home); set.add(r.away) }
    setTeams([...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'it')))
    setHidden((h.data ?? []) as Hidden[])
  }, [])

  useEffect(() => { void load() }, [load])

  // The names the league wrote for the chosen team, offered while typing.
  useEffect(() => {
    if (!team) { setNames([]); return }
    void supabase.rpc('league_team_players', { p_team: team }).then(({ data }) => {
      setNames(((data ?? []) as { player_name: string }[]).map((x) => x.player_name))
    })
  }, [team])

  const options = useMemo(() => teams.map((x) => ({ value: x, label: x })), [teams])

  if (!loading && !isBoard) return <Navigate to="/settings" replace />

  function ask(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!team) return setError(t('leagueHide.teamRequired'))
    setAsking(true)
  }

  async function hide() {
    setBusy(true)
    const { error: e } = await supabase.rpc('hide_league_player', { p_team: team, p_name: name })
    setBusy(false)
    if (e) return setError(errorText(e))
    setNotice(t('leagueHide.done', { name: name.trim() }))
    setName('')
    await load()
  }

  async function show(h: Hidden) {
    setError('')
    setNotice('')
    const { error: e } = await supabase.rpc('show_league_player', { p_team: h.team, p_name: h.player_name })
    if (e) return setError(errorText(e))
    setNotice(t('leagueHide.shown', { name: h.player_name }))
    await load()
  }

  return (
    <div className="section">
      <PageHeader title={t('settings.league')} back={{ to: '/settings', label: t('settings.title') }} description={t('leagueHide.intro')} />
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="hint" role="status">{notice}</p>}

      <h2>{t('leagueHide.add')}</h2>
      <form {...checked(ask)} className="form-col">
        <div>
          <MenuSelect label={t('leagueHide.team')} value={team} options={[{ value: '', label: t('leagueHide.teamChoose') }, ...options]} onChange={(v) => setTeam(v)} />
        </div>
        <label>{t('leagueHide.name')}
          <input required maxLength={120} value={name} list={listId} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </label>
        <datalist id={listId}>{names.map((n) => <option key={n} value={n} />)}</datalist>
        <p className="hint">{t('leagueHide.nameHint')}</p>
        <button type="submit" disabled={busy}>{t('leagueHide.hide')}</button>
      </form>
      <ConfirmDialog
        open={asking}
        title={t('leagueHide.confirmTitle', { name: name.trim() })}
        body={t('leagueHide.confirmBody', { name: name.trim(), team })}
        choices={[{ label: t('leagueHide.hide'), onChoose: () => void hide() }]}
        busy={busy}
        onClose={() => setAsking(false)}
      />

      <h2>{t('leagueHide.list', { n: hidden === null ? '–' : String(hidden.length) })}</h2>
      {hidden !== null && hidden.length === 0 && <p className="hint">{t('leagueHide.empty')}</p>}
      {hidden !== null && hidden.length > 0 && (
        <ul className="list club-docs">
          {hidden.map((h) => (
            <li key={`${h.team}|${h.player_name}`} className="row">
              <span>
                <strong data-person-name>{h.player_name}</strong>
                <small className="hint"> {h.team}</small>
                <small className="hint block">{h.hidden_by_name ? t('leagueHide.by', { day: formatDay(h.hidden_at), who: h.hidden_by_name }) : t('leagueHide.byUnknown', { day: formatDay(h.hidden_at) })}</small>
              </span>
              <span className="row-actions">
                <button type="button" className="secondary" aria-label={t('leagueHide.showLabel', { name: h.player_name })} onClick={() => void show(h)}>{t('leagueHide.show')}</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
