begin;

alter table public.ticket_events
  add column if not exists poster_url text,
  add column if not exists artist_image_url text;

grant select (poster_url, artist_image_url)
  on public.ticket_events to anon, authenticated;

commit;
