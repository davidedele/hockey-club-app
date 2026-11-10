-- Commit these enum values before applying 0064.
alter type public.event_type add value if not exists 'theory';
alter type public.event_type add value if not exists 'off_ice';
alter type public.event_type add value if not exists 'other';
