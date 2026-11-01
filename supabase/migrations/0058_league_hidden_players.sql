-- Hide a league player from the championship statistics (privacy request, decisions 135 and 139). The game rows the
-- league publishes stay as they are in the database, because they are public league data; only the display is
-- removed: a hidden player is left out of the four tabs (Marcatori, Assistenti, Punti, Penalità) and of the games
-- played count, in the totals and in the tabs. Only the board adds or removes a row, through the functions below.
-- The table holds only what is needed to hide the person: the team and the name as the league writes them, the same
-- two names in the form the comparison uses (lower case, trimmed, runs of spaces as one, as in the opponent history,
-- migration 0052), who hid the player and when. Members cannot read the table.

create table public.league_hidden_players (
  team_key text not null,
  name_key text not null,
  team text not null check (length(btrim(team)) between 1 and 120),
  player_name text not null check (length(btrim(player_name)) between 1 and 120),
  hidden_by uuid references public.profiles (id) on delete set null,
  hidden_at timestamptz not null default now(),
  primary key (team_key, name_key)
);
create index league_hidden_players_hidden_by_idx on public.league_hidden_players (hidden_by);

alter table public.league_hidden_players enable row level security;
revoke all on public.league_hidden_players from public, anon, authenticated;

create function public.hide_league_player(p_team text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_board() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_team is null or p_name is null or length(btrim(p_team)) not between 1 and 120 or length(btrim(p_name)) not between 1 and 120 then
    raise exception 'league_hidden_invalid' using errcode = 'P0001';
  end if;
  insert into public.league_hidden_players (team_key, name_key, team, player_name, hidden_by)
  values (public.team_key(p_team), public.team_key(p_name), btrim(p_team), btrim(p_name), auth.uid())
  on conflict (team_key, name_key) do nothing;
end
$$;

create function public.show_league_player(p_team text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_board() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.league_hidden_players
  where team_key = public.team_key(p_team) and name_key = public.team_key(p_name);
end
$$;

-- The list the board sees under Impostazioni.
create function public.league_hidden_list()
returns table (team text, player_name text, hidden_at timestamptz, hidden_by_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_board() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select h.team, h.player_name, h.hidden_at, nullif(btrim(coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, '')), '')
  from public.league_hidden_players h left join public.profiles p on p.id = h.hidden_by
  order by h.hidden_at desc, h.team, h.player_name;
end
$$;

-- The names the league wrote for one team, so the board picks the spelling instead of typing it (hidden ones included).
create function public.league_team_players(p_team text)
returns table (player_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_board() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select (array_agg(n.name order by n.match_id desc))[1]
  from (
    select g.match_id, g.team, g.scorer_name as name from public.league_goals g
    union all select g.match_id, g.team, g.assist1_name from public.league_goals g where g.assist1_name is not null
    union all select g.match_id, g.team, g.assist2_name from public.league_goals g where g.assist2_name is not null
    union all select p.match_id, p.team, p.player_name from public.league_penalties p
    union all select l.match_id, l.team, l.player_name from public.league_lineups l
  ) n
  where public.team_key(n.team) = public.team_key(p_team)
  group by public.team_key(n.name)
  order by 1
  limit 500;
end
$$;

-- The statistics leave the hidden players out.
create or replace function public.league_player_totals(p_championship integer)
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
    and not exists (
      select 1 from public.league_hidden_players h
      where h.team_key = public.team_key(ev.team) and h.name_key = public.team_key(ev.name)
    )
  group by public.team_key(ev.team), public.team_key(ev.name)
$$;

revoke all on function public.hide_league_player(text, text), public.show_league_player(text, text),
  public.league_hidden_list(), public.league_team_players(text) from public, anon, authenticated;
grant execute on function public.hide_league_player(text, text), public.show_league_player(text, text),
  public.league_hidden_list(), public.league_team_players(text) to authenticated;
