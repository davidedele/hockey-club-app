-- Apply migration 0037 (rink_address) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0037 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regclass('public.rinks') is not null and to_regprocedure('public.calendar_events(text)') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'member_documents' and column_name = 'issued_on')) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0037 was not applied.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rinks' and column_name = 'address') then
    raise exception 'Migration 0037 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- The address of a rink and a short note (parking, entrance), edited by the board, read by members.
-- Opens in the maps app from an event, and goes into the location of the calendar feed.

alter table public.rinks
  add column address text check (address is null or (char_length(btrim(address)) between 1 and 200)),
  add column note text check (note is null or (char_length(btrim(note)) between 1 and 200));

revoke insert, update on public.rinks from authenticated;
grant insert (name, address, note), update (name, address, note) on public.rinks to authenticated;

-- The feed gets the address as one more column.
drop function public.calendar_events(text);
create function public.calendar_events(p_token text)
returns table (
  id uuid,
  type public.event_type,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  meetup_at timestamptz,
  venue text,
  rink text,
  opponent text,
  home_away text,
  cancelled_at timestamptz,
  address text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid;
  v_staff boolean;
begin
  select user_id into v_user from public.calendar_tokens where token = p_token;
  if v_user is null then
    return;
  end if;
  v_staff := exists (
    select 1 from public.user_roles where user_id = v_user and role in ('coach', 'board')
  );
  return query
  select e.id, e.type, e.title, e.starts_at, e.ends_at, e.meetup_at, e.venue, r.name,
         e.opponent, e.home_away, e.cancelled_at, r.address
  from public.events e
  left join public.rinks r on r.id = e.rink_id
  where e.starts_at >= now() - interval '60 days'
    and (
      v_staff
      or exists (
        select 1 from public.event_groups eg
        join public.group_members gm on gm.group_id = eg.group_id
        where eg.event_id = e.id and gm.user_id = v_user
      )
    )
  order by e.starts_at;
end
$$;
revoke all on function public.calendar_events(text) from public, anon, authenticated;
grant execute on function public.calendar_events(text) to service_role;

commit;
