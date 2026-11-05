drop trigger if exists ticket_profile_phone_matches_auth on public.ticket_profiles;
drop function if exists public.ticket_validate_profile_phone();

create or replace function public.ticket_reserve_seat(p_seat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_seat public.ticket_seats%rowtype;
  selected_event public.ticket_events%rowtype;
  new_order_id uuid;
  expires_at timestamptz := now() + interval '10 minutes';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.ticket_profiles p where p.user_id = auth.uid()
  ) then
    raise exception 'Complete your CRP Ticket profile before reserving a seat';
  end if;

  select * into selected_seat
  from public.ticket_seats
  where id = p_seat_id
  for update;
  if not found then raise exception 'Seat not found'; end if;

  select * into selected_event
  from public.ticket_events
  where id = selected_seat.event_id;
  if not found or not selected_event.published then raise exception 'Event is not available'; end if;
  if now() < selected_event.sales_start_at or now() >= selected_event.sales_end_at then
    raise exception 'Ticket sales are closed';
  end if;

  if selected_seat.status = 'reserved' and selected_seat.reserved_until <= now() then
    update public.ticket_orders
    set status = 'expired', reservation_expires_at = null
    where seat_id = p_seat_id and status = 'reserved';
    update public.ticket_seats
    set status = 'available', reserved_by = null, reserved_until = null
    where id = p_seat_id;
    selected_seat.status := 'available';
  end if;
  if selected_seat.status <> 'available' then raise exception 'Seat is no longer available'; end if;

  insert into public.ticket_orders(event_id, seat_id, user_id, amount, reservation_expires_at)
  values (selected_event.id, selected_seat.id, auth.uid(), selected_event.ticket_price, expires_at)
  returning id into new_order_id;
  update public.ticket_seats
  set status = 'reserved', reserved_by = auth.uid(), reserved_until = expires_at
  where id = p_seat_id;

  return jsonb_build_object('order_id', new_order_id, 'expires_at', expires_at);
end;
$$;
