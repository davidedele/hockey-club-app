-- Apply migration 0057 (fantahockey_own_groups) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0057 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regclass('public.fanta_picks') is not null) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0057 was not applied.';
  end if;
  if to_regprocedure('public.fanta_scope(boolean)') is not null then
    raise exception 'Migration 0057 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Fantahockey follows the groups of the person (decision 131, Davide 1 November: in the Giocatore view a person
-- sees only the things of their own groups). A round is a game day of the person's own groups, the start of a round is
-- the first game of that day among those groups, the players one can pick are the members of those groups, and the
-- picks of a person are read, once their round has started, only by people who share a group with them, and only for
-- days on which a shared group plays. The staff views pass p_all = true and are then not limited; the database only
-- honours that for coaches and the board, everybody else is always limited to their own groups.
-- Nothing here returns the date, opponent or result of a game of a group the person does not belong to.

drop policy fanta_picks_select on public.fanta_picks;
drop function public.fanta_round_list(date), public.fanta_table(integer), public.set_fanta_picks(date, uuid[]),
  public.fanta_candidates(), public.fanta_last_round(), public.fanta_next_round(),
  public.fanta_round_started(date), public.fanta_round_start(date);

-- Internal helpers (nobody but the other functions calls them) ----------

-- The groups a person looks through: their own, or every group for staff who asked for it.
create function public.fanta_scope(p_all boolean) returns setof smallint
language sql stable security definer set search_path = '' as $$
  select m.group_id from public.group_members m where m.user_id = auth.uid() and public.is_member()
  union
  select g.id from public.groups g where p_all and public.is_staff() and public.is_member()
$$;

create function public.fanta_user_groups(p_user uuid) returns smallint[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array(select m.group_id from public.group_members m where m.user_id = p_user), '{}'::smallint[])
$$;

-- The games of one Italian day for some groups: not cancelled, each game once.
create function public.fanta_games(p_groups smallint[], p_day date)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct e.id, e.starts_at, e.ends_at
  from public.events e join public.event_groups eg on eg.event_id = e.id
  where eg.group_id = any (p_groups) and e.type = 'game' and e.cancelled_at is null
    and (e.starts_at at time zone 'Europe/Rome')::date = p_day
$$;

-- The start of a round: the first game of the day among those groups.
create function public.fanta_round_start(p_groups smallint[], p_day date) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select min(g.starts_at) from public.fanta_games(p_groups, p_day) g
$$;

-- The round of one person: their own groups, started or over.
create function public.fanta_user_started(p_user uuid, p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.fanta_round_start(public.fanta_user_groups(p_user), p_day) <= now(), false)
$$;

create function public.fanta_user_over(p_user uuid, p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select max(g.ends_at) <= now() from public.fanta_games(public.fanta_user_groups(p_user), p_day) g), false)
$$;

