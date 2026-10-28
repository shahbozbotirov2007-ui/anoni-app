create table if not exists public.profile_leaderboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_id text not null,
  display_name text not null,
  xp integer not null default 0,
  created_at timestamptz not null default now(),
  equipped_status text,
  leaderboard_hidden boolean not null default false,
  is_pro boolean not null default false
);

alter table public.profile_leaderboard enable row level security;
revoke all on public.profile_leaderboard from public, anon, authenticated;
grant select on public.profile_leaderboard to authenticated;

drop policy if exists "Authenticated users can read public leaderboard profiles"
on public.profile_leaderboard;

create policy "Authenticated users can read public leaderboard profiles"
on public.profile_leaderboard for select
to authenticated
using (true);

create or replace function public.sync_profile_leaderboard_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.profile_leaderboard where user_id = old.user_id;
    return old;
  end if;

  insert into public.profile_leaderboard (
    user_id,
    public_id,
    display_name,
    xp,
    created_at,
    equipped_status,
    leaderboard_hidden,
    is_pro
  )
  values (
    new.user_id,
    new.public_id,
    new.display_name,
    new.xp,
    new.created_at,
    new.equipped_status,
    new.leaderboard_hidden,
    coalesce(new.subscription_permanent, false)
      or coalesce(new.subscription_until > now(), false)
  )
  on conflict (user_id) do update
  set public_id = excluded.public_id,
      display_name = excluded.display_name,
      xp = excluded.xp,
      created_at = excluded.created_at,
      equipped_status = excluded.equipped_status,
      leaderboard_hidden = excluded.leaderboard_hidden,
      is_pro = excluded.is_pro;

  return new;
end;
$$;

drop trigger if exists sync_profile_leaderboard_row on public.profiles;
create trigger sync_profile_leaderboard_row
after insert or update or delete on public.profiles
for each row execute function public.sync_profile_leaderboard_row();

insert into public.profile_leaderboard (
  user_id,
  public_id,
  display_name,
  xp,
  created_at,
  equipped_status,
  leaderboard_hidden,
  is_pro
)
select
  user_id,
  public_id,
  display_name,
  xp,
  created_at,
  equipped_status,
  leaderboard_hidden,
  coalesce(subscription_permanent, false)
    or coalesce(subscription_until > now(), false)
from public.profiles
on conflict (user_id) do update
set public_id = excluded.public_id,
    display_name = excluded.display_name,
    xp = excluded.xp,
    created_at = excluded.created_at,
    equipped_status = excluded.equipped_status,
    leaderboard_hidden = excluded.leaderboard_hidden,
    is_pro = excluded.is_pro;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profile_leaderboard'
  ) then
    alter publication supabase_realtime add table public.profile_leaderboard;
  end if;
end;
$$;
