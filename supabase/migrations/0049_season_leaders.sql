-- Hall of fame (V8): who led each season, built only from data the app already has. For a season (1 September
-- to 31 August): the top scorer, the most assists, the most points, the most games won as MVP (from the
-- season statistics, the same numbers as the Statistiche page) and the most present (events the person was
-- recorded at, on time or late, cancelled and unfinished events excluded). A tie shows every tied person; a
-- category nobody scored in is left out; people whose data was deleted are left out. Every member reads it.
-- Final league positions and retired numbers are not here: the app keeps no past standings, and a retired
-- number would be new data (decision 119).

create function public.season_leaders(p_season integer)
returns table (category text, user_id uuid, first_name text, last_name text, value integer)
language sql stable security definer set search_path = '' as $$
  with s as (
    select st.user_id, st.first_name, st.last_name, st.goals, st.assists, st.points, st.mvp
    from public.season_player_stats(p_season, null) st
    join public.profiles p on p.id = st.user_id and p.deleted_at is null
  ),
  pres as (
    select r.user_id, count(*)::integer as n
    from public.attendance_records r
    join public.events e on e.id = r.event_id
    join public.profiles p on p.id = r.user_id and p.deleted_at is null
    where public.is_member() and r.status in ('on_time', 'late')
      and e.cancelled_at is null and e.ends_at <= now()
      and p_season between 2000 and 2100
      and e.starts_at >= make_timestamptz(p_season, 9, 1, 0, 0, 0, 'Europe/Rome')
      and e.starts_at < make_timestamptz(p_season + 1, 9, 1, 0, 0, 0, 'Europe/Rome')
    group by r.user_id
  ),
  cats as (
    select 'goals'::text as category, s.user_id, s.first_name, s.last_name, s.goals as value from s
    union all select 'assists', s.user_id, s.first_name, s.last_name, s.assists from s
    union all select 'points', s.user_id, s.first_name, s.last_name, s.points from s
    union all select 'mvp', s.user_id, s.first_name, s.last_name, s.mvp from s
    union all select 'present', pr.id, pr.first_name, pr.last_name, pres.n
      from pres join public.profiles pr on pr.id = pres.user_id
  ),
  top as (select c.*, max(c.value) over (partition by c.category) as best from cats c)
  select t.category, t.user_id, t.first_name, t.last_name, t.value
  from top t
  where t.value = t.best and t.value > 0
  order by array_position(array['goals', 'assists', 'points', 'mvp', 'present'], t.category), t.last_name, t.first_name
$$;

revoke all on function public.season_leaders(integer) from public, anon, authenticated;
grant execute on function public.season_leaders(integer) to authenticated;
