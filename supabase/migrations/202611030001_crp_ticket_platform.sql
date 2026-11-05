create or replace function public.ticket_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

revoke all on function public.ticket_user_is_admin() from public, anon;
grant execute on function public.ticket_user_is_admin() to anon, authenticated, service_role;

create table if not exists public.ticket_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 100),
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.ticket_validate_profile_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_phone text;
begin
  select phone into verified_phone from auth.users where id = new.user_id;
  if verified_phone is null or new.phone is distinct from verified_phone then
    raise exception 'Profile phone must match the verified authentication phone';
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_profile_phone_matches_auth on public.ticket_profiles;
create trigger ticket_profile_phone_matches_auth
before insert or update of phone, user_id on public.ticket_profiles
for each row execute function public.ticket_validate_profile_phone();

create table if not exists public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text not null default '',
  location text not null check (char_length(trim(location)) between 2 and 240),
  starts_at timestamptz not null,
  sales_start_at timestamptz not null,
  sales_end_at timestamptz not null,
  ticket_price numeric(12, 2) not null check (ticket_price > 0),
  seat_count integer not null check (seat_count between 1 and 5000),
  payment_card_number text not null check (payment_card_number ~ '^[0-9 ]{16,23}$'),
  charity_enabled boolean not null default false,
  charity_percent numeric(5, 2) not null default 0 check (charity_percent between 0 and 100),
  published boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (sales_start_at < sales_end_at and sales_end_at <= starts_at)
);

create table if not exists public.ticket_seats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  seat_number integer not null check (seat_number > 0),
  status text not null default 'available'
    check (status in ('available', 'reserved', 'sold', 'invitation')),
  reserved_by uuid references auth.users(id) on delete set null,
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, seat_number),
  check (status = 'reserved' or reserved_until is null)
);

create table if not exists public.ticket_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ticket_events(id),
  seat_id uuid not null references public.ticket_seats(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'pending_review', 'needs_review', 'approved', 'rejected', 'expired')),
  proof_path text,
  receipt_fingerprint text unique,
  ai_result jsonb,
  charity_amount numeric(12, 2) not null default 0 check (charity_amount >= 0),
  reservation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check ((status = 'reserved') = (reservation_expires_at is not null))
);

create unique index if not exists ticket_orders_one_live_seat
  on public.ticket_orders(seat_id)
  where status in ('reserved', 'pending_review', 'needs_review', 'approved');
create index if not exists ticket_events_public_start_idx
  on public.ticket_events(published, starts_at);
create index if not exists ticket_seats_event_status_idx
  on public.ticket_seats(event_id, status, seat_number);
create index if not exists ticket_orders_user_created_idx
  on public.ticket_orders(user_id, created_at desc);
create index if not exists ticket_orders_review_idx
  on public.ticket_orders(status, created_at)
  where status in ('pending_review', 'needs_review');

create table if not exists public.ticket_tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.ticket_orders(id),
  event_id uuid not null references public.ticket_events(id),
  seat_id uuid not null unique references public.ticket_seats(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_code text not null unique default upper(replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now()
);
create index if not exists ticket_tickets_user_idx on public.ticket_tickets(user_id, created_at desc);

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['ticket_seats', 'ticket_orders', 'ticket_tickets'] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end
$$;

create table if not exists public.ticket_banners (
  id uuid primary key default gen_random_uuid(),
  image_path text not null,
  image_url text not null,
  title text not null default '',
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.ticket_user_owns_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ticket_orders o
    where o.event_id = p_event_id and o.user_id = auth.uid()
  ) or exists (
    select 1 from public.ticket_tickets t
    where t.event_id = p_event_id and t.user_id = auth.uid()
  );
$$;

create or replace function public.ticket_user_owns_seat(p_seat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ticket_orders o
    where o.seat_id = p_seat_id and o.user_id = auth.uid()
  ) or exists (
    select 1 from public.ticket_tickets t
    where t.seat_id = p_seat_id and t.user_id = auth.uid()
  );
$$;

revoke all on function public.ticket_user_owns_event(uuid) from public;
revoke all on function public.ticket_user_owns_seat(uuid) from public;
grant execute on function public.ticket_user_owns_event(uuid) to anon, authenticated;
grant execute on function public.ticket_user_owns_seat(uuid) to anon, authenticated;

create or replace function public.ticket_create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is not null then
    insert into public.ticket_profiles(user_id, full_name, phone)
    values (
      new.id,
      left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'display_name', 'Foydalanuvchi')), 100),
      new.phone
    )
    on conflict (user_id) do update
      set phone = excluded.phone, updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_profile_after_auth_insert on auth.users;
create trigger ticket_profile_after_auth_insert
after insert or update of phone on auth.users
for each row execute function public.ticket_create_profile_for_auth_user();

insert into public.ticket_profiles(user_id, full_name, phone)
select id,
       left(trim(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'display_name', 'Foydalanuvchi')), 100),
       phone
from auth.users
where phone is not null
on conflict (user_id) do nothing;

