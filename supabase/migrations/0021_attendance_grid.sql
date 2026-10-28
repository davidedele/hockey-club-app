-- Attendance grid: for one group and a period, every member of the group by every event of the
-- group, with the answer the person gave and the status staff recorded. Coaches and the board only.
-- The period is limited to about three months, which keeps the answer small.

create function public.attendance_grid(
  p_group_id smallint,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  event_id uuid,
  starts_at timestamptz,
  title text,
  type public.event_type,
  cancelled boolean,
  user_id uuid,
  first_name text,
  last_name text,
  answer public.attendance_answer,
  status public.attendance_status
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '93 days' then
    raise exception 'range_invalid' using errcode = 'P0001';
  end if;
  return query
  select e.id, e.starts_at, e.title, e.type, e.cancelled_at is not null,
         p.id, p.first_name, p.last_name, a.answer, r.status
  from public.events e
  join public.event_groups eg on eg.event_id = e.id and eg.group_id = p_group_id
  join public.group_members gm on gm.group_id = p_group_id
  join public.profiles p on p.id = gm.user_id
  left join public.attendance_answers a on a.event_id = e.id and a.user_id = p.id
  left join public.attendance_records r on r.event_id = e.id and r.user_id = p.id
  where e.starts_at >= p_from and e.starts_at < p_to
  order by e.starts_at, p.last_name, p.first_name;
end
$$;

-- Privileges -----------------------------------------------------------

revoke all on function public.attendance_grid(smallint, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.attendance_grid(smallint, timestamptz, timestamptz) to authenticated;
