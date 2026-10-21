-- Step 7: game statistics, ratings and MVP.
-- Staff enter each player's numbers for a game. After the game, everyone who played rates their
-- teammates from 1 to 10 and votes for one MVP. Votes are final. Who rated or voted for whom is
-- never returned to anyone: each person reads only their own ratings and vote.

-- Who played a game: recorded on time or late or, without a record, answered present.
-- Not granted to users, because it reads the recorded attendance that only staff may see.
create function public.took_part(p_event_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select r.status in ('on_time', 'late') from public.attendance_records r
      where r.event_id = p_event_id and r.user_id = p_user_id),
    (select a.answer = 'present' from public.attendance_answers a
      where a.event_id = p_event_id and a.user_id = p_user_id),
    false)
$$;

-- Tables ---------------------------------------------------------------

-- A player's numbers in one game. Goalies also have shots against and saves.
create table public.game_stats (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  goals smallint not null default 0 check (goals between 0 and 30),
  assists smallint not null default 0 check (assists between 0 and 30),
  penalty_minutes smallint not null default 0 check (penalty_minutes between 0 and 200),
  shots_against smallint check (shots_against between 0 and 150),
  saves smallint check (saves >= 0),
  primary key (event_id, user_id),
  check ((shots_against is null) = (saves is null)),
  check (saves <= shots_against)
);
create index game_stats_user_id_idx on public.game_stats (user_id);

create table public.game_ratings (
  event_id uuid not null references public.events (id) on delete cascade,
  rater_id uuid not null references public.profiles (id) on delete cascade,
  rated_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 10),
  primary key (event_id, rater_id, rated_id),
  check (rater_id <> rated_id)
);
create index game_ratings_rater_id_idx on public.game_ratings (rater_id);
create index game_ratings_rated_id_idx on public.game_ratings (rated_id, event_id);

create table public.mvp_votes (
  event_id uuid not null references public.events (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  voted_id uuid not null references public.profiles (id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (event_id, voter_id),
  check (voter_id <> voted_id)
);
create index mvp_votes_voter_id_idx on public.mvp_votes (voter_id);
create index mvp_votes_voted_id_idx on public.mvp_votes (voted_id, event_id);

-- Writing --------------------------------------------------------------

-- Staff replace all the numbers of one game at once. p_stats is a list of
-- {user_id, goals, assists, penalty_minutes, shots_against, saves} for people who played.
create function public.save_game_stats(p_event_id uuid, p_stats jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events where id = p_event_id and type = 'game') then
    raise exception 'not_a_game' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_stats) is distinct from 'array' then
    raise exception 'stats_invalid' using errcode = 'P0001';
  end if;
  delete from public.game_stats where event_id = p_event_id;
  insert into public.game_stats (event_id, user_id, goals, assists, penalty_minutes, shots_against, saves)
  select p_event_id, s.user_id, coalesce(s.goals, 0), coalesce(s.assists, 0),
         coalesce(s.penalty_minutes, 0), s.shots_against, s.saves
  from jsonb_to_recordset(p_stats) as s (
    user_id uuid, goals smallint, assists smallint, penalty_minutes smallint,
    shots_against smallint, saves smallint
  );
  if exists (
    select 1 from public.game_stats g
    where g.event_id = p_event_id and not public.took_part(p_event_id, g.user_id)
  ) then
    raise exception 'not_in_game' using errcode = 'P0001';
  end if;
end
$$;

-- A player who played sends their ratings and MVP vote once, after the game has ended.
-- p_ratings is a list of {user_id, rating}. Rating every teammate is not required; the MVP is.
create function public.submit_game_vote(p_event_id uuid, p_mvp_id uuid, p_ratings jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_ends timestamptz;
begin
  -- Only people who played can vote, which also rules out anyone without a profile.
  select ends_at into v_ends from public.events where id = p_event_id and type = 'game';
  if not found or not public.took_part(p_event_id, v_me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_ends > now() then
    raise exception 'game_not_over' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.mvp_votes where event_id = p_event_id and voter_id = v_me) then
    raise exception 'already_voted' using errcode = 'P0001';
  end if;
  if p_mvp_id is null or p_mvp_id = v_me or not public.took_part(p_event_id, p_mvp_id) then
    raise exception 'mvp_invalid' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_ratings, '[]')) <> 'array' or exists (
    select 1 from jsonb_to_recordset(coalesce(p_ratings, '[]')) as r (user_id uuid, rating smallint)
    where r.user_id is null or r.user_id = v_me or r.rating is null
       or r.rating not between 1 and 10 or not public.took_part(p_event_id, r.user_id)
  ) then
    raise exception 'rating_invalid' using errcode = 'P0001';
  end if;

  insert into public.mvp_votes (event_id, voter_id, voted_id) values (p_event_id, v_me, p_mvp_id);
  insert into public.game_ratings (event_id, rater_id, rated_id, rating)
  select p_event_id, v_me, r.user_id, r.rating
  from jsonb_to_recordset(coalesce(p_ratings, '[]')) as r (user_id uuid, rating smallint);
