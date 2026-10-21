# Setting up the Supabase test project

Use the test project only. Never the club's live data.

1. Create a free Supabase project for testing.
2. In the SQL editor, run `supabase/migrations/0001_members_groups_invites.sql`.
3. In Authentication settings, keep "Confirm email" on, and add the site address (for example `http://localhost:5173`) to the allowed redirect URLs.
4. In Authentication > Users, add the first user, then run `supabase/bootstrap_first_board.sql` after filling in the three values. That person becomes the first board member.
5. Copy `.env.example` to `.env` and fill in the project URL and the anon key.
6. Run `npm install`, then `npm run dev`.

Checks that run without Supabase:
1. `npm run test:db` runs the migration and the access rule tests on a throwaway local Postgres.
2. `npm test` runs the text file tests, and `npm run typecheck` checks the code.
