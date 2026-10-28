-- The weekly training limit was dropped from the product, so its column goes too.
alter table public.groups drop column weekly_limit;
