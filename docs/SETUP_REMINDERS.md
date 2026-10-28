# Putting the reminder emails online

Do this in the Supabase test project, not the club's live one. The emails go to the members who are due, so on the test project they go to your own test accounts.

How it works: every hour a scheduled job in the database calls the function `send-reminders`. The database says who has not answered for an event less than three days away (a last reminder when it is less than a day away), stays quiet from 22:00 to 08:00 Italian time, and the function sends one email per person through Resend.

## Steps

1. In the SQL Editor paste the file `apply_0019_reminders.sql` and run it once. It stops by itself on the wrong project or a second run.
2. Make a secret for the job. In the terminal run `openssl rand -hex 32` and copy the result. Keep it to yourself.
3. In Resend open API Keys and create a new key with Sending access only, limited to your domain. Copy it once.
4. In Supabase open Edge Functions, then Secrets, and add four secrets:
   1. `REMINDER_SECRET`: the value from step 2.
   2. `RESEND_API_KEY`: the key from step 3.
   3. `REMINDER_FROM`: the sender, for example `Sgularat Milano <club@email.onlyai.lol>`.
   4. `APP_URL`: the address of the app, `https://app.onlyai.lol`.
5. Create the function `send-reminders` from the editor: paste `index.ts` into the main file (the file `send-reminders_index.ts` I sent) and add three more files named `reminder.ts`, `announcement.ts` and `eventnotice.ts` with their content. Switch Verify JWT off. Deploy. When a new version of these files comes, paste them again and deploy; check that Verify JWT is still off.
6. In the SQL Editor open `schedule_reminders.sql`, replace `PUT_THE_SECRET_HERE` with the secret from step 2 and run it. Do not save that edited file in the repository. The call waits up to 60 seconds for the function (`timeout_milliseconds := 60000`). The default wait of 5 seconds is too short, because the function can need longer when it wakes up and sends emails, and then the hourly run sends nothing.

## Trying it

1. In the app create a training for tomorrow in your group, and do not answer.
2. In the terminal run: `curl -X POST -H "x-reminder-secret: YOUR_SECRET" https://qekmoxtryxockzegzaii.supabase.co/functions/v1/send-reminders`
3. The answer lists how many people were due and how many emails went out. Check your inbox. Between 22:00 and 08:00 Italian time it always says zero people, on purpose.
4. Run it again: nobody is due, because what was sent is remembered.
5. In Profilo switch the reminders off, create another training, run again: no email for you.

## Notes

1. A person who is on an absence period already has an Absent answer, so they get no reminder.
2. The log of what was sent is kept in `reminder_log`; a removed event or member takes its rows with it.
3. If sending fails for someone, they are tried again at the next hour.
4. Each email says how to switch reminders off in Profilo. Before the real version, a one click unsubscribe link in the email itself is worth adding.
