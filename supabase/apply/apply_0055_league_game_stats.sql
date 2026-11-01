-- Apply migration 0055 (league_game_stats) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0055 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regclass('public.league_matches') is not null and to_regprocedure('public.team_key(text)') is not null) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0055 was not applied.';
  end if;
  if to_regclass('public.league_goals') is not null then
    raise exception 'Migration 0055 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Championship statistics (N14, decision 95). The goals, assists, penalties and line-ups of the finished league
-- games are read once from the league website by the league-details server function and stored here. Totals per
-- player and championship are added up by a function. The data is public on the league website; members of the
-- club can read it, nobody else. Only the server function (service role) writes it.
--
-- A player is told apart by team and name, compared without case and with runs of spaces counted as one, the way
-- the league writes them. The shirt number is kept for display and is not part of the identity, because a number can
-- change during a season. If the league spells one person two ways, the totals split; the page says so.

create table public.league_match_reads (
  match_id integer primary key references public.league_matches (id) on delete cascade,
  read_at timestamptz not null default now(),
  attempts smallint not null default 1 check (attempts between 1 and 100),
  players smallint not null default 0 check (players >= 0),
  goals smallint not null default 0 check (goals >= 0),
  penalties smallint not null default 0 check (penalties >= 0)
);

create table public.league_goals (
  match_id integer not null references public.league_matches (id) on delete cascade,
  seq smallint not null check (seq between 1 and 200),
  team text not null check (length(team) between 1 and 120),
  game_time text check (game_time is null or length(game_time) <= 12),
  scorer_number text check (scorer_number is null or length(scorer_number) <= 6),
  scorer_name text not null check (length(btrim(scorer_name)) between 1 and 120),
  assist1_number text check (assist1_number is null or length(assist1_number) <= 6),
  assist1_name text check (assist1_name is null or length(btrim(assist1_name)) between 1 and 120),
  assist2_number text check (assist2_number is null or length(assist2_number) <= 6),
  assist2_name text check (assist2_name is null or length(btrim(assist2_name)) between 1 and 120),
  kind text check (kind is null or length(kind) <= 20),
  primary key (match_id, seq),
  check (assist2_name is null or assist1_name is not null)
);

create table public.league_penalties (
  match_id integer not null references public.league_matches (id) on delete cascade,
  seq smallint not null check (seq between 1 and 200),
  team text not null check (length(team) between 1 and 120),
  game_time text check (game_time is null or length(game_time) <= 12),
  player_number text check (player_number is null or length(player_number) <= 6),
  player_name text not null check (length(btrim(player_name)) between 1 and 120),
  infraction text check (infraction is null or length(infraction) <= 120),
  seconds integer not null check (seconds between 0 and 3600),
  primary key (match_id, seq)
);

create table public.league_lineups (
  match_id integer not null references public.league_matches (id) on delete cascade,
  seq smallint not null check (seq between 1 and 100),
  team text not null check (length(team) between 1 and 120),
  role text check (role is null or length(role) <= 40),
  player_number text check (player_number is null or length(player_number) <= 6),
  player_name text not null check (length(btrim(player_name)) between 1 and 120),
  primary key (match_id, seq)
);

-- When the details were last asked for, and how it went (the page reads these to know what is still missing).
alter table public.league_sync
  add column details_started_at timestamptz,
  add column details_finished_at timestamptz,
  add column details_message text;

-- Server side: which finished games still need to be read. A game with no details on the site is asked again at
-- most three times, twelve hours apart, then left alone. Newest games first. Only the current competitions.
create function public.league_details_pending(p_limit integer default 10) returns table (match_id integer)
language sql stable security definer set search_path = '' as $$
  select m.id
  from public.league_matches m
  left join public.league_match_reads r on r.match_id = m.id
  where m.home_score is not null and m.championship_id is not null
    and (r.match_id is null
         or (r.players = 0 and r.goals = 0 and r.penalties = 0 and r.attempts < 3 and r.read_at < now() - interval '12 hours'))
  order by m.starts_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25)
$$;

-- One reading of the details at a time, and not more often than every ten minutes, so that the first filling is
-- spread over several runs and the website is not pushed.
create function public.league_details_claim() returns boolean
language sql security definer set search_path = '' as $$
  update public.league_sync set details_started_at = now(), details_message = null
  where id
    and (details_started_at is null or details_finished_at >= details_started_at or details_started_at < now() - interval '10 minutes')
    and (details_finished_at is null or details_finished_at < now() - interval '10 minutes')
  returning true