end
$$;

-- Reading --------------------------------------------------------------

-- One game: who played, their numbers, and the ratings and MVP votes they received.
-- Ratings and votes stay hidden from someone who played and has not voted yet.
-- my_rating is the caller's own rating of that player.
create function public.game_results(p_event_id uuid)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  jersey_number smallint,
  "position" text,
  played boolean,
  goals smallint,
  assists smallint,
  penalty_minutes smallint,
  shots_against smallint,
  saves smallint,
  rating_avg numeric,
  rating_count integer,
  mvp_votes integer,
  my_rating smallint
)
language sql stable security definer set search_path = '' as $$
  with game as (
    select e.id,
      public.is_staff()
        or exists (select 1 from public.mvp_votes v where v.event_id = e.id and v.voter_id = auth.uid())
        or not public.took_part(e.id, auth.uid()) as visible
    from public.events e
    where e.id = p_event_id and e.type = 'game' and public.can_see_event(e.id)
  ),
  people as (
    select r.user_id from public.attendance_records r
      where r.event_id = p_event_id and r.status in ('on_time', 'late')
    union
    select a.user_id from public.attendance_answers a
      where a.event_id = p_event_id and a.answer = 'present'
        and not exists (select 1 from public.attendance_records r
                        where r.event_id = a.event_id and r.user_id = a.user_id)
    union
    select s.user_id from public.game_stats s where s.event_id = p_event_id
    union
    select g.rated_id from public.game_ratings g where g.event_id = p_event_id
    union
    select v.voted_id from public.mvp_votes v where v.event_id = p_event_id
  )
  select p.id, p.first_name, p.last_name, p.jersey_number, p.position,
    public.took_part(p_event_id, p.id),
    s.goals, s.assists, s.penalty_minutes, s.shots_against, s.saves,
    case when game.visible then (select round(avg(g.rating), 1) from public.game_ratings g
                              where g.event_id = p_event_id and g.rated_id = p.id) end,
    case when game.visible then (select count(*)::integer from public.game_ratings g
                              where g.event_id = p_event_id and g.rated_id = p.id) end,
    case when game.visible then (select count(*)::integer from public.mvp_votes v
                              where v.event_id = p_event_id and v.voted_id = p.id) end,
    (select g.rating from public.game_ratings g
      where g.event_id = p_event_id and g.rater_id = auth.uid() and g.rated_id = p.id)
  from game
  cross join people x
  join public.profiles p on p.id = x.user_id
  left join public.game_stats s on s.event_id = p_event_id and s.user_id = p.id
  order by p.last_name, p.first_name
$$;

-- The games of a season (from 1 September, Italian time) that have started, optionally for one group.
create function public.season_games(p_season integer, p_group_id smallint)
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select e.id from public.events e
  where e.type = 'game'
    and p_season between 2000 and 2100
    and e.starts_at >= make_timestamptz(p_season, 9, 1, 0, 0, 0, 'Europe/Rome')
    and e.starts_at < make_timestamptz(p_season + 1, 9, 1, 0, 0, 0, 'Europe/Rome')
    and e.starts_at <= now()
    and (p_group_id is null or exists (
      select 1 from public.event_groups eg where eg.event_id = e.id and eg.group_id = p_group_id))
$$;

