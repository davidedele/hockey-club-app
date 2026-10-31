-- People's names are stored with capital initials and without digits, whatever the screen they come
-- from. A name typed all in lower or upper case gets initial capitals ("pansini mattia" becomes
-- "Pansini Mattia"); a name typed with its own mix of capitals ("McKenzie") only has the first letter
-- of each word raised. The app applies the same rule before saving.

create function public.tidy_name(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  s text := regexp_replace(btrim(p), '\s+', ' ', 'g');
  out text := '';
  c text;
  i integer;
begin
  if s is null then
    return null;
  end if;
  if s = lower(s) or s = upper(s) then
    return initcap(lower(s));
  end if;
  for i in 1 .. length(s) loop
    c := substr(s, i, 1);
    if i = 1 or substr(s, i - 1, 1) !~ '[[:alpha:]]' then
      out := out || upper(c);
    else
      out := out || c;
    end if;
  end loop;
  return out;
end
$$;

-- Runs with its owner's rights, so members never need to call the helper themselves.
create function public.tidy_profile_names() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.first_name := public.tidy_name(new.first_name);
  new.last_name := public.tidy_name(new.last_name);
  return new;
end
$$;

create trigger profiles_tidy_names
  before insert or update of first_name, last_name on public.profiles
  for each row execute function public.tidy_profile_names();

-- New and changed names may not contain digits. Existing rows are left as they are, so test accounts
-- with a number in the name keep working until someone renames them.
alter table public.profiles
  add constraint profiles_names_no_digits check (first_name !~ '[0-9]' and last_name !~ '[0-9]') not valid;

-- The names already stored get the same capitals, except those that would break the rule above.
update public.profiles
set first_name = first_name, last_name = last_name
where first_name !~ '[0-9]' and last_name !~ '[0-9]'
  and (first_name <> public.tidy_name(first_name) or last_name <> public.tidy_name(last_name));

revoke all on function public.tidy_name(text), public.tidy_profile_names() from public, anon, authenticated;
