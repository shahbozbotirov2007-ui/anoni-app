drop policy if exists ticket_proof_upload_owner on storage.objects;
create policy ticket_proof_upload_owner on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ticket-payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.ticket_orders o
      where o.id::text = (storage.foldername(name))[2]
        and o.user_id = (select auth.uid())
        and o.status = 'reserved'
        and o.reservation_expires_at > now()
        and o.proof_path is null
    )
  );

drop policy if exists ticket_proof_delete_unattached_owner on storage.objects;
create policy ticket_proof_delete_unattached_owner on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ticket-payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.ticket_orders o
      where o.id::text = (storage.foldername(name))[2]
        and o.user_id = (select auth.uid())
        and o.proof_path is distinct from name
    )
  );
