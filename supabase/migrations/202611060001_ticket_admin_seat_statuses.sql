begin;

create or replace function public.ticket_admin_set_seat_statuses(
  p_event_id uuid,
  p_offline_seats integer[],
  p_invitation_seats integer[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_event public.ticket_events%rowtype;
  offline_seats integer[] := coalesce(p_offline_seats, array[]::integer[]);
  invitation_seats integer[] := coalesce(p_invitation_seats, array[]::integer[]);
begin
  if not public.ticket_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  select *
    into selected_event
    from public.ticket_events
   where id = p_event_id
   for update;

  if not found then
    raise exception 'Event not found';
  end if;

  if cardinality(offline_seats) <> (
    select count(distinct seat_number)
      from unnest(offline_seats) as requested(seat_number)
  ) or cardinality(invitation_seats) <> (
    select count(distinct seat_number)
      from unnest(invitation_seats) as requested(seat_number)
  ) then
    raise exception 'Seat numbers must not be duplicated';
  end if;

  if exists (
    select 1
      from unnest(offline_seats || invitation_seats) as requested(seat_number)
     where requested.seat_number < 1
        or requested.seat_number > selected_event.seat_count
  ) then
    raise exception 'Seat is outside the event seat range';
  end if;

  if offline_seats && invitation_seats then
    raise exception 'A seat cannot be both offline-sold and an invitation';
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
       and (
         (seat.seat_number = any(offline_seats)
           and seat.status not in ('available', 'offline_sold', 'invitation'))
         or
         (seat.seat_number = any(invitation_seats)
           and seat.status not in ('available', 'invitation', 'offline_sold'))
       )
  ) then
    raise exception 'A selected seat is reserved or sold online and cannot be changed';
  end if;

  update public.ticket_seats
     set status = 'available',
         reserved_by = null,
         reserved_until = null
   where event_id = p_event_id
     and (
       (status = 'offline_sold' and not (seat_number = any(offline_seats)))
       or (status = 'invitation' and not (seat_number = any(invitation_seats)))
     );

  update public.ticket_seats
     set status = 'offline_sold',
         reserved_by = null,
         reserved_until = null
   where event_id = p_event_id
     and seat_number = any(offline_seats)
     and status in ('available', 'offline_sold');

  update public.ticket_seats
     set status = 'invitation',
         reserved_by = null,
         reserved_until = null
   where event_id = p_event_id
     and seat_number = any(invitation_seats)
     and status in ('available', 'invitation');
end;
$$;

revoke all on function public.ticket_admin_set_seat_statuses(uuid, integer[], integer[]) from public, anon;
grant execute on function public.ticket_admin_set_seat_statuses(uuid, integer[], integer[]) to authenticated;

commit;