alter table public.ticket_profiles enable row level security;
alter table public.ticket_events enable row level security;
alter table public.ticket_seats enable row level security;
alter table public.ticket_orders enable row level security;
alter table public.ticket_tickets enable row level security;
alter table public.ticket_banners enable row level security;

revoke all on public.ticket_profiles, public.ticket_events, public.ticket_seats,
  public.ticket_orders, public.ticket_tickets, public.ticket_banners from anon, authenticated;
grant select (
  id, title, description, location, starts_at, sales_start_at, sales_end_at,
  ticket_price, seat_count, payment_card_number, charity_enabled, charity_percent, published
) on public.ticket_events to anon, authenticated;
grant select on public.ticket_banners to anon, authenticated;
grant select (id, event_id, seat_number, status) on public.ticket_seats to anon, authenticated;
grant select on public.ticket_profiles, public.ticket_orders, public.ticket_tickets to authenticated;
grant insert, update on public.ticket_profiles to authenticated;
grant insert, update, delete on public.ticket_banners to authenticated;

drop policy if exists ticket_profiles_read_own on public.ticket_profiles;
create policy ticket_profiles_read_own on public.ticket_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.ticket_user_is_admin()));
drop policy if exists ticket_profiles_insert_own on public.ticket_profiles;
create policy ticket_profiles_insert_own on public.ticket_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists ticket_profiles_update_own on public.ticket_profiles;
create policy ticket_profiles_update_own on public.ticket_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists ticket_events_public_or_admin on public.ticket_events;
create policy ticket_events_public_or_admin on public.ticket_events
  for select to anon, authenticated
  using (
    published
    or (select public.ticket_user_is_admin())
    or (select public.ticket_user_owns_event(id))
  );
drop policy if exists ticket_seats_public_or_admin on public.ticket_seats;
create policy ticket_seats_public_or_admin on public.ticket_seats
  for select to anon, authenticated
  using (
    (select public.ticket_user_is_admin())
    or exists (
      select 1 from public.ticket_events e
      where e.id = ticket_seats.event_id and e.published
    )
    or (select public.ticket_user_owns_seat(id))
  );
drop policy if exists ticket_orders_read_owner_or_admin on public.ticket_orders;
create policy ticket_orders_read_owner_or_admin on public.ticket_orders
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.ticket_user_is_admin()));
drop policy if exists ticket_tickets_read_owner_or_admin on public.ticket_tickets;
create policy ticket_tickets_read_owner_or_admin on public.ticket_tickets
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.ticket_user_is_admin()));
drop policy if exists ticket_banners_public_or_admin on public.ticket_banners;
create policy ticket_banners_public_or_admin on public.ticket_banners
  for select to anon, authenticated
  using (active or (select public.ticket_user_is_admin()));

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
  if exists (  select 1 from unnest(invite_seats) as invitation(seat_number)
  where invitation.seat_number < 1 or invitation.seat_number > event_seat_count) then
    raise exception 'Invitation seat is outside the event seat range';
  end if;

  insert into public.ticket_events(
    title, description, location, starts_at, sales_start_at, sales_end_at,
    ticket_price, seat_count, payment_card_number, charity_enabled,
    charity_percent, published, created_by
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
    p_event ->> 'payment_card_number',
    coalesce((p_event ->> 'charity_enabled')::boolean, false),
    coalesce((p_event ->> 'charity_percent')::numeric, 0),
    coalesce((p_event ->> 'published')::boolean, false),
    auth.uid()
  )
  returning id into new_event_id;

  insert into public.ticket_seats(event_id, seat_number, status)
  select new_event_id, seat_number,
    case when seat_number = any(invite_seats) then 'invitation' else 'available' end
  from generate_series(1, event_seat_count) as seats(seat_number);

  return new_event_id;
end;
$$;

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

