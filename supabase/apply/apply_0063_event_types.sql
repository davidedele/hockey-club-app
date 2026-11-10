-- Apply to the separate test project. Run this complete file once.
begin;
do $guard$ begin
 if to_regprocedure('public.use_training_rink_address()') is null then raise exception 'Apply migration 0062 first. Nothing was changed.'; end if;
 if exists(select 1 from pg_enum where enumtypid='public.event_type'::regtype and enumlabel in ('theory','off_ice','other')) then raise exception 'Migration 0063 is already applied or partially applied. Nothing was changed.'; end if;
end $guard$;

-- Commit these enum values before applying 0064.
alter type public.event_type add value if not exists 'theory';
alter type public.event_type add value if not exists 'off_ice';
alter type public.event_type add value if not exists 'other';

commit;
