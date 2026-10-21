create schema test;
grant usage on schema test to anon, authenticated;

create function test.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
end $$;

create function test.login_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;

create function test.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'reset role';
end $$;

-- A query returns the expected number of rows.
create function test.rows(p_label text, p_query text, p_expected bigint) returns void
language plpgsql as $$
declare v bigint;
begin
  execute 'select count(*) from (' || p_query || ') q' into v;
  if v is distinct from p_expected then
    raise exception 'FAIL % : expected % rows, got %', p_label, p_expected, v;
  end if;
  raise notice 'ok   %', p_label;
end $$;

-- A statement changes the expected number of rows (0 means a policy hid every row).
create function test.affected(p_label text, p_stmt text, p_expected bigint) returns void
language plpgsql as $$
declare v bigint;
begin
  execute p_stmt;
  get diagnostics v = row_count;
  if v is distinct from p_expected then
    raise exception 'FAIL % : expected % rows changed, got %', p_label, p_expected, v;
  end if;
  raise notice 'ok   %', p_label;
end $$;

-- A statement fails and the error message contains the given text.
create function test.fails(p_label text, p_stmt text, p_message text) returns void
language plpgsql as $$
begin
  begin
    execute p_stmt;
  exception when others then
    if sqlerrm like '%' || p_message || '%' then
      raise notice 'ok   %', p_label;
      return;
    end if;
    raise exception 'FAIL % : wrong error: %', p_label, sqlerrm;
  end;
  raise exception 'FAIL % : expected an error containing "%", but it succeeded', p_label, p_message;
end $$;

-- A statement succeeds.
create function test.works(p_label text, p_stmt text) returns void
language plpgsql as $$
begin
  execute p_stmt;
  raise notice 'ok   %', p_label;
end $$;
