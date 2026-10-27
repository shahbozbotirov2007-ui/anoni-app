create table if not exists public.feature_controls (
  feature_key text primary key,
  paused_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.feature_controls enable row level security;
revoke all on public.feature_controls from public, anon, authenticated;

insert into public.feature_controls (feature_key, paused_until)
values ('test_creation', '2026-11-03 18:00:00+05')
on conflict (feature_key) do nothing;

create or replace function public.get_test_creation_status()
returns timestamptz
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  pause_end timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select paused_until into pause_end
  from public.feature_controls
  where feature_key = 'test_creation';

  return pause_end;
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
  pause_end timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select paused_until into pause_end
  from public.feature_controls
  where feature_key = 'test_creation';

  if pause_end > now() then
    raise exception 'Test yaratish vaqtincha yopiq. Qayta ochilish vaqti: %',
      to_char(pause_end at time zone 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI');
  end if;

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

revoke all on function public.get_test_creation_status() from public, anon;
revoke all on function public.claim_test_creation_reward() from public, anon;
grant execute on function public.get_test_creation_status() to authenticated;
grant execute on function public.claim_test_creation_reward() to authenticated;
