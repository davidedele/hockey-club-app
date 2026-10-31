-- Match video (V4): an optional https link on a game, shown on the event page. The database accepts only
-- addresses that start with https:// and have no spaces, at most 300 characters, and only on games.
-- Staff edit it with the rest of the event (the existing update rule of events); members only read it.

alter table public.events
  add column video_url text
  constraint events_video_url_check check (
    video_url is null or (type = 'game' and length(video_url) <= 300 and video_url ~ '^https://[^[:space:]]+$')
  );
grant update (video_url) on public.events to authenticated;
