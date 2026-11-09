alter table public.groups add column league_alias text check (league_alias is null or length(trim(league_alias)) between 1 and 60);
grant update (league_alias) on public.groups to authenticated;
alter table public.club_settings add column home_rink_id smallint references public.rinks(id) on delete set null;
grant update (home_rink_id) on public.club_settings to authenticated;
update public.club_settings set home_rink_id=(select id from public.rinks where lower(name) like '%grande%' order by id limit 1);
alter table public.events
 add column booking_starts_at timestamptz,
 add column booking_ends_at timestamptz,
 add column booking_needs_review boolean not null default false,
 add column parent_event_id uuid references public.events(id) on delete set null,
 add constraint valid_booking check ((booking_starts_at is null and booking_ends_at is null) or
 (booking_starts_at is not null and booking_ends_at is not null and rink_id is not null and booking_ends_at>booking_starts_at and booking_ends_at<=booking_starts_at+interval '24 hours'));
create index events_parent_idx on public.events(parent_event_id);
create function public.check_event_booking_link() returns trigger language plpgsql set search_path='' as $$
begin
 if new.type='game' and new.home_away='home' and new.rink_id is null then
   select home_rink_id into new.rink_id from public.club_settings where id=true;
 end if;
 if tg_op='UPDATE' and new.starts_at is distinct from old.starts_at and old.booking_starts_at is not null
   and new.booking_starts_at is not distinct from old.booking_starts_at and new.booking_ends_at is not distinct from old.booking_ends_at then
   new.booking_needs_review:=true;
 end if;
 if new.parent_event_id is not null then
   -- Serialize relationship edits so two concurrent links cannot form a cycle.
   perform pg_advisory_xact_lock(64001);
   if new.parent_event_id=new.id or not exists(select 1 from public.events p where p.id=new.parent_event_id and p.parent_event_id is null)
      or exists(select 1 from public.events c where c.parent_event_id=new.id) then raise exception 'event_link_invalid'; end if;
 end if;
 return new;
end $$;
revoke all on function public.check_event_booking_link() from public,anon,authenticated;
create trigger event_booking_link before insert or update on public.events for each row execute function public.check_event_booking_link();

-- A published request is immutable. A new document/version is a new request; archive the old one.
create table public.club_requests (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 1 and 80),
 instructions text not null default '' check(length(instructions)<=2000),
 action text not null check(action in ('read','accept','upload')),
 document_id uuid references public.club_documents(id) on delete restrict,
 group_ids smallint[] not null default '{}', deadline date, review boolean not null default false,
 active boolean not null default true, created_by uuid default auth.uid() references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(), check(action='upload' or document_id is not null), check(action='upload' or not review)
);
create table public.club_request_responses (
 request_id uuid not null references public.club_requests(id) on delete restrict,
 user_id uuid not null references public.profiles(id) on delete cascade,
 file_path text, submitted_at timestamptz not null default now(),
 status text not null check(status in ('complete','pending','approved','rejected')),
 reviewed_at timestamptz, reviewed_by uuid references public.profiles(id) on delete set null,
 review_note text not null default '' check(length(review_note)<=1000), primary key(request_id,user_id),
 check(file_path is null or file_path ~ ('^'||user_id::text||'/request-'||request_id::text||'-[a-f0-9-]+\.(pdf|jpg|png)$'))
);
alter table public.club_requests enable row level security;
alter table public.club_request_responses enable row level security;
revoke all on public.club_requests,public.club_request_responses from public,anon,authenticated;
grant select on public.club_requests,public.club_request_responses to authenticated;
grant insert(title,instructions,action,document_id,group_ids,deadline,review) on public.club_requests to authenticated;
grant update(active) on public.club_requests to authenticated;
create function public.request_applies(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_member() and exists(select 1 from public.club_requests r where r.id=p_id and
 (cardinality(r.group_ids)=0 or exists(select 1 from public.group_members gm where gm.user_id=auth.uid() and gm.group_id=any(r.group_ids))))
$$;
revoke all on function public.request_applies(uuid) from public,anon,authenticated;
grant execute on function public.request_applies(uuid) to authenticated;
create policy requests_read on public.club_requests for select to authenticated using (public.is_staff() or public.request_applies(id));
create policy requests_add on public.club_requests for insert to authenticated with check(public.is_board() and created_by=auth.uid() and group_ids <@ array(select id from public.groups));
create policy requests_archive on public.club_requests for update to authenticated using(public.is_board()) with check(public.is_board());
create policy responses_read on public.club_request_responses for select to authenticated using(public.is_staff() or user_id=auth.uid());
create function public.submit_club_request(p_id uuid,p_file text default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.club_requests;
begin
 select * into r from public.club_requests where id=p_id for share;
 if not found or not r.active or not public.request_applies(p_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if r.action='upload' then
   if p_file is null or p_file !~ ('^'||auth.uid()::text||'/request-'||p_id::text||'-[a-f0-9-]+\.(pdf|jpg|png)$')
      or not exists(select 1 from storage.objects where bucket_id='documents' and name=p_file) then raise exception 'request_file_required'; end if;
 elsif p_file is not null then raise exception 'request_file_invalid'; end if;
 insert into public.club_request_responses(request_id,user_id,file_path,status)
 values(p_id,auth.uid(),p_file,case when r.review then 'pending' else 'complete' end)
 on conflict(request_id,user_id) do update set file_path=excluded.file_path,submitted_at=now(),status=excluded.status,reviewed_at=null,reviewed_by=null,review_note='';
end $$;
create function public.review_club_request(p_id uuid,p_user uuid,p_approve boolean,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_staff() or p_approve is null then raise exception 'forbidden' using errcode='42501'; end if;
 update public.club_request_responses set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=auth.uid(),review_note=coalesce(p_note,'')
 where request_id=p_id and user_id=p_user and status='pending';
 if not found then raise exception 'request_review_changed'; end if;
end $$;
revoke all on function public.submit_club_request(uuid,text),public.review_club_request(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.submit_club_request(uuid,text),public.review_club_request(uuid,uuid,boolean,text) to authenticated;

create or replace function public.save_event(p_event_id uuid, p_changes jsonb, p_scope text default 'one',
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
  v_new.booking_starts_at:=(p_changes->>'booking_starts_at')::timestamptz;
  v_new.booking_ends_at:=(p_changes->>'booking_ends_at')::timestamptz;
  v_new.parent_event_id:=(p_changes->>'parent_event_id')::uuid;
  if v_new.parent_event_id is not null and (p_repeat_weeks>0 or p_scope<>'one') then raise exception 'event_link_invalid'; end if;
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
      booking_starts_at=case when v_new.booking_starts_at is null then null else
        ((v_target.starts_at at time zone 'Europe/Rome')+v_shift+((v_new.booking_starts_at at time zone 'Europe/Rome')-(v_new.starts_at at time zone 'Europe/Rome'))) at time zone 'Europe/Rome' end,
      booking_ends_at=case when v_new.booking_ends_at is null then null else
        ((v_target.starts_at at time zone 'Europe/Rome')+v_shift+((v_new.booking_ends_at at time zone 'Europe/Rome')-(v_new.starts_at at time zone 'Europe/Rome'))) at time zone 'Europe/Rome' end,
      booking_needs_review=false,parent_event_id=v_new.parent_event_id,
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

