begin;

alter table public.ticket_events
  add column if not exists ends_at timestamptz;

update public.ticket_events
set ends_at = starts_at + interval '3 hours'
where ends_at is null;

alter table public.ticket_events
  alter column ends_at set not null;

alter table public.ticket_events
  drop constraint if exists ticket_events_valid_end_time;
alter table public.ticket_events
  add constraint ticket_events_valid_end_time check (ends_at > starts_at);

grant select (ends_at) on public.ticket_events to anon, authenticated;

alter table public.ticket_orders
  add column if not exists rejection_reason text;

alter table public.ticket_tickets
  add column if not exists status text not null default 'valid',
  add column if not exists expired_at timestamptz,
  add column if not exists cancellation_reason text;

alter table public.ticket_tickets
  drop constraint if exists ticket_tickets_status_check;
alter table public.ticket_tickets
  add constraint ticket_tickets_status_check check (status in ('valid', 'expired', 'cancelled'));

create index if not exists ticket_orders_status_created_idx
  on public.ticket_orders(status, created_at desc);
create index if not exists ticket_tickets_status_expiry_idx
  on public.ticket_tickets(status, expired_at);

drop policy if exists ticket_tickets_read_owner_or_admin on public.ticket_tickets;
create policy ticket_tickets_read_owner_or_admin on public.ticket_tickets
  for select to authenticated
  using (
    (select public.ticket_user_is_admin())
    or (
      user_id = (select auth.uid())
      and status = 'valid'
      and exists (
        select 1
        from public.ticket_events e
        where e.id = ticket_tickets.event_id
          and now() < e.ends_at + interval '48 hours'
      )
    )
  );

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
  event_starts_at timestamptz := (p_event ->> 'starts_at')::timestamptz;
  event_ends_at timestamptz := (p_event ->> 'ends_at')::timestamptz;
  sales_starts_at timestamptz := (p_event ->> 'sales_start_at')::timestamptz;
  sales_ends_at timestamptz := (p_event ->> 'sales_end_at')::timestamptz;
