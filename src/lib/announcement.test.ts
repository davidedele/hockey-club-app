import { describe, expect, it } from 'vitest'
import { buildAnnouncement } from '../../supabase/functions/send-reminders/announcement'

describe('announcement email', () => {
  it('uses the title as subject and names the writer and the groups', () => {
    const m = buildAnnouncement('Pia', 'Cambio orario', 'Giovedì si gioca alle 21.', 'Cora Coach', 'Squadra A', 'https://app.example.it/')
    expect(m.subject).toBe('Cambio orario')
    expect(m.text).toContain('Ciao Pia,')
    expect(m.text).toContain('Giovedì si gioca alle 21.')
    expect(m.text).toContain('Messaggio di Cora Coach, per Squadra A')
    expect(m.text).toContain('https://app.example.it/announcements')
    expect(m.text).toContain('https://app.example.it/profile')
  })

  it('copes with a missing writer or groups', () => {
    const m = buildAnnouncement('Pia', 'Avviso', 'Testo', '', '', 'https://app.example.it')
    expect(m.text).toContain('Messaggio\n')
    expect(m.text).not.toContain('Messaggio di')
  })

  it('does not let the text of a message inject html', () => {
    const m = buildAnnouncement('<b>Pia</b>', '<script>x</script>', 'Riga <i>uno</i>\nriga due\n\nSecondo "paragrafo"', 'A & B', 'G', 'https://app.example.it')
    expect(m.html).not.toContain('<script>')
    expect(m.html).not.toContain('<i>')
    expect(m.html).toContain('&lt;i&gt;uno&lt;/i&gt;<br>riga due')
    expect(m.html).toContain('<p>Secondo &quot;paragrafo&quot;</p>')
    expect(m.html).toContain('A &amp; B')
  })
})
