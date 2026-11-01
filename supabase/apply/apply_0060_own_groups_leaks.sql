-- Apply migration 0060 (own_groups_leaks) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0060 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regprocedure('public.opponent_history(uuid)') is not null and to_regprocedure('public.game_prediction_list(uuid)') is not null) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0060 was not applied.';
  end if;
  if to_regprocedure('public.sees_group(smallint)') is not null then
    raise exception 'Migration 0060 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Two leaks found in the audit of 1 November (decision 131: in the Giocatore view a person sees only the things of
-- their own groups). Nothing else changes: same columns, same callers, staff are not limited.
--   1. opponent_history: only for an event the person may see; the club games come only from events the person may
--      see; the league games only against the league teams of the person's own groups.
--   2. game_prediction_list and the guesses table: only for a game the person may see.
-- The older team results (season_games and what uses it) stay as they are: test 28 states that a member sees the games
-- of every group there, and the screens already offer only the person's own groups. Davide decides if that changes.

-- Does the caller belong to this group? Staff: every group.
create function public.sees_group(p_group_id smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member() and (
    public.is_staff()
    or exists (select 1 from public.group_members m where m.group_id = p_group_id and m.user_id = auth.uid()))
$$;
revoke all on function public.sees_group(smallint) from public, anon, authenticated;
grant execute on function public.sees_group(smallint) to authenticated;

create or replace function public.opponent_history(p_event_id uuid)
returns table (
  starts_at timestamptz,
  home_away text,
  score_for smallint,
  score_against smallint,
  source text
)
language sql stable security definer set search_path = '' as $$
  with me as (
    select e.id, public.team_key(e.opponent) as opp, e.starts_at
    from public.events e
    where e.id = p_event_id and e.type = 'game' and e.opponent is not null and public.is_member()
      and public.can_see_event(e.id)
  ),
  ours as (
    select public.team_key(g.league_team) as team from public.groups g
    where g.league_team is not null and public.sees_group(g.id)
  ),
  club as (
    select e.starts_at, e.home_away, e.score_for, e.score_against, 'club'::text as source
    from public.events e, me
    where e.type = 'game' and e.id <> me.id and public.team_key(e.opponent) = me.opp
      and e.score_for is not null and e.cancelled_at is null and e.starts_at < now()
      and public.can_see_event(e.id)
  ),
  league as (
    select lm.starts_at,
           case when public.team_key(lm.home) = me.opp then 'away' else 'home' end as home_away,
           (case when public.team_key(lm.home) = me.opp then lm.away_score else lm.home_score end) as score_for,
           (case when public.team_key(lm.home) = me.opp then lm.home_score else lm.away_score end) as score_against,
           'league'::text as source
    from public.league_matches lm, me
    where lm.home_score is not null and lm.starts_at < now()
      and not exists (select 1 from public.events x where x.league_match_id = lm.id)
      and ((public.team_key(lm.home) = me.opp and public.team_key(lm.away) in (select team from ours))
        or (public.team_key(lm.away) = me.opp and public.team_key(lm.home) in (select team from ours)))
  )
  select * from (select * from club union all select * from league) h
  order by h.starts_at desc
  limit 5
$$;

create or replace function public.game_prediction_list(p_event_id uuid)
returns table (user_id uuid, first_name text, last_name text, pred_for smallint, pred_against smallint, points integer)
language sql stable security definer set search_path = '' as $$
  select p.user_id, pr.first_name, pr.last_name, p.pred_for, p.pred_against,
         case when e.score_for is null then null
              else public.prediction_points(p.pred_for, p.pred_against, e.score_for, e.score_against) end
  from public.game_predictions p
  join public.events e on e.id = p.event_id
  join public.profiles pr on pr.id = p.user_id
  where p.event_id = p_event_id and public.is_member() and e.starts_at <= now()
    and public.can_see_event(p.event_id)
  order by 6 desc nulls last, pr.last_name, pr.first_name
$$;

drop policy game_predictions_select on public.game_predictions;
create policy game_predictions_select on public.game_predictions for select to authenticated
  using ((select public.is_member()) and (
    user_id = (select auth.uid())
    or ((select public.event_started(event_id)) and (select public.can_see_event(event_id)))));

commit;