begin
  if not public.ticket_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  if event_seat_count not between 1 and 5000 then
    raise exception 'Seat count must be between 1 and 5000';
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
  if event_ends_at <= event_starts_at then
    raise exception 'Event end time must be after its start time';
  end if;
  if sales_starts_at >= sales_ends_at or sales_ends_at > event_starts_at then
    raise exception 'Sale dates must end before the event starts';
  end if;
  if exists (
    select 1 from unnest(invite_seats) as invitation(seat_number)
    where invitation.seat_number < 1 or invitation.seat_number > event_seat_count
  ) then
    raise exception 'Invitation seat is outside the event seat range';
  end if;

  insert into public.ticket_events(
    title, description, location, starts_at, ends_at, sales_start_at, sales_end_at,
    ticket_price, seat_count, payment_card_number, charity_enabled,
    charity_percent, published, created_by, poster_url, artist_image_url
  )
  values (
    trim(p_event ->> 'title'),
    coalesce(p_event ->> 'description', ''),
    trim(p_event ->> 'location'),
    event_starts_at,
    event_ends_at,
    sales_starts_at,
    sales_ends_at,
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
  event_starts_at timestamptz := (p_event ->> 'starts_at')::timestamptz;
  event_ends_at timestamptz := (p_event ->> 'ends_at')::timestamptz;
  sales_starts_at timestamptz := (p_event ->> 'sales_start_at')::timestamptz;
  sales_ends_at timestamptz := (p_event ->> 'sales_end_at')::timestamptz;
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
  if event_ends_at <= event_starts_at then
    raise exception 'Event end time must be after its start time';
  end if;
  if sales_starts_at >= sales_ends_at or sales_ends_at > event_starts_at then
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
    select 1 from unnest(offline_seats) as requested(seat_number)
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
    select 1 from public.ticket_seats as seat
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
      starts_at = event_starts_at,
      ends_at = event_ends_at,
      sales_start_at = sales_starts_at,
      sales_end_at = sales_ends_at,
      ticket_price = (p_event ->> 'ticket_price')::numeric,
      payment_card_number = regexp_replace(p_event ->> 'payment_card_number', '\s', '', 'g'),
      poster_url = nullif(p_event ->> 'poster_url', ''),
      artist_image_url = nullif(p_event ->> 'artist_image_url', '')
  where id = p_event_id;
end;
$$;

drop function if exists public.ticket_reject_order(uuid);
create function public.ticket_reject_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_order public.ticket_orders%rowtype;
  rejection text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
begin
  if not public.ticket_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  if rejection is null then
    raise exception 'Rejection reason is required';
  end if;
  select * into selected_order
  from public.ticket_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if selected_order.status not in ('pending_review', 'needs_review') then
    raise exception 'Order can no longer be rejected';
  end if;

  update public.ticket_orders
  set status = 'rejected',
      rejection_reason = rejection,
      reservation_expires_at = null,
      reviewed_at = now()
  where id = p_order_id;
  update public.ticket_seats
  set status = 'available', reserved_by = null, reserved_until = null
  where id = selected_order.seat_id and status = 'reserved';
  if not found then
    raise exception 'Reserved seat is no longer available';
  end if;
end;
$$;

create or replace function public.ticket_approve_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_order public.ticket_orders%rowtype;
  ticket_id uuid;
  charity_value numeric(12, 2);
begin
  if not public.ticket_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  select * into selected_order
  from public.ticket_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if selected_order.status = 'approved' then
    select id into ticket_id
    from public.ticket_tickets
    where order_id = p_order_id;
    if ticket_id is null then
      raise exception 'Approved order has no ticket';
    end if;
    return ticket_id;
  end if;
  if selected_order.status not in ('pending_review', 'needs_review') then
    raise exception 'Order is not awaiting review';
  end if;

  select case when charity_enabled
    then round(selected_order.amount * charity_percent / 100, 2)
    else 0 end
  into charity_value
  from public.ticket_events
  where id = selected_order.event_id;

  update public.ticket_orders
  set status = 'approved', charity_amount = charity_value, reviewed_at = now()
  where id = p_order_id;
  update public.ticket_seats
  set status = 'sold', reserved_by = null, reserved_until = null
  where id = selected_order.seat_id and status = 'reserved';
  if not found then
    raise exception 'Reserved seat is no longer available';
  end if;

  insert into public.ticket_tickets(order_id, event_id, seat_id, user_id)
  values (selected_order.id, selected_order.event_id, selected_order.seat_id, selected_order.user_id)
  returning id into ticket_id;
  return ticket_id;
end;
$$;

create or replace function public.ticket_admin_cancel_ticket(p_ticket_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.ticket_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 500 then
    raise exception 'Cancellation reason must be between 2 and 500 characters';
  end if;
  update public.ticket_tickets
  set status = 'cancelled', cancellation_reason = trim(p_reason)
  where id = p_ticket_id and status = 'valid';
  if not found then
    raise exception 'Ticket not found or is no longer valid';
  end if;
end;
$$;

create or replace function public.ticket_admin_dashboard_stats()
returns table (
  total_seats bigint,
  available_seats bigint,
  sold_seats bigint,
  pending_orders bigint,
  approved_orders bigint,
  rejected_orders bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.ticket_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  return query
  select
    count(*)::bigint,
    count(*) filter (
      where s.status = 'available'
        or (s.status = 'reserved' and s.reserved_until <= now())
    )::bigint,
    count(*) filter (where s.status in ('sold', 'offline_sold'))::bigint,
    (select count(*) from public.ticket_orders o where o.status in ('pending_review', 'needs_review'))::bigint,
    (select count(*) from public.ticket_orders o where o.status = 'approved')::bigint,
    (select count(*) from public.ticket_orders o where o.status = 'rejected')::bigint
  from public.ticket_seats s;
end;
$$;

create or replace function public.ticket_support_order_context()
returns table (
  order_status text,
  amount numeric,
  created_at timestamptz,
  rejection_reason text,
  event_title text,
  seat_number integer,
  ticket_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  return query
  select
    o.status,
    o.amount,
    o.created_at,
    o.rejection_reason,
    e.title,
    s.seat_number,
    case
      when t.status = 'valid' and now() >= e.ends_at + interval '48 hours' then 'expired'
      else t.status
    end
  from public.ticket_orders o
  join public.ticket_events e on e.id = o.event_id
  join public.ticket_seats s on s.id = o.seat_id
  left join public.ticket_tickets t on t.order_id = o.id
  where o.user_id = auth.uid()
  order by o.created_at desc
  limit 10;
end;
$$;

create or replace function public.ticket_verify_ticket(p_ticket_code text)
returns table (
  is_valid boolean,
  status text,
  event_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  seat_number integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.status = 'valid' and now() < e.ends_at + interval '48 hours',
    case when t.status = 'valid' and now() < e.ends_at + interval '48 hours'
      then 'valid' else t.status end,
    e.title,
    e.starts_at,
    e.ends_at,
    s.seat_number
  from public.ticket_tickets t
  join public.ticket_events e on e.id = t.event_id
  join public.ticket_seats s on s.id = t.seat_id
  where t.ticket_code = upper(trim(p_ticket_code))
  limit 1;
$$;

create or replace function public.ticket_expire_and_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer;
begin
  update public.ticket_tickets t
  set status = 'expired', expired_at = now()
  from public.ticket_events e
  where e.id = t.event_id
    and t.status = 'valid'
    and now() >= e.ends_at + interval '48 hours';
  get diagnostics expired_count = row_count;

  delete from public.ticket_tickets
  where status = 'expired'
    and expired_at < now() - interval '30 days';

  return expired_count;
end;
$$;

revoke all on function public.ticket_admin_create_event(jsonb, integer[]) from public, anon;
revoke all on function public.ticket_admin_update_event(uuid, jsonb, integer[]) from public, anon;
revoke all on function public.ticket_reject_order(uuid, text) from public, anon;
revoke all on function public.ticket_approve_order(uuid) from service_role;
revoke all on function public.ticket_admin_cancel_ticket(uuid, text) from public, anon;
revoke all on function public.ticket_admin_dashboard_stats() from public, anon;
revoke all on function public.ticket_support_order_context() from public, anon;
revoke all on function public.ticket_verify_ticket(text) from public;
revoke all on function public.ticket_expire_and_cleanup() from public, anon, authenticated;
grant execute on function public.ticket_admin_create_event(jsonb, integer[]) to authenticated;
grant execute on function public.ticket_admin_update_event(uuid, jsonb, integer[]) to authenticated;
grant execute on function public.ticket_reject_order(uuid, text) to authenticated;
grant execute on function public.ticket_admin_cancel_ticket(uuid, text) to authenticated;
grant execute on function public.ticket_admin_dashboard_stats() to authenticated;
grant execute on function public.ticket_support_order_context() to authenticated;
grant execute on function public.ticket_verify_ticket(text) to anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'crp-ticket-expire-cleanup') then
    perform cron.unschedule('crp-ticket-expire-cleanup');
  end if;
  perform cron.schedule(
    'crp-ticket-expire-cleanup',
    '*/10 * * * *',
    'select public.ticket_expire_and_cleanup()'
  );
end
$$;

commit;
