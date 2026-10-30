-- The results of a season, game by game, for the team statistics: the games that have started and
-- have a final score, optionally for one group, oldest first. Every member of the club may read them,
-- as with the season record.

create function public.season_results(p_season integer, p_group_id smallint default null)
returns table (
  event_id uuid,
  starts_at timestamptz,
  opponent text,
  home_away text,
  score_for smallint,
  score_against smallint
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.starts_at, e.opponent, e.home_away, e.score_for, e.score_against
  from public.events e
  where public.is_member()
    and e.score_for is not null
    and e.id in (select public.season_games(p_season, p_group_id))
  order by e.starts_at, e.id
$$;

revoke all on function public.season_results(integer, smallint) from public, anon, authenticated;
grant execute on function public.season_results(integer, smallint) to authenticated;
