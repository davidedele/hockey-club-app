-- Training plans and the drill library. The coach prepares the session before it starts, so less
-- time is lost explaining on the ice, and the players read it before they go on.
--
-- A drill is written once and used in any number of trainings. It can carry a picture or a PDF, a
-- link to a video, or both. The whole club reads the library; only staff write it.
--
-- A plan belongs to one event: the coach's own words, the drills in order, and the choice of
-- whether the plan stays visible to the players once the session is over. Staff always see it.

create table public.drills (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 80),
  notes text check (notes is null or length(notes) <= 1000),
  file_path text check (file_path is null or file_path ~ '^[0-9a-f-]{36}/drill-[0-9]{10,16}\.(pdf|jpg|png)$'),
  video_url text check (video_url is null
    or (video_url ~ '^https://[^[:space:]]+$' and length(video_url) between 12 and 300)),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index drills_created_by_idx on public.drills (created_by);

create table public.event_plan (
  event_id uuid primary key references public.events (id) on delete cascade,
  notes text check (notes is null or length(notes) <= 2000),
  visible_after boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index event_plan_updated_by_idx on public.event_plan (updated_by);

-- One drill inside one plan. The order is the step number; a gap in the numbers is harmless.
-- The unique rule is checked at the end of the statement, so two steps can be swapped in one go.
create table public.event_plan_drills (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.event_plan (event_id) on delete cascade,
  drill_id uuid not null references public.drills (id) on delete cascade,
  step smallint not null check (step between 1 and 30),
  minutes smallint check (minutes between 1 and 180),
  constraint event_plan_drills_step_key unique (event_id, step) deferrable initially deferred
);
create index event_plan_drills_event_id_idx on public.event_plan_drills (event_id);
create index event_plan_drills_drill_id_idx on public.event_plan_drills (drill_id);

-- Who last touched a plan and when is written here, never by the app.
create function public.stamp_event_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end
$$;

create trigger event_plan_stamp
  before insert or update on public.event_plan
  for each row execute function public.stamp_event_plan();

-- Staff see every plan. A player of one of the event's groups sees it before and during the
-- session, and afterwards only if the coach chose to leave it visible.
create function public.can_see_plan(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff() or (
    public.in_event_groups(p_event_id)
    and exists (
      select 1 from public.events e
      left join public.event_plan p on p.event_id = e.id
      where e.id = p_event_id and (e.ends_at > now() or coalesce(p.visible_after, false))
    )
  )
$$;

-- Putting a drill in a plan starts the plan if it is not there yet and puts the drill last.
create function public.add_plan_drill(p_event_id uuid, p_drill_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_step smallint;
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into public.event_plan (event_id) values (p_event_id) on conflict do nothing;
  select coalesce(max(step), 0) + 1 into v_step from public.event_plan_drills where event_id = p_event_id;
  if v_step > 30 then
    raise exception 'plan_full' using errcode = 'P0001';
  end if;
  insert into public.event_plan_drills (event_id, drill_id, step)
    values (p_event_id, p_drill_id, v_step)
    returning id into v_id;
  return v_id;
end
$$;

-- Moving a drill swaps its step with the one next to it, up or down the plan.
create function public.move_plan_drill(p_id uuid, p_up boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
  v_step smallint;
  v_other_id uuid;
  v_other_step smallint;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select event_id, step into v_event, v_step from public.event_plan_drills where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_up then
    select id, step into v_other_id, v_other_step from public.event_plan_drills
      where event_id = v_event and step < v_step order by step desc limit 1;
  else
    select id, step into v_other_id, v_other_step from public.event_plan_drills
      where event_id = v_event and step > v_step order by step limit 1;
  end if;
  if not found then
    return;
  end if;
  update public.event_plan_drills set step = v_other_step where id = p_id;
  update public.event_plan_drills set step = v_step where id = v_other_id;
end
$$;

-- Pictures and PDFs of the drills, reached through short lived signed links. Each drill keeps its
-- files in a folder named after it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drills', 'drills', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy drills_files_select on storage.objects for select to authenticated
  using (bucket_id = 'drills' and public.is_member());
create policy drills_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'drills' and public.is_staff());
create policy drills_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'drills' and public.is_staff());

-- Privileges -----------------------------------------------------------

revoke all on public.drills, public.event_plan, public.event_plan_drills from public, anon, authenticated;
revoke all on function public.stamp_event_plan(), public.can_see_plan(uuid),
  public.add_plan_drill(uuid, uuid), public.move_plan_drill(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.can_see_plan(uuid), public.add_plan_drill(uuid, uuid),
  public.move_plan_drill(uuid, boolean) to authenticated;

grant select, delete on public.drills to authenticated;
grant insert (id, title, notes, file_path, video_url) on public.drills to authenticated;
grant update (title, notes, file_path, video_url) on public.drills to authenticated;

grant select, delete on public.event_plan to authenticated;
grant insert (event_id, notes, visible_after) on public.event_plan to authenticated;
grant update (notes, visible_after) on public.event_plan to authenticated;

grant select, delete on public.event_plan_drills to authenticated;
grant insert (event_id, drill_id, step, minutes) on public.event_plan_drills to authenticated;
grant update (step, minutes) on public.event_plan_drills to authenticated;

alter table public.drills enable row level security;
alter table public.event_plan enable row level security;
alter table public.event_plan_drills enable row level security;

-- The whole club reads the library, because the drills of a plan have to be readable by the
-- players it is shown to. Only staff write drills.
create policy drills_select on public.drills for select to authenticated
  using (public.is_member());
create policy drills_insert on public.drills for insert to authenticated
  with check (public.is_staff());
create policy drills_update on public.drills for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy drills_delete on public.drills for delete to authenticated
  using (public.is_staff());

create policy event_plan_select on public.event_plan for select to authenticated
  using (public.can_see_plan(event_id));
create policy event_plan_insert on public.event_plan for insert to authenticated
  with check (public.is_staff());
create policy event_plan_update on public.event_plan for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy event_plan_delete on public.event_plan for delete to authenticated
  using (public.is_staff());

create policy event_plan_drills_select on public.event_plan_drills for select to authenticated
  using (public.can_see_plan(event_id));
create policy event_plan_drills_insert on public.event_plan_drills for insert to authenticated
  with check (public.is_staff());
create policy event_plan_drills_update on public.event_plan_drills for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy event_plan_drills_delete on public.event_plan_drills for delete to authenticated
  using (public.is_staff());
