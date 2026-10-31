-- Apply migration 0046 (pinned_announcements) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0046 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'video_url')) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0046 was not applied.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'announcements' and column_name = 'pinned_at') then
    raise exception 'Migration 0046 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Pinned announcements (V5): the board can pin an announcement so that it stays at the top of the list.
-- Only the board pins and unpins, through pin_announcement; nobody can update an announcement directly.
-- Read receipts are not built: the app keeps only the time each person last opened the announcements,
-- and a per announcement receipt would be a new table of who read what (decision 119).

alter table public.announcements add column pinned_at timestamptz;

create function public.pin_announcement(p_id uuid, p_pinned boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_board() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.announcements set pinned_at = case when coalesce(p_pinned, false) then now() else null end
   where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end
$$;

revoke all on function public.pin_announcement(uuid, boolean) from public, anon, authenticated;
grant execute on function public.pin_announcement(uuid, boolean) to authenticated;

commit;
