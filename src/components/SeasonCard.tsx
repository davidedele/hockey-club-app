import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { readableInk } from '../lib/colour'
import { useClub } from '../lib/club'
import { canvasToBlob, cardFacts, drawSeasonCard } from '../lib/seasoncard'
import type { MySeason } from '../lib/myseason'
import { personName } from '../lib/names'
import { useSession } from '../lib/session'
import { seasonLabel } from '../lib/time'

// "La mia scheda": the person's own numbers drawn as a picture on the phone, to share or save. Nothing is uploaded.
export default function SeasonCard({ data, season }: { data: MySeason; season: number }) {
  const { profile } = useSession()
  const club = useClub()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open || !canvas.current || !profile) return
    drawSeasonCard(canvas.current, {
      club: club.name || t('app.name'),
      person: personName(profile),
      season: seasonLabel(season),
      title: t('card.title'),
      facts: cardFacts(data, { attendance: t('att.percent'), trainings: t('card.trainings'), games: t('stats.games'), goals: t('stats.colGoals'), assists: t('stats.colAssists'), mvp: t('season.mvp') }),
      dark: club.gameDark,
      light: club.gameLight,
      ink: readableInk(club.gameDark),
    })
  }, [open, data, season, profile, club])

  async function share() {
    if (!canvas.current) return
    setMessage('')
    try {
      const blob = await canvasToBlob(canvas.current)
      const file = new File([blob], `scheda-${seasonLabel(season).replace('/', '-')}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: t('card.title') })
      else save(blob, file.name)
    } catch (e) {
      // Closing the share sheet is not a failure.
      if ((e as Error).name !== 'AbortError') setMessage(t('card.error'))
    }
  }

  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  async function download() {
    if (!canvas.current) return
    try { const blob = await canvasToBlob(canvas.current); save(blob, `scheda-${seasonLabel(season).replace('/', '-')}.png`) } catch { setMessage(t('card.error')) }
  }

  return (
    <section aria-labelledby="season-card">
      <h2 id="season-card">{t('card.heading')}</h2>
      <p className="hint">{t('card.hint')}</p>
      {!open ? (
        <button type="button" className="secondary" onClick={() => setOpen(true)}>{t('card.make')}</button>
      ) : (
        <>
          <canvas ref={canvas} className="season-card-canvas" role="img" aria-label={t('card.alt')} />
          <div className="actions">
            <button type="button" onClick={() => void share()}>{t('card.share')}</button>
            <button type="button" className="secondary" onClick={() => void download()}>{t('card.download')}</button>
          </div>
        </>
      )}
      {message && <p className="error" role="alert">{message}</p>}
    </section>
  )
}
