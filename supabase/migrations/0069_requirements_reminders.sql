-- Emails and pushes that warn a person before a required document with an end date runs out. They replace the ones
-- for the medical certificate alone (0027), which read the old table, and work for every requirement that expires.
--
-- Five moments, each sent once for a given end date: two months before, one month before, a week before, the day it
-- runs out, and a month after if it is still not renewed. An answer renewed with a new end date gets the whole set
-- again, because the log is kept per requirement, person and date (requirement_reminder_log, 0067).
--
-- Only an active requirement is looked at, only the answer to its current version that was not sent back, and only
-- people who belong to a group the requirement is for. Nothing goes out between 22:00 and 08:00 Italian time, and
-- nothing to people who switched the club emails off.

create function public.requirements_due(p_now timestamptz default now())
returns table (
  requirement_id uuid,
  slug text,
  title text,
  user_id uuid,
  email text,
  first_name text,
  valid_until date,
  stage smallint,
  days integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hour integer := extract(hour from p_now at time zone 'Europe/Rome');
  v_today date := (p_now at time zone 'Europe/Rome')::date;
begin
  if v_hour < 8 or v_hour >= 22 then
    return;
  end if;
  return query
  select r.id, r.slug, r.title, pr.id, c.email, pr.first_name, a.valid_until, s.stage, (a.valid_until - v_today)
  from public.requirement_answers a
  join public.requirements r on r.id = a.requirement_id and r.active and a.version = r.current_version
  join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
  join public.profile_contacts c on c.user_id = pr.id
  cross join lateral (
    select (case
      when a.valid_until - v_today <= -30 then -30
      when a.valid_until - v_today <= 0 then 0
      when a.valid_until - v_today <= 7 then 7
      when a.valid_until - v_today <= 30 then 30
      when a.valid_until - v_today <= 60 then 60
    end)::smallint as stage
  ) s
  where a.valid_until is not null
    and a.status <> 'rejected'
    and s.stage is not null
    and exists (
      select 1 from public.group_members gm
      where gm.user_id = pr.id and (cardinality(r.group_ids) = 0 or gm.group_id = any (r.group_ids)))
    and not exists (select 1 from public.reminder_prefs rp where rp.user_id = pr.id and not rp.enabled)
    and not exists (
      select 1 from public.requirement_reminder_log l
      where l.requirement_id = r.id and l.user_id = pr.id and l.valid_until = a.valid_until and l.stage = s.stage)
  order by pr.id, r.title;
end
$$;

-- Written down once the message has gone out, so the same moment is never sent twice.
create function public.requirements_mark_sent(p_requirement uuid, p_user uuid, p_valid_until date, p_stage smallint)
returns void
language sql security definer set search_path = '' as $$
  insert into public.requirement_reminder_log (requirement_id, user_id, valid_until, stage)
  values (p_requirement, p_user, p_valid_until, p_stage)
  on conflict do nothing
$$;

revoke all on function public.requirements_due(timestamptz),
  public.requirements_mark_sent(uuid, uuid, date, smallint) from public, anon, authenticated;
grant execute on function public.requirements_due(timestamptz),
  public.requirements_mark_sent(uuid, uuid, date, smallint) to service_role;
