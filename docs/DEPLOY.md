# Putting the app online (test version)

The online copy uses the Supabase test project only. The club's real data never goes here. The real version gets its own Supabase project and its own Netlify site later.

The settings are in `netlify.toml`: build command, the redirect that makes direct links open the app, and security headers.

## Once, to set it up

1. In Netlify choose Add new site, then Import an existing project, then GitHub, and pick the repository `hockey-club-app`. Branch to deploy: `main`. Netlify reads the build settings from `netlify.toml`, so leave the fields as they are.
2. Before the first build, open Site configuration, Environment variables and add two values, copied from your local `.env`: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Both are public by design. Never add the service role key or any other secret.
3. Under Domain management add your domain. If the domain is attached to another Netlify site, remove it there first. Follow Netlify's DNS instructions, then wait for the HTTPS certificate to be issued.
4. In the Supabase test project open Authentication, URL Configuration. Set Site URL to the new address (for example `https://app.onlyai.lol`) and add the same address under Redirect URLs. Keep `http://localhost:5173` in the redirect list so your local copy still works.
5. Open the address on a phone and sign in. Then try an invite link and a password reset email: the link in the email must open the online address.

## Every update

1. Merge the pull request on GitHub. Netlify builds the new version and publishes it in a minute or two.
2. If the change has a migration, apply it in the SQL Editor first, then merge. If an edge function changed, paste it again in the Supabase dashboard.
3. If something is wrong, open Deploys in Netlify, pick an earlier one and choose Publish deploy to go back.

## Notes

1. A Netlify build that fails leaves the online version as it was.
2. A pull request gets its own preview address from Netlify. That preview also talks to the test project.
3. A Content Security Policy is not set yet. It is worth adding before the real version, once the app is stable.
