create or replace view public.profiles_public
with (security_barrier = true)
as
select
  user_id,
  public_id,
  display_name,
  xp,
  created_at,
  equipped_status,
  leaderboard_hidden,
  (coalesce(subscription_permanent, false) or coalesce(subscription_until > now(), false)) as is_pro
from public.profiles;

revoke select on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;

drop policy if exists "Authenticated users can read profiles" on public.profiles;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.profiles', v_policy.policyname);
  end loop;
end;
$$;

create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (user_id = auth.uid());

create or replace function public.get_profiles_for_app()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean := (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
begin
  if auth.uid() is null then
    raise exception 'Sign-in required';
  end if;

  return jsonb_build_object(
    'public_profiles', (
      select coalesce(
        jsonb_agg(to_jsonb(p) order by p.xp desc, p.created_at asc),
        '[]'::jsonb
      )
      from public.profiles_public p
    ),
    'own_profile', (
      select to_jsonb(p)
      from public.profiles p
      where p.user_id = auth.uid()
    ),
    'admin_profiles', case when v_is_admin then (
      select coalesce(
        jsonb_agg(to_jsonb(p) order by p.xp desc, p.created_at asc),
        '[]'::jsonb
      )
      from public.profiles p
    ) else '[]'::jsonb end
  );
end;
$$;

create table if not exists public.challenge_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id text not null,
  choice text not null check (choice in ('A', 'B')),
  vote_date date not null default ((now() at time zone 'UTC')::date),
  created_at timestamptz not null default now(),
  primary key (user_id, challenge_id, vote_date)
);

alter table public.challenge_votes enable row level security;
revoke all on public.challenge_votes from public, anon, authenticated;

create or replace function public.submit_daily_challenge_vote(p_challenge_id text, p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'UTC')::date;
  v_choice text := upper(trim(p_choice));
  v_inserted integer;
  v_awarded integer := 0;
  v_recorded_choice text;
begin
  if auth.uid() is null then
    raise exception 'Sign-in required';
  end if;

  if p_challenge_id is null or p_challenge_id not in ('CH-1', 'CH-2') then
    raise exception 'Challenge is not eligible for rewards';
  end if;

  if v_choice is null or v_choice not in ('A', 'B') then
    raise exception 'Challenge choice must be A or B';
  end if;

  insert into public.challenge_votes (user_id, challenge_id, choice, vote_date)
  values (auth.uid(), p_challenge_id, v_choice, v_today)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    raise exception 'Challenge already completed today';
  end if;

  insert into public.profile_reward_events (user_id, activity, reference)
  values (auth.uid(), 'challenge', v_today::text || ':' || p_challenge_id)
  on conflict do nothing;
  get diagnostics v_awarded = row_count;

  if v_awarded = 0 then
    raise exception 'Challenge reward already claimed today';
  end if;

  update public.profiles
  set xp = xp + 15,
      coins = coins + 8,
      updated_at = now()
  where user_id = auth.uid();

  select choice into v_recorded_choice
  from public.challenge_votes
  where user_id = auth.uid()
    and challenge_id = p_challenge_id
    and vote_date = v_today;

  return jsonb_build_object(
    'choice', v_recorded_choice,
    'xp_awarded', 15,
    'coins_awarded', 8
  );
end;
$$;

revoke all on function public.get_profiles_for_app() from public, anon;
revoke all on function public.submit_daily_challenge_vote(text, text) from public, anon;
revoke all on function public.claim_challenge_reward(text) from public, anon, authenticated;
grant execute on function public.get_profiles_for_app() to authenticated;
grant execute on function public.submit_daily_challenge_vote(text, text) to authenticated;