-- May the caller read the picks that p_user made for p_day? Their own at any time. Others' only once the round of that
-- person has started, and only when the two share a group that has a game on that day (staff: any group).
-- Used by the row level policy, so it answers false instead of telling anything about people the caller has no link to.
create function public.fanta_pick_visible(p_user uuid, p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member() and (
    p_user = auth.uid()
    or (
      public.fanta_user_started(p_user, p_day)
      and exists (
        select 1 from public.group_members m
        where m.user_id = p_user
          and public.fanta_round_start(array[m.group_id], p_day) is not null
          and (public.is_staff() or m.group_id in (select gm.group_id from public.group_members gm where gm.user_id = auth.uid()))
      )
    )
  )
$$;

-- What the screens call ------------------------------------------------

-- The next round of the person's groups that has not started yet.
create function public.fanta_next_round(p_all boolean default false)
returns table (round_day date, starts_at timestamptz, games integer)
language sql stable security definer set search_path = '' as $$
  select (e.starts_at at time zone 'Europe/Rome')::date, min(e.starts_at), count(distinct e.id)::integer
  from public.events e join public.event_groups eg on eg.event_id = e.id
  where public.is_member() and e.type = 'game' and e.cancelled_at is null
    and e.starts_at > now() - interval '2 days'
    and eg.group_id in (select public.fanta_scope(p_all))
  group by 1
  having min(e.starts_at) > now()
  order by 1
  limit 1
$$;

-- The latest round of the person's groups that has started (it may still be going).
create function public.fanta_last_round(p_all boolean default false)
returns table (round_day date, starts_at timestamptz, games integer, over boolean)
language sql stable security definer set search_path = '' as $$
  select (e.starts_at at time zone 'Europe/Rome')::date, min(e.starts_at), count(distinct e.id)::integer, max(e.ends_at) <= now()
  from public.events e join public.event_groups eg on eg.event_id = e.id
  where public.is_member() and e.type = 'game' and e.cancelled_at is null
    and eg.group_id in (select public.fanta_scope(p_all))
  group by 1
  having min(e.starts_at) <= now()
  order by 1 desc
  limit 1
$$;

-- Who can be picked: the members of the groups in scope whose data was not deleted.
create function public.fanta_candidates(p_all boolean default false)
returns table (user_id uuid, first_name text, last_name text, jersey_number smallint, "position" text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.last_name, p.jersey_number, p.position
  from public.profiles p
  where public.is_member() and p.deleted_at is null
    and exists (select 1 from public.group_members m where m.user_id = p.id and m.group_id in (select public.fanta_scope(p_all)))
  order by p.last_name, p.first_name
$$;

-- A member makes or changes the three picks of a round of their own groups, until that round starts.
create function public.set_fanta_picks(p_day date, p_players uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_start timestamptz;
begin
  if v_me is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_players is null or cardinality(p_players) <> 3
     or (select count(distinct x) from unnest(p_players) x) <> 3 or array_position(p_players, null) is not null then
    raise exception 'fanta_invalid' using errcode = 'P0001';
  end if;
  v_start := public.fanta_round_start(array(select public.fanta_scope(false)), p_day);
  if v_start is null or v_start <= now() then
    raise exception 'fanta_closed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.fanta_candidates(false) c where c.user_id = any (p_players)) <> 3 then
    raise exception 'fanta_invalid' using errcode = 'P0001';
  end if;
  delete from public.fanta_picks where round_day = p_day and user_id = v_me;
  insert into public.fanta_picks (round_day, user_id, player_id)
  select p_day, v_me, x from unnest(p_players) x;
end
$$;

-- The picks of one round with the points of each picked player. Only picks whose round has started, of people who
-- share a group with the caller that plays on that day (points come from every game of the day, as before).
create function public.fanta_round_list(p_day date, p_all boolean default false)
returns table (user_id uuid, first_name text, last_name text, player_id uuid, player_first_name text, player_last_name text, points integer)
language sql stable security definer set search_path = '' as $$
  select k.user_id, u.first_name, u.last_name, k.player_id, pl.first_name, pl.last_name, coalesce(pp.points, 0)
  from public.fanta_picks k
  join public.profiles u on u.id = k.user_id and u.deleted_at is null
  join public.profiles pl on pl.id = k.player_id
  left join public.fanta_player_points(p_day) pp on pp.player_id = k.player_id
  where k.round_day = p_day and public.is_member()
    and public.fanta_user_started(k.user_id, p_day)
    and exists (
      select 1 from public.group_members m
      where m.user_id = k.user_id and m.group_id in (select public.fanta_scope(p_all))
        and public.fanta_round_start(array[m.group_id], p_day) is not null
    )
  order by u.last_name, u.first_name, 7 desc, pl.last_name
$$;

-- The season table: only people who share a group with the caller, and only rounds of a shared group that are over
-- (every game of the day of that person's groups has ended), within the season (1 September, Italian time).
create function public.fanta_table(p_season integer, p_all boolean default false)
returns table (user_id uuid, first_name text, last_name text, rounds integer, points integer)
language sql stable security definer set search_path = '' as $$
  with days as (
    select distinct k.user_id, k.round_day
    from public.fanta_picks k
    where public.is_member() and p_season between 2000 and 2100
      and k.round_day >= make_date(p_season, 9, 1) and k.round_day < make_date(p_season + 1, 9, 1)
      and public.fanta_user_over(k.user_id, k.round_day)
      and exists (
        select 1 from public.group_members m
        where m.user_id = k.user_id and m.group_id in (select public.fanta_scope(p_all))
          and public.fanta_round_start(array[m.group_id], k.round_day) is not null
      )
  ),
  per as (
    select d.user_id, d.round_day, sum(coalesce(pp.points, 0))::integer as p
    from days d
    join public.fanta_picks k on k.user_id = d.user_id and k.round_day = d.round_day
    left join lateral public.fanta_player_points(d.round_day) pp on pp.player_id = k.player_id
    group by d.user_id, d.round_day
  )
  select per.user_id, u.first_name, u.last_name, count(*)::integer, sum(per.p)::integer
  from per join public.profiles u on u.id = per.user_id and u.deleted_at is null
  group by per.user_id, u.first_name, u.last_name
  order by 5 desc, 4 desc, u.last_name, u.first_name
$$;

-- Privileges -----------------------------------------------------------

revoke all on function public.fanta_scope(boolean), public.fanta_user_groups(uuid), public.fanta_games(smallint[], date),
  public.fanta_round_start(smallint[], date), public.fanta_user_started(uuid, date), public.fanta_user_over(uuid, date),
  public.fanta_pick_visible(uuid, date), public.fanta_next_round(boolean), public.fanta_last_round(boolean),
  public.fanta_candidates(boolean), public.set_fanta_picks(date, uuid[]), public.fanta_round_list(date, boolean),
  public.fanta_table(integer, boolean) from public, anon, authenticated;
grant execute on function public.fanta_pick_visible(uuid, date), public.fanta_next_round(boolean), public.fanta_last_round(boolean),
  public.fanta_candidates(boolean), public.set_fanta_picks(date, uuid[]), public.fanta_round_list(date, boolean),
  public.fanta_table(integer, boolean) to authenticated;

-- Your own picks any time; other people's only once their round has started, and only from a shared group.
create policy fanta_picks_select on public.fanta_picks for select to authenticated
  using ((select public.fanta_pick_visible(user_id, round_day)));

commit;
