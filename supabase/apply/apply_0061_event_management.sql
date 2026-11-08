-- Apply 0061 to the test project after migrations 0036 to 0060, before deploying this app version.
-- Run the whole file. The guard stops on the wrong project or a repeated application.
begin;
do $guard$
begin
  if to_regprocedure('public.sees_group(smallint)') is null or to_regprocedure('public.can_see_plan(uuid)') is null then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0061 was not applied.';
  end if;
  if to_regprocedure('public.save_event(uuid,jsonb,text,integer,integer)') is not null then
    raise exception 'Migration 0061 is already applied: nothing was changed.';
  end if;
end
$guard$;

-- Club calendar consultation, detail visibility and atomic series management.
alter table public.events
  add column groups_pending boolean not null default false,
  add column participant_details text[] not null default array['presence','lineup','plan','discussion','game'],
  add column observer_details text[] not null default '{}',
  add constraint event_pending_training check (not groups_pending or type = 'training'),
  add constraint event_participant_details check (participant_details <@ array['presence','lineup','plan','discussion','game']::text[]),
  add constraint event_observer_details check (observer_details <@ array['presence','lineup','plan','discussion','game']::text[]);

-- Calendar access never grants participation or access to optional details.
alter policy events_select on public.events using (public.is_member());
alter policy event_groups_select on public.event_groups using (public.is_member());

create function public.event_detail_allowed(p_event_id uuid, p_detail text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member() and exists (
    select 1 from public.events e where e.id = p_event_id and (
      public.is_staff() or p_detail = any(case when public.in_event_groups(e.id)
        then e.participant_details else e.observer_details end)))
$$;
revoke all on function public.event_detail_allowed(uuid,text) from public, anon, authenticated;
grant execute on function public.event_detail_allowed(uuid,text) to authenticated;

create or replace function public.keep_one_event_group() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.events where id = old.event_id and not groups_pending)
     and not exists (select 1 from public.event_groups where event_id = old.event_id and group_id <> old.group_id) then
    raise exception 'event_needs_group' using errcode = 'P0001';
  end if;
  return old;
end
$$;

alter policy event_lineup_select on public.event_lineup using (public.event_detail_allowed(event_id,'lineup'));
alter policy event_messages_select on public.event_messages using (public.event_detail_allowed(event_id,'discussion'));
alter policy event_message_seen_select on public.event_message_seen using (public.event_detail_allowed(event_id,'discussion'));
alter policy game_stats_select on public.game_stats using (public.event_detail_allowed(event_id,'game'));

