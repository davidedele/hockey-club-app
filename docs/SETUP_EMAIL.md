# Setting up email for the test project

Goal: switch "Confirm email" back on and send the sign up and password reset emails from a real sender, so the confirmation path can be tested end to end. Do this in the Supabase test project only.

## Why this is needed
The built in Supabase email service is for trying things out. It sends only a few emails per hour and only to members of your own Supabase team. With 60 to 80 players joining, a proper sender is required.

## Step 0: choose a sender (needs your decision)
1. Resend: free for about 3000 emails per month. Needs a domain you own, because mail from a free address (gmail and similar) is rejected or lands in spam. Most reliable once the domain is verified.
2. Brevo: free for about 300 emails per day. You can verify a single sender address without a domain, which is quick for testing. Without a domain, mail is more likely to land in spam.
3. A Gmail account with an app password: works for testing with a few people, needs 2 step verification on that Google account. Not recommended for the real club.
Recommendation: Brevo with a single verified sender for the test project now, and Resend with a club domain before the real launch. If the club already has a domain or a club address, say so and the steps below use that.

## Your case: the domain onlyai.lol
You have the domain onlyai.lol, which is still connected to the Microsoft environment. Use Resend and put the sending on a subdomain, for example `mail.onlyai.lol`. The records Resend asks for are then added only for that subdomain, and the Microsoft records on the main domain stay untouched, so nothing breaks now and nothing needs redoing when you leave Microsoft. The sender address could be `club@mail.onlyai.lol`. This is for testing. Before real players use it, decide whether the club should send from a club domain instead.
Step by step: create a Resend account, choose Domains, add `mail.onlyai.lol`, then add the DNS records it lists at the place where onlyai.lol is managed (your registrar or DNS host, not necessarily Microsoft). Wait until Resend shows the domain as verified.

## Step 1: create the sender account
1. Create the account with the chosen service.
2. Add and verify the sender address (Brevo), or add the domain and publish the DNS records it shows (Resend).
3. Create an SMTP key or API key for sending. Keep it private. Never put it in the repository or in `.env`.
4. Note four values: SMTP host, port (use 465 or 587), username, and the key used as the password.

## Step 2: connect it in Supabase (test project)
1. Open the test project in the Supabase dashboard.
2. Go to Authentication, then Emails, then SMTP Settings (menu names can differ slightly between versions).
3. Turn on custom SMTP.
4. Fill in the sender email address and sender name (for example the club name), then host, port, username and password from step 1.
5. Save.

## Step 3: turn confirmation on
1. Go to Authentication, then Sign In / Providers, then Email.
2. Switch "Confirm email" on and save.
3. Go to Authentication, then URL Configuration. Set the site address to `http://localhost:5173` for now and add `http://localhost:5173/**` to the redirect URLs.

## Step 4: Italian email texts
In Authentication, then Emails, then Templates, change the texts for "Confirm sign up" and "Reset password". Suggested texts:

Confirm sign up, subject: Conferma il tuo indirizzo email

Ciao, per entrare nel club conferma il tuo indirizzo email con questo link: {{ .ConfirmationURL }}

Reset password, subject: Scegli una nuova password

Ciao, per scegliere una nuova password usa questo link: {{ .ConfirmationURL }}

If you did not ask for this, ignore this email. Write that line in Italian too: "Se non hai fatto tu questa richiesta, ignora questa email."

## Step 5: raise the sending limit
After custom SMTP is on, go to Authentication, then Rate Limits and raise the emails per hour to a sensible number (for example 30 while testing).

## Step 6: test the path
1. As a staff member in the app, create an invite.
2. Open the invite link in a private browser window and sign up with an address you can read.
3. Check that the email arrives (also check spam), click the link, and confirm you land back on the invite page and join the group.
4. Try "Password dimenticata?" on the login page and set a new password from the email.
5. If an email does not arrive, look at Authentication, then Logs in the dashboard. The error there names the problem (wrong password, sender not verified, port blocked).

## Before real players use it
1. Switch the site address and redirect URLs to the real web address.
2. Use a club domain for the sender (Resend), and set up SPF and DKIM as the service shows.
3. Repeat the test path in step 6 against the real address.