$$;

create function public.league_details_finish(p_message text default null) returns void
language sql security definer set search_path = '' as $$
  update public.league_sync set details_finished_at = now(), details_message = left(p_message, 500) where id
$$;

-- "2:00" as 120 seconds. Anything else is 0.
create function public.league_clock_seconds(p text) returns integer
language sql immutable set search_path = '' as $$
  select case when p ~ '^\d{1,3}:\d{2}$'
    then split_part(p, ':', 1)::integer * 60 + split_part(p, ':', 2)::integer else 0 end
$$;

-- Stores what was read from one game page, replacing what was stored before for that game.
--   p_data = { "goals":     [{ "side": "home"|"away", "time", "scorer": {number, name}, "assists": [{number, name}], "kind" }],
--              "penalties": [{ "side", "time", "player": {number, name}, "infraction", "minutes": "2:00" }],
--              "roster":    [{ "side", "role", "number", "name" }] }
-- Team names are the ones of the stored match, so they agree with the standings. A game that has no result is refused.
create function public.league_store_details(p_match integer, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_home text;
  v_away text;
  v_goals smallint;
  v_pens smallint;
  v_players smallint;
begin
  select m.home, m.away into v_home, v_away from public.league_matches m where m.id = p_match and m.home_score is not null;
  if v_home is null then
    raise exception 'league_match_not_finished' using errcode = 'P0001';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
     or jsonb_typeof(coalesce(p_data -> 'goals', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_data -> 'penalties', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_data -> 'roster', '[]'::jsonb)) <> 'array' then
    raise exception 'league_details_invalid' using errcode = 'P0001';
  end if;

  delete from public.league_goals where match_id = p_match;
  delete from public.league_penalties where match_id = p_match;
  delete from public.league_lineups where match_id = p_match;

  insert into public.league_goals (match_id, seq, team, game_time, scorer_number, scorer_name,
                                   assist1_number, assist1_name, assist2_number, assist2_name, kind)
  select p_match, row_number() over (order by o)::smallint,
         case g ->> 'side' when 'away' then v_away else v_home end,
         nullif(g ->> 'time', ''),
         nullif(g #>> '{scorer,number}', ''), btrim(g #>> '{scorer,name}'),
         nullif(g #>> '{assists,0,number}', ''), nullif(btrim(coalesce(g #>> '{assists,0,name}', '')), ''),
         case when nullif(btrim(coalesce(g #>> '{assists,0,name}', '')), '') is null then null else nullif(g #>> '{assists,1,number}', '') end,
         case when nullif(btrim(coalesce(g #>> '{assists,0,name}', '')), '') is null then null else nullif(btrim(coalesce(g #>> '{assists,1,name}', '')), '') end,
         nullif(g ->> 'kind', '')
  from jsonb_array_elements(coalesce(p_data -> 'goals', '[]'::jsonb)) with ordinality as t(g, o)
  where nullif(btrim(coalesce(g #>> '{scorer,name}', '')), '') is not null;
  get diagnostics v_goals = row_count;

  insert into public.league_penalties (match_id, seq, team, game_time, player_number, player_name, infraction, seconds)
  select p_match, row_number() over (order by o)::smallint,
         case g ->> 'side' when 'away' then v_away else v_home end,
         nullif(g ->> 'time', ''), nullif(g #>> '{player,number}', ''), btrim(g #>> '{player,name}'),
         nullif(g ->> 'infraction', ''), public.league_clock_seconds(g ->> 'minutes')
  from jsonb_array_elements(coalesce(p_data -> 'penalties', '[]'::jsonb)) with ordinality as t(g, o)
  where nullif(btrim(coalesce(g #>> '{player,name}', '')), '') is not null;
  get diagnostics v_pens = row_count;

  insert into public.league_lineups (match_id, seq, team, role, player_number, player_name)
  select p_match, row_number() over (order by o)::smallint,
         case g ->> 'side' when 'away' then v_away else v_home end,
         nullif(g ->> 'role', ''), nullif(g ->> 'number', ''), btrim(g ->> 'name')
  from jsonb_array_elements(coalesce(p_data -> 'roster', '[]'::jsonb)) with ordinality as t(g, o)
  where nullif(btrim(coalesce(g ->> 'name', '')), '') is not null;
  get diagnostics v_players = row_count;

  insert into public.league_match_reads (match_id, read_at, attempts, players, goals, penalties)
  values (p_match, now(), 1, v_players, v_goals, v_pens)
  on conflict (match_id) do update
    set read_at = now(), attempts = least(public.league_match_reads.attempts + 1, 100),
        players = excluded.players, goals = excluded.goals, penalties = excluded.penalties;
end
$$;

-- Totals per player for one championship. One row per team and name (compared without case and extra spaces).
-- Points are goals plus assists. Power play goals are the goals the league marks "PP". Penalty minutes are the
-- sum of the penalty times, rounded to whole minutes. Games are the games where the player is in a line-up or in
-- any goal or penalty line. Members only; a signed out visitor and a signed in person with no profile get nothing.
create function public.league_player_totals(p_championship integer)
returns table (
  team text, player_name text, player_number text,
  games integer, goals integer, assists integer, points integer, pp_goals integer, penalties integer, penalty_minutes integer
)
language sql stable security definer set search_path = '' as $$
  with m as (
    select id from public.league_matches where championship_id = p_championship and home_score is not null
  ),
  ev as (
    select g.match_id, g.team, g.scorer_name as name, g.scorer_number as num, 1 as goal, 0 as assist,
           case when g.kind like 'PP%' then 1 else 0 end as pp, 0 as pen, 0 as secs
    from public.league_goals g join m on m.id = g.match_id
    union all
    select g.match_id, g.team, g.assist1_name, g.assist1_number, 0, 1, 0, 0, 0
    from public.league_goals g join m on m.id = g.match_id where g.assist1_name is not null
    union all
    select g.match_id, g.team, g.assist2_name, g.assist2_number, 0, 1, 0, 0, 0
    from public.league_goals g join m on m.id = g.match_id where g.assist2_name is not null
    union all
    select p.match_id, p.team, p.player_name, p.player_number, 0, 0, 0, 1, p.seconds
    from public.league_penalties p join m on m.id = p.match_id
    union all
    select l.match_id, l.team, l.player_name, l.player_number, 0, 0, 0, 0, 0
    from public.league_lineups l join m on m.id = l.match_id
  )
  select (array_agg(ev.team order by ev.match_id desc))[1],
         (array_agg(ev.name order by ev.match_id desc))[1],
         (array_agg(ev.num order by ev.match_id desc) filter (where ev.num is not null))[1],
         count(distinct ev.match_id)::integer,
         sum(ev.goal)::integer,
         sum(ev.assist)::integer,
         (sum(ev.goal) + sum(ev.assist))::integer,
         sum(ev.pp)::integer,
         sum(ev.pen)::integer,
         round(sum(ev.secs) / 60.0)::integer
  from ev
  where (select public.is_member())
  group by public.team_key(ev.team), public.team_key(ev.name)
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.league_match_reads, public.league_goals, public.league_penalties, public.league_lineups
  from public, anon, authenticated;
revoke all on function public.league_details_pending(integer), public.league_details_claim(),
  public.league_details_finish(text), public.league_clock_seconds(text), public.league_store_details(integer, jsonb),
  public.league_player_totals(integer)
  from public, anon, authenticated;

grant select on public.league_match_reads, public.league_goals, public.league_penalties, public.league_lineups to authenticated;
grant select, insert, update, delete on public.league_match_reads, public.league_goals, public.league_penalties,
  public.league_lineups to service_role;
grant execute on function public.league_details_pending(integer), public.league_details_claim(),
  public.league_details_finish(text), public.league_store_details(integer, jsonb) to service_role;
grant execute on function public.league_player_totals(integer) to authenticated;

alter table public.league_match_reads enable row level security;
alter table public.league_goals enable row level security;
alter table public.league_penalties enable row level security;
alter table public.league_lineups enable row level security;

create policy league_match_reads_select on public.league_match_reads for select to authenticated
  using ((select public.is_member()));
create policy league_goals_select on public.league_goals for select to authenticated
  using ((select public.is_member()));
create policy league_penalties_select on public.league_penalties for select to authenticated
  using ((select public.is_member()));
create policy league_lineups_select on public.league_lineups for select to authenticated
  using ((select public.is_member()));

commit;
