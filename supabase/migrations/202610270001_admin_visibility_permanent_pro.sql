alter table public.profiles
  add column if not exists leaderboard_hidden boolean not null default false,
  add column if not exists subscription_permanent boolean not null default false;

create or replace function public.admin_set_account_status(
  p_user_id uuid,
  p_action text,
  p_until timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception 'Admin role required';
  end if;

  if p_action = 'subscription' then
    if p_until is null then raise exception 'Subscription end date is required'; end if;
    update public.profiles
    set subscription_until = p_until,
        subscription_permanent = false,
        updated_at = now()
    where user_id = p_user_id;
  elsif p_action = 'subscription_permanent' then
    update public.profiles
    set subscription_until = null,
        subscription_permanent = true,
        updated_at = now()
    where user_id = p_user_id;
  elsif p_action in ('ban', 'unban') then
    if p_action = 'ban' and p_until is null then raise exception 'Ban end date is required'; end if;
    update public.profiles
    set banned_until = case when p_action = 'unban' then null else p_until end,
        updated_at = now()
    where user_id = p_user_id;
  else
    raise exception 'Invalid account action';
  end if;

  if not found then raise exception 'Profile not found'; end if;
end;
$$;

create or replace function public.admin_set_leaderboard_visibility(
  p_user_id uuid,
  p_hidden boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception 'Admin role required';
  end if;

  update public.profiles
  set leaderboard_hidden = p_hidden,
      updated_at = now()
  where user_id = p_user_id;

  if not found then raise exception 'Profile not found'; end if;
end;
$$;

revoke all on function public.admin_set_account_status(uuid, text, timestamptz) from public, anon;
revoke all on function public.admin_set_leaderboard_visibility(uuid, boolean) from public, anon;
grant execute on function public.admin_set_account_status(uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_set_leaderboard_visibility(uuid, boolean) to authenticated;
