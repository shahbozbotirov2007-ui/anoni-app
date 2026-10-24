create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  public_id text not null unique check (public_id ~ '^[0-9]{3}-[0-9]{3}$'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  age smallint not null check (age between 1 and 120),
  coins integer not null default 0 check (coins >= 0),
  xp integer not null default 0 check (xp >= 0),
  subscription_until timestamptz,
  banned_until timestamptz,
  last_login_date date,
  streak_day smallint not null default 0 check (streak_day between 0 and 16),
  tests_created_date date,
  tests_created_count smallint not null default 0 check (tests_created_count between 0 and 2),
  owned_items text[] not null default '{}',
  equipped_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_id text;
  generated_digits text;
  inserted_user_id uuid;
begin
  loop
    generated_digits := floor(100000 + random() * 900000)::integer::text;
    generated_id := substr(generated_digits, 1, 3) || '-' || substr(generated_digits, 4, 3);
    if generated_id = '777-777' then continue; end if;

    insert into public.profiles (user_id, public_id, display_name, age)
    values (
      new.id,
      generated_id,
      trim(coalesce(new.raw_user_meta_data ->> 'display_name', 'Foydalanuvchi')),
      coalesce((new.raw_user_meta_data ->> 'age')::smallint, 18)
    )
    on conflict (public_id) do nothing
    returning user_id into inserted_user_id;
    if inserted_user_id is not null then return new; end if;
  end loop;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
on public.profiles for select
to authenticated
using (true);

create table if not exists public.profile_reward_events (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  activity text not null,
  reference text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, activity, reference)
);

alter table public.profile_reward_events enable row level security;
revoke all on public.profile_reward_events from anon, authenticated;

create or replace function public.claim_daily_login_reward()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_profile public.profiles%rowtype;
  today date := (now() at time zone 'UTC')::date;
  day_gap integer;
  next_streak smallint;
  reward integer;
begin
  select * into current_profile
  from public.profiles where user_id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  if current_profile.last_login_date = today then
    return jsonb_build_object('coins_awarded', 0, 'streak_day', current_profile.streak_day);
  end if;

  day_gap := today - current_profile.last_login_date;
  if current_profile.last_login_date is null or day_gap > 1 or current_profile.streak_day >= 16 then
    next_streak := 1;
  else
    next_streak := current_profile.streak_day + 1;
  end if;
  reward := least(next_streak + 4, 10);

  update public.profiles
  set coins = coins + reward,
      last_login_date = today,
      streak_day = next_streak,
      updated_at = now()
  where user_id = auth.uid();

  return jsonb_build_object('coins_awarded', reward, 'streak_day', next_streak);
end;
$$;

create or replace function public.claim_test_creation_reward()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'UTC')::date;
  current_profile public.profiles%rowtype;
begin
  select * into current_profile from public.profiles
  where user_id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;

  if current_profile.tests_created_date = today and current_profile.tests_created_count >= 2 then
    raise exception 'Kunlik test yaratish limiti tugadi';
  end if;

  update public.profiles
  set xp = xp + 50,
      tests_created_date = today,
      tests_created_count = case
        when tests_created_date = today then tests_created_count + 1
        else 1
      end,
      updated_at = now()
  where user_id = auth.uid()
  returning * into current_profile;

  return jsonb_build_object('xp_awarded', 50, 'profile', to_jsonb(current_profile));
end;
$$;

create or replace function public.claim_challenge_reward(p_challenge_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today_key text := (now() at time zone 'UTC')::date::text;
  affected_rows integer;
begin
  if p_challenge_id not in ('CH-1', 'CH-2') then
    raise exception 'Challenge is not eligible for rewards';
  end if;

  insert into public.profile_reward_events (user_id, activity, reference)
  values (auth.uid(), 'challenge', today_key || ':' || p_challenge_id)
  on conflict do nothing;
  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception 'Challenge mukofoti oldin olingan';
  end if;

  update public.profiles set xp = xp + 15, coins = coins + 8, updated_at = now()
  where user_id = auth.uid();
  return jsonb_build_object('xp_awarded', 15, 'coins_awarded', 8);
end;
$$;

create or replace function public.admin_adjust_balance(
  p_user_id uuid,
  p_xp_delta integer,
  p_coin_delta integer
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
  set xp = greatest(0, xp + p_xp_delta),
      coins = greatest(0, coins + p_coin_delta),
      updated_at = now()
  where user_id = p_user_id;
  if not found then raise exception 'Profile not found'; end if;
end;
$$;

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
    update public.profiles set subscription_until = p_until, updated_at = now()
    where user_id = p_user_id;
  elsif p_action in ('ban', 'unban') then
    update public.profiles set banned_until = case when p_action = 'unban' then null else p_until end,
      updated_at = now()
    where user_id = p_user_id;
  else
    raise exception 'Invalid account action';
  end if;
  if not found then raise exception 'Profile not found'; end if;
end;
$$;

create or replace function public.purchase_profile_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_price integer;
  current_profile public.profiles%rowtype;
begin
  item_price := case p_item_id
    when 'status_heart' then 350
    when 'status_eagle' then 500
    when 'status_fire' then 700
    when 'status_crown' then 950
    when 'status_lightning' then 1200
    when 'status_star' then 1500
    when 'status_vip_check' then 2000
    when 'status_gold_check' then 4000
    else null
  end;
  if item_price is null then raise exception 'Unknown shop item'; end if;

  select * into current_profile from public.profiles
  where user_id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  if p_item_id = any(current_profile.owned_items) then
    raise exception 'Item already owned';
  end if;
  if current_profile.coins < item_price then raise exception 'Insufficient coins'; end if;

  update public.profiles
  set coins = coins - item_price,
      owned_items = array_append(owned_items, p_item_id),
      equipped_status = p_item_id,
      updated_at = now()
  where user_id = auth.uid()
  returning * into current_profile;
  return to_jsonb(current_profile);
end;
$$;

create or replace function public.equip_profile_item(p_item_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set equipped_status = p_item_id, updated_at = now()
  where user_id = auth.uid() and p_item_id = any(owned_items);
  if not found then raise exception 'Item is not owned'; end if;
end;
$$;

revoke all on function public.claim_daily_login_reward() from public, anon;
revoke all on function public.claim_test_creation_reward() from public, anon;
revoke all on function public.claim_challenge_reward(text) from public, anon;
revoke all on function public.admin_adjust_balance(uuid, integer, integer) from public, anon;
revoke all on function public.admin_set_account_status(uuid, text, timestamptz) from public, anon;
revoke all on function public.purchase_profile_item(text) from public, anon;
revoke all on function public.equip_profile_item(text) from public, anon;
grant execute on function public.claim_daily_login_reward() to authenticated;
grant execute on function public.claim_test_creation_reward() to authenticated;
grant execute on function public.claim_challenge_reward(text) to authenticated;
grant execute on function public.admin_adjust_balance(uuid, integer, integer) to authenticated;
grant execute on function public.admin_set_account_status(uuid, text, timestamptz) to authenticated;
grant execute on function public.purchase_profile_item(text) to authenticated;
grant execute on function public.equip_profile_item(text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
