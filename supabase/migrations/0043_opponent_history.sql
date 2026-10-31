-- Previous results against the same opponent (V1). For a game, the last meetings with the same team: the
-- club's own games that have a final score, and league games already stored in which one side was one of
-- the club's league teams and the other was this opponent (a league game that already became a club game is
-- counted once). The score is written from the club's point of view. Any member may read it, as with the
-- season results. Names are compared without case and spaces.

create function public.opponent_history(p_event_id uuid)
returns table (
  starts_at timestamptz,
  home_away text,
  score_for smallint,
  score_against smallint,
  source text
)
language sql stable security definer set search_path = '' as $$
  with me as (
    select e.id, lower(trim(e.opponent)) as opp, e.starts_at
    from public.events e
    where e.id = p_event_id and e.type = 'game' and e.opponent is not null and public.is_member()
  ),
  ours as (
    select lower(trim(g.league_team)) as team from public.groups g where g.league_team is not null
  ),
  club as (
    select e.starts_at, e.home_away, e.score_for, e.score_against, 'club'::text as source
    from public.events e, me
    where e.type = 'game' and e.id <> me.id and lower(trim(e.opponent)) = me.opp
      and e.score_for is not null and e.cancelled_at is null and e.starts_at < now()
  ),
  league as (
    select lm.starts_at,
           case when lower(trim(lm.home)) = me.opp then 'away' else 'home' end as home_away,
           (case when lower(trim(lm.home)) = me.opp then lm.away_score else lm.home_score end) as score_for,
           (case when lower(trim(lm.home)) = me.opp then lm.home_score else lm.away_score end) as score_against,
           'league'::text as source
    from public.league_matches lm, me
    where lm.home_score is not null and lm.starts_at < now()
      and not exists (select 1 from public.events x where x.league_match_id = lm.id)
      and ((lower(trim(lm.home)) = me.opp and lower(trim(lm.away)) in (select team from ours))
        or (lower(trim(lm.away)) = me.opp and lower(trim(lm.home)) in (select team from ours)))
  )
  select * from (select * from club union all select * from league) h
  order by h.starts_at desc
  limit 5
$$;

revoke all on function public.opponent_history(uuid) from public, anon, authenticated;
grant execute on function public.opponent_history(uuid) to authenticated;