-- Season totals per player, for every member of the club. The MVP of a game is whoever has
-- the most votes; a tie counts for each of them. The average is over all ratings received.
create function public.season_player_stats(p_season integer, p_group_id smallint default null)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  jersey_number smallint,
  "position" text,
  games integer,
  goals integer,
  assists integer,
  points integer,
  penalty_minutes integer,
  shots_against integer,
  saves integer,
  mvp integer,
  rating_avg numeric
)
language sql stable security definer set search_path = '' as $$
  with games as (
    select id from public.season_games(p_season, p_group_id) as id
    where public.is_member()
  ),
  played as (
    select r.event_id, r.user_id from public.attendance_records r
      join games g on g.id = r.event_id
      where r.status in ('on_time', 'late')
    union
    select a.event_id, a.user_id from public.attendance_answers a
      join games g on g.id = a.event_id
      where a.answer = 'present'
        and not exists (select 1 from public.attendance_records r
                        where r.event_id = a.event_id and r.user_id = a.user_id)
  ),
  stats as (
    select s.user_id, sum(s.goals)::integer as goals, sum(s.assists)::integer as assists,
      sum(s.penalty_minutes)::integer as pim, sum(s.shots_against)::integer as sa,
      sum(s.saves)::integer as sv
    from public.game_stats s join games g on g.id = s.event_id
    group by s.user_id
  ),
  votes as (
    select v.event_id, v.voted_id, count(*) as n
    from public.mvp_votes v join games g on g.id = v.event_id
    group by v.event_id, v.voted_id
  ),
  mvps as (
    select v.voted_id as user_id, count(*)::integer as n from votes v
    where v.n = (select max(w.n) from votes w where w.event_id = v.event_id)
    group by v.voted_id
  ),
  ratings as (
    select g.rated_id as user_id, round(avg(g.rating), 1) as avg
    from public.game_ratings g join games x on x.id = g.event_id
    group by g.rated_id
  ),
  people as (
    select p.user_id, count(*)::integer as games from played p group by p.user_id
    union all
    select s.user_id, 0 from stats s where not exists (select 1 from played p where p.user_id = s.user_id)
  )
  select p.id, p.first_name, p.last_name, p.jersey_number, p.position,
    pe.games,
    coalesce(s.goals, 0), coalesce(s.assists, 0), coalesce(s.goals, 0) + coalesce(s.assists, 0),
    coalesce(s.pim, 0), s.sa, s.sv, coalesce(m.n, 0), ra.avg
  from people pe
  join public.profiles p on p.id = pe.user_id
  left join stats s on s.user_id = p.id
  left join mvps m on m.user_id = p.id
  left join ratings ra on ra.user_id = p.id
  order by 9 desc, 7 desc, p.last_name, p.first_name
$$;

-- Season results from the final scores: games, wins, draws, losses, goals for and against.
create function public.season_record(p_season integer, p_group_id smallint default null)
returns table (
  games integer,
  wins integer,
  draws integer,
  losses integer,
  goals_for integer,
  goals_against integer
)
language sql stable security definer set search_path = '' as $$
  select count(*)::integer,
    (count(*) filter (where e.score_for > e.score_against))::integer,
    (count(*) filter (where e.score_for = e.score_against))::integer,
    (count(*) filter (where e.score_for < e.score_against))::integer,
    coalesce(sum(e.score_for), 0)::integer,
    coalesce(sum(e.score_against), 0)::integer
  from public.events e
  where public.is_member()
    and e.score_for is not null
    and e.id in (select public.season_games(p_season, p_group_id))
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.game_stats, public.game_ratings, public.mvp_votes
  from public, anon, authenticated;
revoke all on function
  public.took_part(uuid, uuid),
  public.save_game_stats(uuid, jsonb),
  public.submit_game_vote(uuid, uuid, jsonb),
  public.game_results(uuid),
  public.season_games(integer, smallint),
  public.season_player_stats(integer, smallint),
  public.season_record(integer, smallint)
  from public, anon, authenticated;

grant select on public.game_stats, public.game_ratings, public.mvp_votes to authenticated;
grant execute on function
  public.save_game_stats(uuid, jsonb),
  public.submit_game_vote(uuid, uuid, jsonb),
  public.game_results(uuid),
  public.season_player_stats(integer, smallint),
  public.season_record(integer, smallint)
  to authenticated;

-- Row level security ---------------------------------------------------
-- No insert, update or delete grants: the functions above are the only way to write.

alter table public.game_stats enable row level security;
alter table public.game_ratings enable row level security;
alter table public.mvp_votes enable row level security;

-- The whole club sees the game numbers.
create policy game_stats_select on public.game_stats for select to authenticated
  using ((select public.is_member()));
-- Each person sees only the ratings and the vote they gave.
create policy game_ratings_select on public.game_ratings for select to authenticated
  using (rater_id = (select auth.uid()));
create policy mvp_votes_select on public.mvp_votes for select to authenticated
  using (voter_id = (select auth.uid()));
