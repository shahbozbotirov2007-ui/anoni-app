alter table public.ticket_events
  add column if not exists poster_url text,
  add column if not exists artist_image_url text;

alter table public.ticket_seats
  drop constraint if exists ticket_seats_status_check;
alter table public.ticket_seats
  add constraint ticket_seats_status_check
  check (status in ('available', 'reserved', 'sold', 'invitation', 'offline_sold'));

grant select (poster_url, artist_image_url)
  on public.ticket_events to anon, authenticated;

create or replace function public.ticket_admin_create_event(
  p_event jsonb,
  p_invitation_seats integer[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_event_id uuid;
  event_seat_count integer := (p_event ->> 'seat_count')::integer;
  invite_seats integer[] := coalesce(p_invitation_seats, array[]::integer[]);
begin
  if not public.ticket_user_is_admin() then raise exception 'Admin access required'; end if;
  if event_seat_count not between 1 and 5000 then raise exception 'Seat count must be between 1 and 5000'; end if;
  if exists (
    select 1 from unnest(invite_seats) as invitation(seat_number)
    where invitation.seat_number < 1 or invitation.seat_number > event_seat_count
  ) then
    raise exception 'Invitation seat is outside the event seat range';
  end if;

  insert into public.ticket_events(
    title, description, location, starts_at, sales_start_at, sales_end_at,
    ticket_price, seat_count, payment_card_number, charity_enabled,
    charity_percent, published, created_by, poster_url, artist_image_url
  )
  values (
    trim(p_event ->> 'title'),
    coalesce(p_event ->> 'description', ''),
    trim(p_event ->> 'location'),
    (p_event ->> 'starts_at')::timestamptz,
    (p_event ->> 'sales_start_at')::timestamptz,
    (p_event ->> 'sales_end_at')::timestamptz,
    (p_event ->> 'ticket_price')::numeric,
    event_seat_count,
    regexp_replace(p_event ->> 'payment_card_number', '\s', '', 'g'),
    coalesce((p_event ->> 'charity_enabled')::boolean, false),
    coalesce((p_event ->> 'charity_percent')::numeric, 0),
    coalesce((p_event ->> 'published')::boolean, false),
    auth.uid(),
    nullif(p_event ->> 'poster_url', ''),
    nullif(p_event ->> 'artist_image_url', '')
  )
  returning id into new_event_id;

  insert into public.ticket_seats(event_id, seat_number, status)
  select new_event_id, seat_number,
    case when seat_number = any(invite_seats) then 'invitation' else 'available' end
  from generate_series(1, event_seat_count) as seats(seat_number);

  return new_event_id;
end;
$$;

create or replace function public.ticket_admin_update_event(
  p_event_id uuid,
  p_event jsonb,
  p_offline_seats integer[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_seat_count integer;
  offline_seats integer[] := coalesce(p_offline_seats, array[]::integer[]);
begin
  if not public.ticket_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  if char_length(trim(coalesce(p_event ->> 'title', ''))) not between 2 and 160 then
    raise exception 'Event title must be between 2 and 160 characters';
  end if;
  if char_length(trim(coalesce(p_event ->> 'location', ''))) not between 2 and 240 then
    raise exception 'Event location must be between 2 and 240 characters';
  end if;
  if coalesce((p_event ->> 'ticket_price')::numeric, 0) <= 0 then
    raise exception 'Ticket price must be greater than zero';
  end if;
  if coalesce(p_event ->> 'payment_card_number', '') !~ '^[0-9 ]{16,23}$' then
    raise exception 'Payment card number is invalid';
  end if;
  if (p_event ->> 'sales_start_at')::timestamptz >= (p_event ->> 'sales_end_at')::timestamptz
     or (p_event ->> 'sales_end_at')::timestamptz > (p_event ->> 'starts_at')::timestamptz then
    raise exception 'Sale dates must end before the event starts';
  end if;

  select seat_count into current_seat_count
  from public.ticket_events
  where id = p_event_id
  for update;
  if not found then
    raise exception 'Event not found';
  end if;

  if cardinality(offline_seats) <> (
    select count(distinct requested.seat_number)
    from unnest(offline_seats) as requested(seat_number)
  ) then
    raise exception 'Offline seat numbers must not be duplicated';
  end if;
  if exists (
    select 1
    from unnest(offline_seats) as requested(seat_number)
    where requested.seat_number < 1 or requested.seat_number > current_seat_count
  ) then
    raise exception 'Offline seat is outside the event seat range';
  end if;

  perform seat.id
  from public.ticket_seats as seat
  where seat.event_id = p_event_id
  order by seat.seat_number
  for update;

  if exists (
    select 1
    from public.ticket_seats as seat
    where seat.event_id = p_event_id
      and seat.seat_number = any(offline_seats)
      and seat.status not in ('available', 'offline_sold')
  ) then
    raise exception 'A selected seat is reserved, sold, or an invitation';
  end if;

  update public.ticket_seats
  set status = 'available'
  where event_id = p_event_id
    and status = 'offline_sold'
    and not (seat_number = any(offline_seats));
  update public.ticket_seats
  set status = 'offline_sold'
  where event_id = p_event_id
    and status = 'available'
    and seat_number = any(offline_seats);

  update public.ticket_events
  set title = trim(p_event ->> 'title'),
      description = coalesce(p_event ->> 'description', ''),
      location = trim(p_event ->> 'location'),
      starts_at = (p_event ->> 'starts_at')::timestamptz,
      sales_start_at = (p_event ->> 'sales_start_at')::timestamptz,
      sales_end_at = (p_event ->> 'sales_end_at')::timestamptz,
      ticket_price = (p_event ->> 'ticket_price')::numeric,
      payment_card_number = regexp_replace(p_event ->> 'payment_card_number', '\s', '', 'g'),
      poster_url = nullif(p_event ->> 'poster_url', ''),
      artist_image_url = nullif(p_event ->> 'artist_image_url', '')
  where id = p_event_id;
end;
$$;

revoke all on function public.ticket_admin_update_event(uuid, jsonb, integer[]) from public, anon;
grant execute on function public.ticket_admin_update_event(uuid, jsonb, integer[]) to authenticated;
