-- Apply migration 0066 (club_derby_games) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0066 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regprocedure('public.tidy_league_event_groups()') is not null) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0066 was not applied.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'league_side') then
    raise exception 'Migration 0066 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- A league match between two of the club's teams becomes one game per team, each with its own groups,
-- attendance, line-up and votes, seen from that team's side (decision 166).
-- 1. A league game keeps which side of the match it is: home or away. A match has at most one game per side.
-- 2. A league game deleted by staff stays deleted for its own side only.
-- 3. The league reading and the tidying of 0065 use the side, so each team's group sits on its own game.
-- 4. The existing shared game is split: the away team's group moves to a new game of its own.

alter table public.events add column league_side text check (league_side in ('home', 'away'));
-- The side of an existing league game is the side of its first group, as the reading made it.
update public.events e set league_side =
  case when m.home = (select g.league_team from public.event_groups eg join public.groups g on g.id = eg.group_id
                      where eg.event_id = e.id order by g.id limit 1)
       then 'home' else 'away' end
from public.league_matches m
where m.id = e.league_match_id;
-- A league game the match has gone from still keeps a side.
update public.events set league_side = home_away where league_match_id is not null and league_side is null;
update public.events set league_side = 'home' where league_match_id is not null and league_side is null;
alter table public.events
  drop constraint events_league_match_id_key,
  add constraint events_league_match_side_key unique (league_match_id, league_side);

-- A league game always has a side (home unless it is given), and an event outside the league has none.
create function public.events_league_side() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.league_match_id is null then
    new.league_side := null;
  elsif new.league_side is null then
    new.league_side := 'home';
  end if;
  return new;
end
$$;
create trigger events_league_side
  before insert or update of league_match_id, league_side on public.events
  for each row execute function public.events_league_side();

alter table public.league_ignored add column side text check (side in ('home', 'away'));
-- A game deleted before this change counts as deleted on both sides.
alter table public.league_ignored drop constraint league_ignored_pkey;
insert into public.league_ignored (match_id, side) select match_id, 'away' from public.league_ignored where side is null;
update public.league_ignored set side = 'home' where side is null;
alter table public.league_ignored alter column side set not null, add primary key (match_id, side);

create or replace function public.ignore_deleted_league_game() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.league_match_id is not null then
    insert into public.league_ignored (match_id, side) values (old.league_match_id, old.league_side) on conflict do nothing;
  end if;
  return old;
end
$$;

create or replace function public.apply_league_matches() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_event uuid;
  v_first smallint;
  v_created integer := 0;
begin
  for r in
    select m.*, g.id as group_id, (m.home = g.league_team) as at_home,
           case when m.home = g.league_team then 'home' else 'away' end as side
    from public.league_matches m
    join public.groups g on g.league_team is not null
      and (m.home = g.league_team or m.away = g.league_team)
      and m.championship_id = any (g.league_championships)
    where m.starts_at > now() - interval '120 days'
      and not exists (select 1 from public.league_ignored i
                      where i.match_id = m.id and i.side = case when m.home = g.league_team then 'home' else 'away' end)
    order by m.id, g.id
  loop
    v_event := null;
    select id into v_event from public.events where league_match_id = r.id and league_side = r.side;
    if v_event is null then
      select e.id into v_event
      from public.events e
      join public.event_groups eg on eg.event_id = e.id and eg.group_id = r.group_id
      where e.type = 'game' and e.league_match_id is null
        and (e.starts_at at time zone 'Europe/Rome')::date = (r.starts_at at time zone 'Europe/Rome')::date
      order by abs(extract(epoch from e.starts_at - r.starts_at))
      limit 1;
      if v_event is not null then
        update public.events set league_match_id = r.id, league_side = r.side where id = v_event;
      end if;
    end if;

    if v_event is null then
      insert into public.events (type, title, starts_at, ends_at, meetup_at, venue, opponent, home_away,
                                 score_for, score_against, league_match_id, league_side)
      values ('game', 'Partita', r.starts_at, r.starts_at + interval '90 minutes', r.starts_at - interval '60 minutes',
              public.pretty_name(r.venue),
              public.pretty_name(case when r.at_home then r.away else r.home end),
              case when r.at_home then 'home' else 'away' end,
              case when r.at_home then r.home_score else r.away_score end,
              case when r.at_home then r.away_score else r.home_score end,
              r.id, r.side)
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

-- As in 0065, and a group must also play on the game's own side of the match.
create or replace function public.tidy_league_event_groups() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
  v_dropped integer := 0;
  v_n integer;
begin
  for v_event in
    select e.id from public.events e
    where e.league_match_id is not null and e.ends_at > now()
  loop
    delete from public.event_groups eg
    using public.events e, public.league_matches m, public.groups g
    where eg.event_id = v_event and e.id = eg.event_id and m.id = e.league_match_id and g.id = eg.group_id
      and not (g.league_team is not null
               and (case when e.league_side = 'home' then m.home else m.away end) = g.league_team
               and m.championship_id = any (g.league_championships))
      -- The game keeps at least one group: when none matches, the groups stay as they are.
      and exists (
        select 1 from public.event_groups k join public.groups kg on kg.id = k.group_id
        where k.event_id = v_event
          and kg.league_team is not null
          and (case when e.league_side = 'home' then m.home else m.away end) = kg.league_team
          and m.championship_id = any (kg.league_championships));
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_dropped := v_dropped + v_n;
      perform public.clear_uninvited(v_event);
    end if;
  end loop;
  return v_dropped;
end
$$;
revoke all on function public.tidy_league_event_groups(), public.apply_league_matches(), public.events_league_side() from public, anon, authenticated;

-- Split the shared games that exist now: the other team leaves the game, then gets its own.
select public.tidy_league_event_groups();
select public.apply_league_matches();

commit;
