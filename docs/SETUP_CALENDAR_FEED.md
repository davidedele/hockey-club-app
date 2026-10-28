# Putting the calendar feed online

Do this in the Supabase test project, not the club's live one.

1. Open the SQL Editor, paste the file `apply_0018_calendar_feed.sql` and run it once. It stops by itself if it runs against the wrong project or a second time.
2. Open Edge Functions and create a new function named `calendar-feed`.
3. Paste the content of `supabase/functions/calendar-feed/index.ts` into the main file. Add a second file named `ics.ts` and paste the content of `supabase/functions/calendar-feed/ics.ts` into it.
4. Switch "Verify JWT" off for this function. Calendar apps cannot sign in, so the secret in the link is the protection.
5. Deploy.
6. In the app, open Profilo, press "Mostra il mio link", then "Aggiungi al calendario" on the phone. The events of your groups appear in the calendar.

To try the protection: open the link with one character changed, the page must say "Link non valido". After "Crea un nuovo link" the old link must say the same.

Phone calendars refresh by themselves. iPhone and Android calendars usually do it within an hour or a few hours, Google Calendar can take much longer. A change made in the app is not instant on the phone.
