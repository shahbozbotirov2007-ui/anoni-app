begin;

drop policy if exists ticket_proof_delete_admin on storage.objects;
create policy ticket_proof_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ticket-payment-proofs'
    and (select public.ticket_user_is_admin())
  );

create or replace function public.ticket_admin_delete_all_events()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_tickets integer;
  deleted_orders integer;
  deleted_seats integer;
  deleted_events integer;
begin
  if not public.ticket_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  delete from public.ticket_tickets;
  get diagnostics deleted_tickets = row_count;

  delete from public.ticket_orders;
  get diagnostics deleted_orders = row_count;

  delete from public.ticket_seats;
  get diagnostics deleted_seats = row_count;

  delete from public.ticket_events;
  get diagnostics deleted_events = row_count;

  return jsonb_build_object(
    'deleted_tickets', deleted_tickets,
    'deleted_orders', deleted_orders,
    'deleted_seats', deleted_seats,
    'deleted_events', deleted_events
  );
end;
$$;

revoke all on function public.ticket_admin_delete_all_events() from public, anon;
grant execute on function public.ticket_admin_delete_all_events() to authenticated;

commit;
