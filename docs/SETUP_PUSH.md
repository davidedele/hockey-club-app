# Setup: push notifications

Push notifications reach a phone even when the app is closed. The app asks the database how to reach each person (push, email, both or nothing), so push and email follow the same rules and the same quiet hours at night. Nothing here is switched on until you do these steps.

## 1. Make the key pair (once)

1. On your Mac, in a folder that is not the repository, run:

```bash
npx web-push generate-vapid-keys
```

2. It prints a public key and a private key. The private key is a secret: never put it in the repository, in a message or in a screenshot. Keep both in your password manager.

## 2. Apply the database change

1. Apply `supabase/apply/apply_0039_push_notifications.sql` in the SQL Editor of the project (after the files with lower numbers). It stops by itself on the wrong project or on a second run.

## 3. Set the secrets of the server function

1. In the Supabase dashboard open Edge Functions, then Secrets, and add:
   1. `VAPID_PUBLIC_KEY`: the public key.
   2. `VAPID_PRIVATE_KEY`: the private key.
   3. `VAPID_SUBJECT`: `mailto:` and the club's contact address, for example `mailto:direttivo@example.org`.
2. The secrets already set for the emails stay as they are (`REMINDER_SECRET`, `RESEND_API_KEY`, `REMINDER_FROM`, `APP_URL`).

## 4. Deploy the server function again

1. The function `send-reminders` now sends push too. Deploy it again as in `docs/SETUP_REMINDERS.md`, with "Verify JWT" off. Without the two VAPID secrets it keeps sending emails only.

## 5. Give the app the public key

1. In the place where the site is built (Netlify, see `docs/DEPLOY.md`) add the variable `VITE_VAPID_PUBLIC_KEY` with the public key, then build the site again. The public key is not a secret.
2. Until this is done, the page "Preferenze di notifica" says that the club has not turned on notifications yet.

## 6. Try it on one iPhone and one Android phone

iPhone (iOS 16.4 or later):
1. Open the site in Safari, tap Share, then Add to Home Screen, and open the app from the new icon. In a browser tab the button says how to do this.
2. Profile, Preferenze di notifica, tap "Attiva le notifiche" and allow them.
3. Make an event for yourself for tomorrow and do not answer, or ask the board to cancel one. The hourly job sends the notification at the next full hour (not between 22:00 and 08:00). To see it at once, run the function once by hand with the reminder secret (`docs/SETUP_REMINDERS.md`).
4. Tap the notification: the event opens.

Android and computers:
1. Open the site in Chrome, Profile, Preferenze di notifica, tap "Attiva le notifiche" and allow them. Same test as above.

## 7. What is sent

1. Reminders for events without an answer, changes and cancellations of the calendar, new announcements, and the medical certificate deadline. Discussion messages are not sent as push yet.
2. The text is short and shows on the lock screen: the title of the event and the day, never health data (no dates of the certificate), never other people's names, never the text of an announcement.
3. A person chooses per kind: Automatico (push if set up, otherwise email), notification and email, push only, email only, or none. The email switch of the same page still turns every email off.
4. A phone that no longer answers is removed from the database by itself.

## If something does not arrive

1. The person has no phone set up: the page says "Attiva le notifiche". On an iPhone the app must be on the Home screen.
2. The person blocked notifications in the phone settings: only the phone settings can turn them on again.
3. Look at the logs of the function `send-reminders`: they show only counts, never names.
