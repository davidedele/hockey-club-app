-- A training with a saved rink address does not keep a second event address.
-- Existing rows are left in place until explicitly saved; the app displays the rink address.
create function public.use_training_rink_address() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'training' and exists (
    select 1 from public.rinks r where r.id = new.rink_id and nullif(btrim(r.address),'') is not null
  ) then
    new.venue := null;
  end if;
  return new;
end
$$;
revoke all on function public.use_training_rink_address() from public, anon, authenticated;
create trigger events_training_rink_address
  before insert or update of type, rink_id, venue on public.events
  for each row execute function public.use_training_rink_address();
