begin;

create or replace function public.ticket_change_reservation(
  p_order_id uuid,
  p_new_seat_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_order public.ticket_orders%rowtype;
  current_seat public.ticket_seats%rowtype;
  next_seat public.ticket_seats%rowtype;
  selected_event public.ticket_events%rowtype;
  reservation_seat_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select seat_id
    into reservation_seat_id
    from public.ticket_orders
   where id = p_order_id
     and user_id = auth.uid();

  if not found then
    raise exception 'Reservation not found';
  end if;

  perform seat.id
    from public.ticket_seats as seat
   where seat.id = reservation_seat_id
      or (p_new_seat_id is not null and seat.id = p_new_seat_id)
   order by seat.id
   for update;

  select *
    into selected_order
    from public.ticket_orders
   where id = p_order_id
     and user_id = auth.uid()
   for update;

  if not found then
    raise exception 'Reservation not found';
  end if;
  if selected_order.status <> 'reserved' then
    raise exception 'Reservation can no longer be changed';
  end if;
  if selected_order.seat_id <> reservation_seat_id then
    raise exception 'Reservation changed; please retry';
  end if;

  select *
    into current_seat
    from public.ticket_seats
   where id = selected_order.seat_id;

  if not found or current_seat.status <> 'reserved' or current_seat.reserved_by <> auth.uid() then
    raise exception 'Reserved seat is no longer available';
  end if;

  if selected_order.reservation_expires_at is null or selected_order.reservation_expires_at <= now() then
    update public.ticket_orders
       set status = 'expired',
           reservation_expires_at = null
     where id = selected_order.id;
    update public.ticket_seats
       set status = 'available',
           reserved_by = null,
           reserved_until = null
     where id = current_seat.id;
    return jsonb_build_object('cancelled', true, 'expired', true);
  end if;

  if p_new_seat_id is null or p_new_seat_id = current_seat.id then
    update public.ticket_orders
       set status = 'expired',
           reservation_expires_at = null
     where id = selected_order.id;
    update public.ticket_seats
       set status = 'available',
           reserved_by = null,
           reserved_until = null
     where id = current_seat.id;
    return jsonb_build_object('cancelled', true, 'expired', false);
  end if;

  select *
    into next_seat
    from public.ticket_seats
   where id = p_new_seat_id;

  if not found or next_seat.event_id <> current_seat.event_id then
    raise exception 'Selected seat is not part of this event';
  end if;
  if next_seat.status <> 'available' then
    raise exception 'Selected seat is no longer available';
  end if;

  select *
    into selected_event
    from public.ticket_events
   where id = current_seat.event_id;

  if not found or not selected_event.published then
    raise exception 'Event is not available';
  end if;
  if now() < selected_event.sales_start_at or now() >= selected_event.sales_end_at then
    raise exception 'Ticket sales are closed';
  end if;

  update public.ticket_seats
     set status = 'available',
         reserved_by = null,
         reserved_until = null
   where id = current_seat.id;

  update public.ticket_seats
     set status = 'reserved',
         reserved_by = auth.uid(),
         reserved_until = selected_order.reservation_expires_at
   where id = next_seat.id
     and status = 'available';

  if not found then
    raise exception 'Selected seat is no longer available';
  end if;

  update public.ticket_orders
     set seat_id = next_seat.id,
         amount = selected_event.ticket_price
   where id = selected_order.id;

  return jsonb_build_object(
    'cancelled', false,
    'order_id', selected_order.id,
    'seat_id', next_seat.id,
    'expires_at', selected_order.reservation_expires_at
  );
end;
$$;

revoke all on function public.ticket_change_reservation(uuid, uuid) from public, anon;
grant execute on function public.ticket_change_reservation(uuid, uuid) to authenticated;

commit;
