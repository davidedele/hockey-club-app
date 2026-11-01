import { attendancePercent, type MySeason } from './myseason'

export interface CardFact { label: string; value: string }

// The numbers on the card: the person's own, as on La mia stagione. A missing percentage is an en dash.
export function cardFacts(d: MySeason, labels: { attendance: string; games: string; goals: string; assists: string; mvp: string; trainings: string }): CardFact[] {
  const percent = attendancePercent(d)
  return [
    { label: labels.attendance, value: percent === null ? '–' : `${percent}%` },
    { label: labels.trainings, value: String(d.on_time + d.late) },
    { label: labels.games, value: String(d.games) },
    { label: labels.goals, value: String(d.goals) },
    { label: labels.assists, value: String(d.assists) },
    { label: labels.mvp, value: String(d.mvp) },
  ]
}

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

// Draws the card on a canvas, here on the phone. Nothing is sent anywhere: the person decides whether to share the picture.
export function drawSeasonCard(canvas: HTMLCanvasElement, card: { club: string; person: string; season: string; title: string; facts: CardFact[]; dark: string; light: string; ink: string }) {
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = card.dark
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  // The red centre line with its circle, the club's hockey mark.
  ctx.fillStyle = card.light
  ctx.fillRect(0, 300, CARD_WIDTH, 10)
  ctx.beginPath()
  ctx.arc(CARD_WIDTH / 2, 305, 26, 0, Math.PI * 2)
  ctx.fillStyle = card.dark
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = card.light
  ctx.stroke()
  ctx.fillStyle = card.ink
  ctx.textAlign = 'center'
  ctx.font = '600 44px system-ui, sans-serif'
  ctx.fillText(card.club.toUpperCase(), CARD_WIDTH / 2, 110)
  ctx.font = '500 38px system-ui, sans-serif'
  ctx.fillText(`${card.title} ${card.season}`, CARD_WIDTH / 2, 175)
  ctx.font = '700 84px system-ui, sans-serif'
  ctx.fillText(card.person, CARD_WIDTH / 2, 262, CARD_WIDTH - 120)
  const cols = 2
  const cellW = (CARD_WIDTH - 160) / cols
  const cellH = 290
  card.facts.forEach((f, i) => {
    const x = 80 + (i % cols) * cellW + cellW / 2
    const y = 400 + Math.floor(i / cols) * cellH
    ctx.fillStyle = card.ink
    ctx.font = '700 150px system-ui, sans-serif'
    ctx.fillText(f.value, x, y + 130, cellW - 40)
    ctx.globalAlpha = 0.85
    ctx.font = '500 40px system-ui, sans-serif'
    ctx.fillText(f.label, x, y + 195, cellW - 40)
    ctx.globalAlpha = 1
  })
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('card'))), 'image/png'))
}
