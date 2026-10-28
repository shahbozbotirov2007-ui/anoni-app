create or replace function public.admin_delete_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception 'Admin role required';
  end if;

  if auth.uid() = p_user_id then
    raise exception 'Admins cannot delete their own account';
  end if;

  if exists (
    select 1
    from auth.users
    where id = p_user_id
      and raw_app_meta_data ->> 'role' = 'admin'
  ) then
    raise exception 'Administrator accounts must have admin role revoked before deletion';
  end if;

  delete from auth.users
  where id = p_user_id;

  if not found then
    raise exception 'User account not found';
  end if;
end;
$$;

revoke all on function public.admin_delete_user_account(uuid) from public, anon;
grant execute on function public.admin_delete_user_account(uuid) to authenticated;
