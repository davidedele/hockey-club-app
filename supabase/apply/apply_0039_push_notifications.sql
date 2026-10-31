-- Apply migration 0039 (push_notifications) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0039 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regclass('public.reminder_prefs') is not null and to_regprocedure('public.my_season(integer)') is not null) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0039 was not applied.';
  end if;
  if to_regclass('public.push_subscriptions') is not null then
    raise exception 'Migration 0039 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Push notifications (decision 97): where a person's phones are, what they chose to receive on which
-- channel, and the one function the server uses to decide push or email for each notification.
--
-- The sending itself is the server function send-reminders. It asks the same "who is due" functions as
-- the emails (quiet hours at night, nobody who is "Non convocato"), then asks notification_route() how to
-- reach each person: push first, email only when there is no push or the person chose both.

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- The five kinds of notification and the channel the person chose for each.
--   auto  push when the person has a working push subscription, otherwise email (the default)
--   both  push and email   push  push only   email  email only   off  nothing
create table public.notification_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('reminder', 'changes', 'announcement', 'discussion', 'certificate')),
  channel text not null check (channel in ('auto', 'both', 'push', 'email', 'off')),
  primary key (user_id, kind)
);

-- Adding or moving a phone. One device belongs to one person: signing in with another account on the
-- same phone moves the subscription to that account.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth);
end
$$;

create function public.set_notification_pref(p_kind text, p_channel text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.notification_prefs (user_id, kind, channel) values (auth.uid(), p_kind, p_channel)
  on conflict (user_id, kind) do update set channel = excluded.channel;
end
$$;

-- How to reach one person for one kind. Only the server calls this.
-- The email switch of the profile page (reminder_prefs) still turns every email off.
create function public.notification_route(p_user uuid, p_kind text)
returns table (push boolean, email boolean, subscriptions jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_mode text;
  v_subs jsonb;
  v_email_on boolean;
begin
  select coalesce((select np.channel from public.notification_prefs np where np.user_id = p_user and np.kind = p_kind), 'auto') into v_mode;
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
    into v_subs from public.push_subscriptions s where s.user_id = p_user;
  v_email_on := not exists (select 1 from public.reminder_prefs rp where rp.user_id = p_user and not rp.enabled);
  return query select
    (jsonb_array_length(v_subs) > 0 and v_mode in ('auto', 'both', 'push')),
    (v_email_on and (v_mode in ('both', 'email') or (v_mode = 'auto' and jsonb_array_length(v_subs) = 0))),
    v_subs;
end
$$;

-- A phone that no longer answers (the push service says gone) is removed.
create function public.push_remove(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.push_subscriptions, public.notification_prefs from public, anon, authenticated;
revoke all on function public.save_push_subscription(text, text, text), public.set_notification_pref(text, text),
  public.notification_route(uuid, text), public.push_remove(text) from public, anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant select on public.notification_prefs to authenticated;
grant execute on function public.save_push_subscription(text, text, text), public.set_notification_pref(text, text) to authenticated;
grant execute on function public.notification_route(uuid, text), public.push_remove(text) to service_role;

alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;

create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
create policy notification_prefs_select on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));

commit;
