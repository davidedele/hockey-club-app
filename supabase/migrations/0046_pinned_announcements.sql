-- Pinned announcements (V5): the board can pin an announcement so that it stays at the top of the list.
-- Only the board pins and unpins, through pin_announcement; nobody can update an announcement directly.
-- Read receipts are not built: the app keeps only the time each person last opened the announcements,
-- and a per announcement receipt would be a new table of who read what (decision 119).

alter table public.announcements add column pinned_at timestamptz;

create function public.pin_announcement(p_id uuid, p_pinned boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_board() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.announcements set pinned_at = case when coalesce(p_pinned, false) then now() else null end
   where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end
$$;

revoke all on function public.pin_announcement(uuid, boolean) from public, anon, authenticated;
grant execute on function public.pin_announcement(uuid, boolean) to authenticated;
