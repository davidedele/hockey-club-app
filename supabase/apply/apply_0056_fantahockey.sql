-- Apply migration 0056 (fantahockey) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0056 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regclass('public.league_goals') is not null and to_regclass('public.game_predictions') is not null) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0056 was not applied.';
  end if;
  if to_regclass('public.fanta_picks') is not null then
    raise exception 'Migration 0056 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Fantahockey (V9, decision 136). A round is a game day of the club: an Italian calendar day with at least one
-- game that is not cancelled. Before the round starts (the first game of the day) a member picks three players of
-- the club. The picks are private until the round starts, like the match predictions (migration 0048), then
-- everybody in the club reads them. Points of a picked player in the round, from data the app already has:
--   3 for each goal, 2 for each assist, 5 for each game of the round in which the person was MVP (a tie counts for
--   each), and for each game with ratings the average rating minus 5, rounded, never below 0.
-- The season table adds the points of the rounds that are over (every game of the day has ended). People whose
-- data was deleted are not in it.

create table public.fanta_picks (
  round_day date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  picked_at timestamptz not null default now(),
  primary key (round_day, user_id, player_id)
);
create index fanta_picks_user_id_idx on public.fanta_picks (user_id);
create index fanta_picks_player_id_idx on public.fanta_picks (player_id);

-- The games of a round: not cancelled, on that Italian day.
create function public.fanta_round_start(p_day date) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select min(e.starts_at) from public.events e
  where e.type = 'game' and e.cancelled_at is null and (e.starts_at at time zone 'Europe/Rome')::date = p_day
$$;

create function public.fanta_round_started(p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.fanta_round_start(p_day) <= now(), false)
$$;

-- The next round that has not started yet.
create function public.fanta_next_round()
returns table (round_day date, starts_at timestamptz, games integer)
language sql stable security definer set search_path = '' as $$
  select (e.starts_at at time zone 'Europe/Rome')::date, min(e.starts_at), count(*)::integer
  from public.events e
  where public.is_member() and e.type = 'game' and e.cancelled_at is null and e.starts_at > now()
  group by 1
  having min(e.starts_at) > now()
  order by 1
  limit 1
$$;

-- The latest round that has started (it may still be going).
create function public.fanta_last_round()
returns table (round_day date, starts_at timestamptz, games integer, over boolean)
language sql stable security definer set search_path = '' as $$
  select (e.starts_at at time zone 'Europe/Rome')::date, min(e.starts_at), count(*)::integer, max(e.ends_at) <= now()
  from public.events e
  where public.is_member() and e.type = 'game' and e.cancelled_at is null and e.starts_at <= now()
  group by 1
  order by 1 desc
  limit 1
$$;