create or replace function public.ticket_get_seats(p_event_id uuid)
returns table (
  id uuid,
  event_id uuid,
  seat_number integer,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.ticket_user_is_admin()
     and not exists (
       select 1 from public.ticket_events e
       where e.id = p_event_id and e.published
     ) then
    raise exception 'Event is not available';
  end if;

  update public.ticket_seats
  set status = 'available', reserved_by = null, reserved_until = null
  where ticket_seats.event_id = p_event_id
    and ticket_seats.status = 'reserved'
    and ticket_seats.reserved_until <= now();
  update public.ticket_orders
  set status = 'expired', reservation_expires_at = null
  where ticket_orders.event_id = p_event_id
    and ticket_orders.status = 'reserved'
    and ticket_orders.reservation_expires_at <= now();

  return query
  select s.id, s.event_id, s.seat_number, s.status
  from public.ticket_seats s
  where s.event_id = p_event_id
  order by s.seat_number;
end;
$$;

create or replace function public.ticket_set_order_review_state(
  p_order_id uuid,
  p_proof_path text,
  p_receipt_fingerprint text,
  p_ai_result jsonb,
  p_needs_review boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_order public.ticket_orders%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service access required';
  end if;
  select * into selected_order from public.ticket_orders where id = p_order_id for update;
  if not found then
    raise exception 'Reservation not found';
  end if;
  if selected_order.status = 'reserved'
     and selected_order.reservation_expires_at <= now() then
    raise exception 'Reservation expired or is no longer available';
  end if;
  if selected_order.status not in ('reserved', 'pending_review', 'needs_review') then
    raise exception 'Reservation is no longer available';
  end if;
  update public.ticket_orders
  set proof_path = p_proof_path,
      receipt_fingerprint = p_receipt_fingerprint,
      ai_result = p_ai_result,
      status = case when p_needs_review then 'needs_review' else 'pending_review' end,
      reservation_expires_at = null
  where id = p_order_id;
  update public.ticket_seats
  set reserved_until = null
  where id = selected_order.seat_id and status = 'reserved';
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
  if not public.ticket_user_is_admin()
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Admin access required';
  end if;
  select * into selected_order from public.ticket_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if selected_order.status = 'approved' then
    select id into ticket_id from public.ticket_tickets where order_id = p_order_id;
    return ticket_id;
  end if;
  if selected_order.status not in ('pending_review', 'needs_review') then
    raise exception 'Order is not awaiting review';
  end if;

  select case when charity_enabled
    then round(selected_order.amount * charity_percent / 100, 2)
    else 0 end
  into charity_value
  from public.ticket_events where id = selected_order.event_id;

  update public.ticket_orders
  set status = 'approved', charity_amount = charity_value, reviewed_at = now()
  where id = p_order_id;
  update public.ticket_seats
  set status = 'sold', reserved_by = null, reserved_until = null
  where id = selected_order.seat_id and status = 'reserved';
  if not found then raise exception 'Reserved seat is no longer available'; end if;

  insert into public.ticket_tickets(order_id, event_id, seat_id, user_id)
  values (selected_order.id, selected_order.event_id, selected_order.seat_id, selected_order.user_id)
  returning id into ticket_id;
  return ticket_id;
end;
$$;

create or replace function public.ticket_reject_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_order public.ticket_orders%rowtype;
begin
  if not public.ticket_user_is_admin() then raise exception 'Admin access required'; end if;
  select * into selected_order from public.ticket_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if selected_order.status not in ('pending_review', 'needs_review') then
    raise exception 'Order can no longer be rejected';
  end if;
  update public.ticket_orders
  set status = 'rejected', reservation_expires_at = null, reviewed_at = now()
  where id = p_order_id;
  update public.ticket_seats
  set status = 'available', reserved_by = null, reserved_until = null
  where id = selected_order.seat_id and status = 'reserved';
end;
$$;

revoke all on function public.ticket_admin_create_event(jsonb, integer[]) from public, anon;
revoke all on function public.ticket_reserve_seat(uuid) from public, anon;
revoke all on function public.ticket_get_seats(uuid) from public, anon;
revoke all on function public.ticket_set_order_review_state(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.ticket_approve_order(uuid) from public, anon;
revoke all on function public.ticket_reject_order(uuid) from public, anon;
grant execute on function public.ticket_admin_create_event(jsonb, integer[]) to authenticated;
grant execute on function public.ticket_reserve_seat(uuid) to authenticated;
grant execute on function public.ticket_get_seats(uuid) to anon, authenticated;
grant execute on function public.ticket_set_order_review_state(uuid, text, text, jsonb, boolean) to service_role;
grant execute on function public.ticket_approve_order(uuid) to authenticated, service_role;
grant execute on function public.ticket_reject_order(uuid) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('ticket-payment-proofs', 'ticket-payment-proofs', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('ticket-banners', 'ticket-banners', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    public = excluded.public,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ticket_proof_read_owner_or_admin on storage.objects;
create policy ticket_proof_read_owner_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ticket-payment-proofs'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.ticket_user_is_admin()))
  );
drop policy if exists ticket_banner_upload_admin on storage.objects;
create policy ticket_banner_upload_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ticket-banners' and (select public.ticket_user_is_admin()));
drop policy if exists ticket_banner_update_admin on storage.objects;
create policy ticket_banner_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'ticket-banners' and (select public.ticket_user_is_admin()))
  with check (bucket_id = 'ticket-banners' and (select public.ticket_user_is_admin()));
drop policy if exists ticket_banner_delete_admin on storage.objects;
create policy ticket_banner_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'ticket-banners' and (select public.ticket_user_is_admin()));

drop policy if exists ticket_banner_metadata_admin on public.ticket_banners;
create policy ticket_banner_metadata_admin on public.ticket_banners
  for all to authenticated
  using ((select public.ticket_user_is_admin()))
  with check ((select public.ticket_user_is_admin()));

create or replace function public.ticket_admin_set_event_published(p_event_id uuid, p_published boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.ticket_user_is_admin() then raise exception 'Admin access required'; end if;
  update public.ticket_events set published = p_published where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
end;
$$;
revoke all on function public.ticket_admin_set_event_published(uuid, boolean) from public, anon;
grant execute on function public.ticket_admin_set_event_published(uuid, boolean) to authenticated;
