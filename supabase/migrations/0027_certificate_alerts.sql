-- Emails that warn a member before the medical certificate runs out, asked for by the president.
--
-- Five moments, each sent once for a given expiry date: two months before, one month before, a week
-- before, the day it runs out, and a month after if it is still not renewed. A member who renews
-- gets the whole set again for the new date, because the log is kept per date.
--
-- Only people who belong to at least one group are written to, since only they are playing. Nothing
-- goes out between 22:00 and 08:00 Italian time, and nothing to people who switched the club emails
-- off, which is the same switch as the reminders and the announcements.

create table public.certificate_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  valid_until date not null,
  stage smallint not null check (stage in (60, 30, 7, 0, -30)),
  sent_at timestamptz not null default now(),
  primary key (user_id, valid_until, stage)
);

-- Who should be written to now, and which of the five moments it is. Only the server calls this.
create function public.certificates_due(p_now timestamptz default now())
returns table (
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
  select pr.id, c.email, pr.first_name, d.valid_until, s.stage, (d.valid_until - v_today)
  from public.member_documents d
  join public.profiles pr on pr.id = d.user_id
  join public.profile_contacts c on c.user_id = pr.id
  cross join lateral (
    select (case
      when d.valid_until - v_today <= -30 then -30
      when d.valid_until - v_today <= 0 then 0
      when d.valid_until - v_today <= 7 then 7
      when d.valid_until - v_today <= 30 then 30
      when d.valid_until - v_today <= 60 then 60
    end)::smallint as stage
  ) s
  where d.kind = 'medical_certificate'
    and d.valid_until is not null
    and s.stage is not null
    and exists (select 1 from public.group_members gm where gm.user_id = pr.id)
    and not exists (select 1 from public.reminder_prefs rp where rp.user_id = pr.id and not rp.enabled)
    and not exists (
      select 1 from public.certificate_log l
      where l.user_id = pr.id and l.valid_until = d.valid_until and l.stage = s.stage)
  order by pr.id;
end
$$;

-- Written down once the email has gone out, so the same moment is never sent twice.
create function public.certificates_mark_sent(p_user uuid, p_valid_until date, p_stage smallint)
returns void
language sql security definer set search_path = '' as $$
  insert into public.certificate_log (user_id, valid_until, stage)
  values (p_user, p_valid_until, p_stage)
  on conflict do nothing
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.certificate_log from public, anon, authenticated;
revoke all on function public.certificates_due(timestamptz),
  public.certificates_mark_sent(uuid, date, smallint) from public, anon, authenticated;
grant execute on function public.certificates_due(timestamptz),
  public.certificates_mark_sent(uuid, date, smallint) to service_role;

alter table public.certificate_log enable row level security;
-- No policies on purpose: only the database and the server function read and write this.
