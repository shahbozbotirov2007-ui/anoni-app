create or replace function public.has_claimed_telegram_join_reward()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign-in required';
  end if;

  return exists (
    select 1
    from public.profile_reward_events
    where user_id = auth.uid()
      and activity = 'telegram_channel_join'
      and reference = 'anoni_uz'
  );
end;
$$;

create or replace function public.claim_telegram_join_reward()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted integer;
begin
  if v_user_id is null then
    raise exception 'Sign-in required';
  end if;

  perform 1
  from public.profiles
  where user_id = v_user_id
  for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  insert into public.profile_reward_events (user_id, activity, reference)
  values (v_user_id, 'telegram_channel_join', 'anoni_uz')
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object('coins_awarded', 0, 'already_claimed', true);
  end if;

  update public.profiles
  set coins = coins + 500,
      updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object('coins_awarded', 500, 'already_claimed', false);
end;
$$;

revoke all on function public.has_claimed_telegram_join_reward() from public, anon;
revoke all on function public.claim_telegram_join_reward() from public, anon;
grant execute on function public.has_claimed_telegram_join_reward() to authenticated;
grant execute on function public.claim_telegram_join_reward() to authenticated;