-- Who can be picked: people of the club who are in a group and whose data was not deleted.
create function public.fanta_candidates()
returns table (user_id uuid, first_name text, last_name text, jersey_number smallint, "position" text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.last_name, p.jersey_number, p.position
  from public.profiles p
  where public.is_member() and p.deleted_at is null
    and exists (select 1 from public.group_members m where m.user_id = p.id)
  order by p.last_name, p.first_name
$$;

-- A member makes or changes the three picks of a round, until the round starts.
create function public.set_fanta_picks(p_day date, p_players uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_players is null or cardinality(p_players) <> 3
     or (select count(distinct x) from unnest(p_players) x) <> 3 or array_position(p_players, null) is not null then
    raise exception 'fanta_invalid' using errcode = 'P0001';
  end if;
  if public.fanta_round_start(p_day) is null or public.fanta_round_start(p_day) <= now() then
    raise exception 'fanta_closed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.fanta_candidates() c where c.user_id = any (p_players)) <> 3 then
    raise exception 'fanta_invalid' using errcode = 'P0001';
  end if;
  delete from public.fanta_picks where round_day = p_day and user_id = v_me;
  insert into public.fanta_picks (round_day, user_id, player_id)
  select p_day, v_me, x from unnest(p_players) x;
end
$$;

-- Points of every player who scored in the games of one round (games that have started).
create function public.fanta_player_points(p_day date)
returns table (player_id uuid, points integer)
language sql stable security definer set search_path = '' as $$
  with g as (
    select e.id from public.events e
    where e.type = 'game' and e.cancelled_at is null and e.starts_at <= now()
      and (e.starts_at at time zone 'Europe/Rome')::date = p_day
  ),
  votes as (
    select v.event_id, v.voted_id, count(*) as n from public.mvp_votes v join g on g.id = v.event_id
    group by v.event_id, v.voted_id
  ),
  pts as (
    select s.user_id as pid, 3 * s.goals + 2 * s.assists as p from public.game_stats s join g on g.id = s.event_id
    union all
    select v.voted_id, 5 from votes v where v.n = (select max(w.n) from votes w where w.event_id = v.event_id)
    union all
    select r.rated_id, greatest(0, round(avg(r.rating) - 5))::integer
    from public.game_ratings r join g on g.id = r.event_id group by r.event_id, r.rated_id
  )
  select pts.pid, sum(pts.p)::integer from pts where public.is_member() group by pts.pid
$$;

-- The picks of one round with the points of each picked player. Only once the round has started.
create function public.fanta_round_list(p_day date)
returns table (user_id uuid, first_name text, last_name text, player_id uuid, player_first_name text, player_last_name text, points integer)
language sql stable security definer set search_path = '' as $$
  select k.user_id, u.first_name, u.last_name, k.player_id, pl.first_name, pl.last_name, coalesce(pp.points, 0)
  from public.fanta_picks k
  join public.profiles u on u.id = k.user_id and u.deleted_at is null
  join public.profiles pl on pl.id = k.player_id
  left join public.fanta_player_points(p_day) pp on pp.player_id = k.player_id
  where k.round_day = p_day and public.is_member() and public.fanta_round_started(p_day)
  order by u.last_name, u.first_name, 7 desc, pl.last_name
$$;

-- The season table: rounds that are over (every game of the day has ended), within the season (1 September, Italian time).
create function public.fanta_table(p_season integer)
returns table (user_id uuid, first_name text, last_name text, rounds integer, points integer)
language sql stable security definer set search_path = '' as $$
  with days as (
    select (e.starts_at at time zone 'Europe/Rome')::date as d
    from public.events e
    where public.is_member() and e.type = 'game' and e.cancelled_at is null
      and p_season between 2000 and 2100
      and e.starts_at >= make_timestamptz(p_season, 9, 1, 0, 0, 0, 'Europe/Rome')
      and e.starts_at < make_timestamptz(p_season + 1, 9, 1, 0, 0, 0, 'Europe/Rome')
    group by 1
    having max(e.ends_at) <= now()
  ),
  per as (
    select k.user_id, k.round_day, sum(coalesce(pp.points, 0))::integer as p
    from public.fanta_picks k
    join days on days.d = k.round_day
    left join lateral public.fanta_player_points(k.round_day) pp on pp.player_id = k.player_id
    group by k.user_id, k.round_day
  )
  select per.user_id, u.first_name, u.last_name, count(*)::integer, sum(per.p)::integer
  from per join public.profiles u on u.id = per.user_id and u.deleted_at is null
  group by per.user_id, u.first_name, u.last_name
  order by 5 desc, 4 desc, u.last_name, u.first_name
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.fanta_picks from public, anon, authenticated;
revoke all on function public.fanta_round_start(date), public.fanta_round_started(date), public.fanta_next_round(), public.fanta_last_round(),
  public.fanta_candidates(), public.set_fanta_picks(date, uuid[]), public.fanta_player_points(date),
  public.fanta_round_list(date), public.fanta_table(integer) from public, anon, authenticated;
grant select on public.fanta_picks to authenticated;
grant execute on function public.fanta_round_started(date), public.fanta_next_round(), public.fanta_last_round(), public.fanta_candidates(),
  public.set_fanta_picks(date, uuid[]), public.fanta_round_list(date), public.fanta_table(integer) to authenticated;

alter table public.fanta_picks enable row level security;
-- Your own picks any time; other people's only once the round has started.
create policy fanta_picks_select on public.fanta_picks for select to authenticated
  using ((select public.is_member()) and (user_id = (select auth.uid()) or (select public.fanta_round_started(round_day))));

commit;