create or replace function public.can_see_plan(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.event_detail_allowed(p_event_id,'plan') and (
    public.is_staff() or exists (select 1 from public.events e left join public.event_plan p on p.event_id=e.id
      where e.id=p_event_id and (e.ends_at>now() or coalesce(p.visible_after,false))))
$$;

create or replace function public.event_present_people(p_event_id uuid)
returns table (user_id uuid, first_name text, last_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.last_name
  from public.profiles p
  where public.event_detail_allowed(p_event_id,'presence')
    and case when public.event_presence_recorded(p_event_id) then
      exists (select 1 from public.attendance_records r where r.event_id = p_event_id and r.user_id = p.id and r.status in ('on_time', 'late'))
    else
      exists (select 1 from public.attendance_answers a where a.event_id = p_event_id and a.user_id = p.id and a.answer = 'present')
      and not exists (select 1 from public.attendance_records r where r.event_id = p_event_id and r.user_id = p.id and r.status = 'not_called_up')
    end
  order by p.last_name, p.first_name
$$;

create or replace function public.event_presence_recorded(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.event_detail_allowed(p_event_id,'presence')
    and exists (select 1 from public.events e where e.id = p_event_id and e.ends_at <= now())
    and exists (
      select 1 from public.attendance_records r
      where r.event_id = p_event_id and r.status <> 'not_called_up'
    )
$$;

create or replace function public.game_results(p_event_id uuid)
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
    where e.id = p_event_id and e.type = 'game' and public.event_detail_allowed(e.id,'game')
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

create or replace function public.event_present_counts(p_event_ids uuid[])
returns table (event_id uuid, present bigint)
language sql stable security definer set search_path = '' as $$
  select e.id,
    case when public.event_presence_recorded(e.id) then
      (select count(*) from public.attendance_records r where r.event_id = e.id and r.status in ('on_time', 'late'))
    else
      (select count(*) from public.attendance_answers a
        where a.event_id = e.id and a.answer = 'present'
          and not exists (
            select 1 from public.attendance_records r
            where r.event_id = e.id and r.user_id = a.user_id and r.status = 'not_called_up'
          ))
    end::bigint
  from public.events e
  where e.id = any(p_event_ids)
    and public.event_detail_allowed(e.id,'presence')
$$;

create or replace function public.post_event_message(p_event_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) or not public.event_detail_allowed(p_event_id,'discussion') or not (public.is_staff() or public.in_event_groups(p_event_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(v_body) = 0 then
    raise exception 'message_empty' using errcode = 'P0001';
  end if;
  if length(v_body) > 1000 then
    raise exception 'message_too_long' using errcode = 'P0001';
  end if;
  -- The real clock, so a message and a read mark made one after the other never tie.
  insert into public.event_messages (event_id, user_id, body, created_at)
  values (p_event_id, auth.uid(), v_body, clock_timestamp())
  returning id into v_id;
  insert into public.event_message_seen (event_id, user_id, seen_at)
  values (p_event_id, auth.uid(), clock_timestamp())
  on conflict (event_id, user_id) do update set seen_at = clock_timestamp();
  return v_id;
end
$$;

create or replace function public.mark_event_seen(p_event_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) or not public.event_detail_allowed(p_event_id,'discussion') or not (public.is_staff() or public.in_event_groups(p_event_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.event_message_seen (event_id, user_id, seen_at)
  values (p_event_id, auth.uid(), clock_timestamp())
  on conflict (event_id, user_id) do update set seen_at = clock_timestamp();
end
$$;

create or replace function public.my_event_threads()
returns table (
  event_id uuid,
  last_message_at timestamptz,
  messages bigint,
  unread bigint,
  archived boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select m.event_id,
         max(m.created_at),
         count(*),
         count(*) filter (where m.user_id <> auth.uid() and (s.seen_at is null or m.created_at > s.seen_at)),
         max(m.created_at) < now() - interval '15 days'
  from public.event_messages m
  left join public.event_message_seen s on s.event_id = m.event_id and s.user_id = auth.uid()
  where public.event_detail_allowed(m.event_id,'discussion') and (public.is_staff() or public.in_event_groups(m.event_id))
  group by m.event_id;
end
$$;

create function public.event_scope(p_event_id uuid, p_scope text default 'one')
returns table(id uuid, title text, starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_event public.events;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('one','following','future') then raise exception 'scope_invalid'; end if;
  select * into v_event from public.events e where e.id=p_event_id;
  if not found then raise exception 'not_found'; end if;
  if p_scope <> 'one' and v_event.series_id is null then raise exception 'scope_invalid'; end if;
  return query select e.id,e.title,e.starts_at,e.ends_at from public.events e
    where (p_scope='one' and e.id=p_event_id) or
      (p_scope<>'one' and e.series_id=v_event.series_id and e.starts_at>now()
       and (p_scope='future' or e.starts_at>=v_event.starts_at))
    order by e.starts_at,e.id;
end
$$;
revoke all on function public.event_scope(uuid,text) from public,anon,authenticated;
grant execute on function public.event_scope(uuid,text) to authenticated;

create function public.save_event(p_event_id uuid, p_changes jsonb, p_scope text default 'one',
  p_repeat_weeks integer default 0, p_expected_count integer default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.events; v_new public.events; v_target public.events; v_ids uuid[]; v_groups smallint[];
  v_series uuid; v_id uuid; v_first uuid; v_week integer; v_shift interval; v_duration interval; v_meet interval;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('one','following','future') then raise exception 'scope_invalid'; end if;
  if p_event_id is not null then
    select * into v_old from public.events where id=p_event_id for update;
    if not found then raise exception 'not_found'; end if;
    -- Only the listed editable values below can be saved, even if extra JSON keys are supplied.
    v_new:=v_old;
  end if;
  v_new.type:=coalesce(v_old.type,(p_changes->>'type')::public.event_type);
  v_new.title:=trim(p_changes->>'title');
  v_new.starts_at:=(p_changes->>'starts_at')::timestamptz;
  v_new.ends_at:=(p_changes->>'ends_at')::timestamptz;
  v_new.meetup_at:=(p_changes->>'meetup_at')::timestamptz;
  v_new.venue:=nullif(trim(p_changes->>'venue'),'');
  v_new.rink_id:=(p_changes->>'rink_id')::smallint;
  v_new.opponent:=nullif(trim(p_changes->>'opponent'),'');
  v_new.home_away:=p_changes->>'home_away';
  v_new.jersey:=p_changes->>'jersey';
  v_new.video_url:=nullif(trim(p_changes->>'video_url'),'');
  v_new.groups_pending:=coalesce((p_changes->>'groups_pending')::boolean,false);
  v_new.participant_details:=case when p_changes ? 'participant_details' then array(select jsonb_array_elements_text(p_changes->'participant_details')) else array['presence','lineup','plan','discussion','game'] end;
  v_new.observer_details:=array(select jsonb_array_elements_text(p_changes->'observer_details'));
  v_groups:=array(select distinct value::smallint from jsonb_array_elements_text(p_changes->'group_ids') order by 1);
  if v_new.type is null or v_new.title is null or v_new.starts_at is null or v_new.ends_at is null then raise exception 'event_invalid'; end if;
  if (v_new.groups_pending and (v_new.type<>'training' or cardinality(v_groups)>0))
     or (not v_new.groups_pending and cardinality(v_groups)=0)
     or (select count(*) from public.groups where id=any(v_groups))<>cardinality(v_groups) then
    raise exception 'groups_required';
  end if;
  if p_repeat_weeks is null or p_repeat_weeks<0 or p_repeat_weeks>52 or (p_repeat_weeks>0 and v_new.type<>'training') then raise exception 'repeat_invalid'; end if;
  if v_old.id is not null then
    select array_agg(s.id) into v_ids from public.event_scope(p_event_id,p_scope) s;
    if coalesce(cardinality(v_ids),0)=0 or (p_expected_count is not null and cardinality(v_ids)<>p_expected_count) then raise exception 'event_scope_changed'; end if;
    if (v_old.league_match_id is not null or v_old.ends_at<=now()) and (
       v_new.groups_pending<>v_old.groups_pending or v_groups is distinct from
       array(select eg.group_id from public.event_groups eg where eg.event_id=p_event_id order by eg.group_id)) then
      raise exception 'event_groups_locked';
    end if;
    v_shift:=(v_new.starts_at at time zone 'Europe/Rome')-(v_old.starts_at at time zone 'Europe/Rome');
  else
    if p_scope<>'one' then raise exception 'scope_invalid'; end if;
    v_series:=case when p_repeat_weeks>0 then gen_random_uuid() else null end;
    v_ids:=array[]::uuid[];
    for v_week in 0..p_repeat_weeks loop
      -- Pending during creation lets group replacement remain atomic without weakening older APIs.
      insert into public.events(type,title,starts_at,ends_at,meetup_at,venue,opponent,home_away,rink_id,series_id,groups_pending)
        values(v_new.type,v_new.title,(v_new.starts_at at time zone 'Europe/Rome'+make_interval(weeks=>v_week)) at time zone 'Europe/Rome',
        (v_new.ends_at at time zone 'Europe/Rome'+make_interval(weeks=>v_week)) at time zone 'Europe/Rome',
        (v_new.meetup_at at time zone 'Europe/Rome'+make_interval(weeks=>v_week)) at time zone 'Europe/Rome',v_new.venue,
        v_new.opponent,v_new.home_away,v_new.rink_id,v_series,v_new.groups_pending) returning id into v_id;
      v_ids:=array_append(v_ids,v_id);
    end loop;
    v_shift:=interval '0';
  end if;
  v_duration:=(v_new.ends_at at time zone 'Europe/Rome')-(v_new.starts_at at time zone 'Europe/Rome');
  v_meet:=(v_new.meetup_at at time zone 'Europe/Rome')-(v_new.starts_at at time zone 'Europe/Rome');
  for v_target in select * from public.events where id=any(v_ids) order by starts_at,id for update loop
    update public.events set
      title=v_new.title,
      starts_at=case when p_scope='one' and p_event_id is not null then v_new.starts_at else (v_target.starts_at at time zone 'Europe/Rome'+v_shift) at time zone 'Europe/Rome' end,
      ends_at=case when p_scope='one' and p_event_id is not null then v_new.ends_at else (v_target.starts_at at time zone 'Europe/Rome'+v_shift+v_duration) at time zone 'Europe/Rome' end,
      meetup_at=case when p_scope='one' and p_event_id is not null then v_new.meetup_at else (v_target.starts_at at time zone 'Europe/Rome'+v_shift+v_meet) at time zone 'Europe/Rome' end,
      venue=v_new.venue,rink_id=v_new.rink_id,opponent=v_new.opponent,home_away=v_new.home_away,
      jersey=v_new.jersey,video_url=v_new.video_url,participant_details=v_new.participant_details,observer_details=v_new.observer_details,
      groups_pending=case when type='training' then true else false end
      where id=v_target.id;
    insert into public.event_groups(event_id,group_id) select v_target.id,unnest(v_groups) on conflict do nothing;
    delete from public.event_groups where event_id=v_target.id and group_id<>all(v_groups);
    update public.events set groups_pending=v_new.groups_pending where id=v_target.id;
    delete from public.attendance_answers a where a.event_id=v_target.id and not exists (
      select 1 from public.group_members gm join public.event_groups eg on eg.group_id=gm.group_id
      where eg.event_id=a.event_id and gm.user_id=a.user_id);
    delete from public.attendance_records a where a.event_id=v_target.id and not exists (
      select 1 from public.group_members gm join public.event_groups eg on eg.group_id=gm.group_id
      where eg.event_id=a.event_id and gm.user_id=a.user_id);
    delete from public.event_lineup a where a.event_id=v_target.id and not exists (
      select 1 from public.group_members gm join public.event_groups eg on eg.group_id=gm.group_id
      where eg.event_id=a.event_id and gm.user_id=a.user_id);
    v_first:=coalesce(v_first,v_target.id);
  end loop;
  return coalesce(p_event_id,v_first);
end
$$;
revoke all on function public.save_event(uuid,jsonb,text,integer,integer) from public,anon,authenticated;
grant execute on function public.save_event(uuid,jsonb,text,integer,integer) to authenticated;

create function public.manage_events(p_event_id uuid,p_scope text,p_action text,p_expected_count integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; v_count integer;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_action is null or p_action not in ('cancel','restore','delete') then raise exception 'event_invalid'; end if;
  perform 1 from public.events where id=p_event_id for update;
  select array_agg(s.id) into v_ids from public.event_scope(p_event_id,p_scope) s;
  v_count:=coalesce(cardinality(v_ids),0);
  if p_expected_count is null or v_count=0 or v_count<>p_expected_count then raise exception 'event_scope_changed'; end if;
  perform 1 from public.events where id=any(v_ids) order by id for update;
  if p_action='delete' then delete from public.events where id=any(v_ids);
  else update public.events set cancelled_at=case when p_action='cancel' then now() else null end where id=any(v_ids); end if;
  return v_count;
end
$$;
revoke all on function public.manage_events(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.manage_events(uuid,text,text,integer) to authenticated;

create or replace function public.answer_attendance(p_event_id uuid, p_answer public.attendance_answer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ends timestamptz;
  v_cancelled timestamptz;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select ends_at, cancelled_at into v_ends, v_cancelled from public.events where id = p_event_id;
  if not found or not public.in_event_groups(p_event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.attendance_records where event_id=p_event_id and user_id=auth.uid() and status='not_called_up') then
    raise exception 'not_in_event' using errcode='42501';
  end if;
  if v_cancelled is not null then
    raise exception 'event_cancelled' using errcode = 'P0001';
  end if;
  if v_ends <= now() then
    raise exception 'event_over' using errcode = 'P0001';
  end if;
  insert into public.attendance_answers (event_id, user_id, answer)
  values (p_event_id, auth.uid(), p_answer)
  on conflict (event_id, user_id)
  do update set answer = excluded.answer, answered_at = now(), from_period = null;
end
$$;

create or replace function public.submit_game_vote(p_event_id uuid, p_mvp_id uuid, p_ratings jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_ends timestamptz;
begin
  -- Only people who played can vote, which also rules out anyone without a profile.
  select ends_at into v_ends from public.events where id = p_event_id and type = 'game';
  if not found or not public.is_member() or not public.in_event_groups(p_event_id) or not public.took_part(p_event_id, v_me) then
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

-- Older clients assigning a pending training also complete its assignment state.
create function public.complete_event_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.events set groups_pending=false where id=new.event_id and groups_pending;
  return new;
end
$$;
revoke all on function public.complete_event_assignment() from public,anon,authenticated;
create trigger event_group_assignment after insert on public.event_groups
  for each row execute function public.complete_event_assignment();

commit;
