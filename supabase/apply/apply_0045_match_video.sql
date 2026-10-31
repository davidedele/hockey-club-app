-- Apply migration 0045 (match_video) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0045 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regclass('public.club_documents') is not null) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0045 was not applied.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'video_url') then
    raise exception 'Migration 0045 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Match video (V4): an optional https link on a game, shown on the event page. The database accepts only
-- addresses that start with https:// and have no spaces, at most 300 characters, and only on games.
-- Staff edit it with the rest of the event (the existing update rule of events); members only read it.

alter table public.events
  add column video_url text
  constraint events_video_url_check check (
    video_url is null or (type = 'game' and length(video_url) <= 300 and video_url ~ '^https://[^[:space:]]+$')
  );
grant update (video_url) on public.events to authenticated;

commit;
