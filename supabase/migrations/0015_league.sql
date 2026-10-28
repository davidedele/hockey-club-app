-- Championship page: fixtures, results and standings of the Lega Hockey Libertas, read from the
-- league's website by the league-sync server function, and the club's own league games turned
-- into events of the right group. Only the server function (service role) writes these tables.

create table public.league_championships (
  id integer primary key,
  name text not null,
  position smallint not null default 0
);

-- One row per league match, keyed by the league's own match number. Scores stay empty until played.
create table public.league_matches (
  id integer primary key,
  championship_id integer references public.league_championships (id) on delete set null,
  championship text not null,
  starts_at timestamptz not null,
  home text not null,
  away text not null,
  home_score smallint check (home_score >= 0),
  away_score smallint check (away_score >= 0),
  venue text,
  seen_at timestamptz not null default now(),
  check ((home_score is null) = (away_score is null))
);
create index league_matches_starts_at_idx on public.league_matches (starts_at);
create index league_matches_championship_id_idx on public.league_matches (championship_id);

create table public.league_standings (
  championship_id integer not null references public.league_championships (id) on delete cascade,
  position smallint not null,
  team text not null,
  played smallint not null,
  points smallint not null,
  goal_diff smallint not null,
  primary key (championship_id, position)
);

-- When the website was last read, and how it went.
create table public.league_sync (
  id boolean primary key default true check (id),
  started_at timestamptz,
  finished_at timestamptz,
  ok boolean,
  message text
);
insert into public.league_sync (id) values (true);

-- The board says which league team each group is, and in which competitions it plays.
alter table public.groups
  add column league_team text check (league_team is null or length(trim(league_team)) between 1 and 60),
  add column league_championships integer[] not null default '{}';
grant update (league_team, league_championships) on public.groups to authenticated;

-- A game created from the league keeps the league's match number.
alter table public.events add column league_match_id integer unique;

-- League games that staff deleted from the app are not created again.
create table public.league_ignored (
  match_id integer primary key
);

create function public.ignore_deleted_league_game() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.league_match_id is not null then
    insert into public.league_ignored (match_id) values (old.league_match_id) on conflict do nothing;
  end if;
  return old;
end
$$;
create trigger events_ignore_league_game
  after delete on public.events
  for each row execute function public.ignore_deleted_league_game();

-- "HC VARESE KILLER BEES" as "HC Varese Killer Bees", "PALASESTO" as "Palasesto".
create function public.pretty_name(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p is null or trim(p) = '' then null
    else regexp_replace(initcap(lower(trim(p))), '^Hc ', 'HC ') end
$$;

-- Turns the club's league matches into events. A match already linked is updated; otherwise a game
-- of the same group on the same day is linked; otherwise a new game is created. Duration and meetup
-- keep what staff set. A result from the league fills the score. Returns how many games were created.
-- A match between two of the club's own teams is shown to both groups, seen from the first group.
create function public.apply_league_matches() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_event uuid;
  v_first smallint;
  v_created integer := 0;
begin
  for r in
    select m.*, g.id as group_id, (m.home = g.league_team) as at_home
    from public.league_matches m
    join public.groups g on g.league_team is not null
      and (m.home = g.league_team or m.away = g.league_team)
      and m.championship_id = any (g.league_championships)
    where m.starts_at > now() - interval '120 days'
      and not exists (select 1 from public.league_ignored i where i.match_id = m.id)
    order by m.id, g.id
  loop
    v_event := null;
    select id into v_event from public.events where league_match_id = r.id;
    if v_event is null then
      select e.id into v_event
      from public.events e
      join public.event_groups eg on eg.event_id = e.id and eg.group_id = r.group_id
      where e.type = 'game' and e.league_match_id is null
        and (e.starts_at at time zone 'Europe/Rome')::date = (r.starts_at at time zone 'Europe/Rome')::date
      order by abs(extract(epoch from e.starts_at - r.starts_at))
      limit 1;
      if v_event is not null then
        update public.events set league_match_id = r.id where id = v_event;
      end if;
    end if;

    if v_event is null then
      insert into public.events (type, title, starts_at, ends_at, meetup_at, venue, opponent, home_away,
                                 score_for, score_against, league_match_id)
      values ('game', 'Partita', r.starts_at, r.starts_at + interval '90 minutes', r.starts_at - interval '60 minutes',
              public.pretty_name(r.venue),
              public.pretty_name(case when r.at_home then r.away else r.home end),
              case when r.at_home then 'home' else 'away' end,
              case when r.at_home then r.home_score else r.away_score end,
              case when r.at_home then r.away_score else r.home_score end,
              r.id)
      returning id into v_event;
      insert into public.event_groups (event_id, group_id) values (v_event, r.group_id);
      v_created := v_created + 1;
      continue;
    end if;

    insert into public.event_groups (event_id, group_id) values (v_event, r.group_id) on conflict do nothing;
    select min(group_id) into v_first from public.event_groups where event_id = v_event;
    if r.group_id = v_first then
      update public.events e set
        starts_at = r.starts_at,
        ends_at = r.starts_at + (e.ends_at - e.starts_at),
        meetup_at = case when e.meetup_at is null then null else r.starts_at - (e.starts_at - e.meetup_at) end,
        venue = coalesce(public.pretty_name(r.venue), e.venue),
        opponent = public.pretty_name(case when r.at_home then r.away else r.home end),
        home_away = case when r.at_home then 'home' else 'away' end,
        score_for = coalesce(case when r.at_home then r.home_score else r.away_score end, e.score_for),
        score_against = coalesce(case when r.at_home then r.away_score else r.home_score end, e.score_against)
      where e.id = v_event;
    end if;
  end loop;
  return v_created;
end
$$;

-- Only one reading of the website at a time, and not more often than every three hours unless staff ask.
create function public.league_sync_claim(p_force boolean default false) returns boolean
language sql security definer set search_path = '' as $$
  update public.league_sync set started_at = now(), message = null
  where id
    and (started_at is null or finished_at >= started_at or started_at < now() - interval '10 minutes')
    and (p_force or finished_at is null or finished_at < now() - interval '3 hours')
  returning true
$$;

create function public.league_sync_finish(p_ok boolean, p_message text default null) returns void
language sql security definer set search_path = '' as $$
  update public.league_sync set finished_at = now(), ok = p_ok, message = left(p_message, 500) where id
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.league_championships, public.league_matches, public.league_standings,
  public.league_sync, public.league_ignored from public, anon, authenticated;
revoke all on function public.ignore_deleted_league_game(), public.apply_league_matches(),
  public.league_sync_claim(boolean), public.league_sync_finish(boolean, text)
  from public, anon, authenticated;

grant select on public.league_championships, public.league_matches, public.league_standings,
  public.league_sync to authenticated;
grant select, insert, update, delete on public.league_championships, public.league_matches,
  public.league_standings to service_role;
grant select on public.league_sync to service_role;
grant execute on function public.apply_league_matches(), public.league_sync_claim(boolean),
  public.league_sync_finish(boolean, text) to service_role;

alter table public.league_championships enable row level security;
alter table public.league_matches enable row level security;
alter table public.league_standings enable row level security;
alter table public.league_sync enable row level security;
alter table public.league_ignored enable row level security;

create policy league_championships_select on public.league_championships for select to authenticated
  using ((select public.is_member()));
create policy league_matches_select on public.league_matches for select to authenticated
  using ((select public.is_member()));
create policy league_standings_select on public.league_standings for select to authenticated
  using ((select public.is_member()));
create policy league_sync_select on public.league_sync for select to authenticated
  using ((select public.is_member()));
