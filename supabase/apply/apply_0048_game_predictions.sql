-- Apply migration 0048 (game_predictions) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0048 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regprocedure('public.my_milestones()') is not null) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0048 was not applied.';
  end if;
  if to_regclass('public.game_predictions') is not null then
    raise exception 'Migration 0048 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Match predictions (V7). Before a club game, each member of the game's groups guesses the final score
-- (ours first). A guess can be made and changed until the game starts, never after. Nobody else can read
-- a guess before the game starts; from the start everybody in the club can. Points are worked out from
-- the final score when staff have entered it:
--   10 minus the sum of the two goal differences (never below 0), plus 3 when the winner (or the draw) is right.
-- So an exact guess is 13 points. The season table counts the games of the season with a final score;
-- people whose data was deleted are not in it.

create table public.game_predictions (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  pred_for smallint not null check (pred_for between 0 and 30),
  pred_against smallint not null check (pred_against between 0 and 30),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index game_predictions_user_id_idx on public.game_predictions (user_id);

-- True once the game has started (security definer: it does not depend on who may see the event).
create function public.event_started(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.starts_at <= now() from public.events e where e.id = p_event_id), false)
$$;

create function public.prediction_points(p_for integer, p_against integer, p_score_for integer, p_score_against integer)
returns integer
language sql immutable set search_path = '' as $$
  select greatest(0, 10 - abs(p_for - p_score_for) - abs(p_against - p_score_against))
       + case when sign(p_for - p_against) = sign(p_score_for - p_score_against) then 3 else 0 end
$$;

-- A member makes or changes a guess. Only for a game that has not started and is not cancelled, in a group of the person.
create function public.set_prediction(p_event_id uuid, p_for smallint, p_against smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_for is null or p_against is null or p_for not between 0 and 30 or p_against not between 0 and 30 then
    raise exception 'prediction_invalid' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.events e
                 where e.id = p_event_id and e.type = 'game' and e.cancelled_at is null and e.starts_at > now())
     or not public.in_event_groups(p_event_id) then
    raise exception 'prediction_closed' using errcode = 'P0001';
  end if;
  insert into public.game_predictions (event_id, user_id, pred_for, pred_against)
  values (p_event_id, v_me, p_for, p_against)
  on conflict (event_id, user_id) do update set pred_for = excluded.pred_for, pred_against = excluded.pred_against, updated_at = now();
end
$$;

-- The guesses of one game with their points, only once the game has started.
create function public.game_prediction_list(p_event_id uuid)
returns table (user_id uuid, first_name text, last_name text, pred_for smallint, pred_against smallint, points integer)
language sql stable security definer set search_path = '' as $$
  select p.user_id, pr.first_name, pr.last_name, p.pred_for, p.pred_against,
         case when e.score_for is null then null
              else public.prediction_points(p.pred_for, p.pred_against, e.score_for, e.score_against) end
  from public.game_predictions p
  join public.events e on e.id = p.event_id
  join public.profiles pr on pr.id = p.user_id
  where p.event_id = p_event_id and public.is_member() and e.starts_at <= now()
  order by 6 desc nulls last, pr.last_name, pr.first_name
$$;

-- The season table.
create function public.prediction_table(p_season integer)
returns table (user_id uuid, first_name text, last_name text, predictions integer, exact integer, points integer)
language sql stable security definer set search_path = '' as $$
  select p.user_id, pr.first_name, pr.last_name, count(*)::integer,
         (count(*) filter (where p.pred_for = e.score_for and p.pred_against = e.score_against))::integer,
         sum(public.prediction_points(p.pred_for, p.pred_against, e.score_for, e.score_against))::integer
  from public.game_predictions p
  join public.events e on e.id = p.event_id
  join public.profiles pr on pr.id = p.user_id and pr.deleted_at is null
  where public.is_member()
    and e.type = 'game' and e.cancelled_at is null and e.score_for is not null
    and p_season between 2000 and 2100
    and e.starts_at >= make_timestamptz(p_season, 9, 1, 0, 0, 0, 'Europe/Rome')
    and e.starts_at < make_timestamptz(p_season + 1, 9, 1, 0, 0, 0, 'Europe/Rome')
  group by p.user_id, pr.first_name, pr.last_name
  order by 6 desc, 5 desc, pr.last_name, pr.first_name
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.game_predictions from public, anon, authenticated;
revoke all on function public.event_started(uuid), public.prediction_points(integer, integer, integer, integer),
  public.set_prediction(uuid, smallint, smallint), public.game_prediction_list(uuid), public.prediction_table(integer)
  from public, anon, authenticated;
grant select on public.game_predictions to authenticated;
grant execute on function public.event_started(uuid), public.prediction_points(integer, integer, integer, integer),
  public.set_prediction(uuid, smallint, smallint), public.game_prediction_list(uuid), public.prediction_table(integer)
  to authenticated;

alter table public.game_predictions enable row level security;
-- Your own guess any time; other people's only once the game has started.
create policy game_predictions_select on public.game_predictions for select to authenticated
  using ((select public.is_member()) and (user_id = (select auth.uid()) or (select public.event_started(event_id))));

commit;
