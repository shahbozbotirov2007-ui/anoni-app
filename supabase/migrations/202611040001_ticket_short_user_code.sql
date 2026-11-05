do $$
declare
  profile_count bigint;
begin
  select count(*) into profile_count from public.ticket_profiles;
  if profile_count > 999999 then
    raise exception 'Cannot assign six-digit user codes to more than 999999 profiles';
  end if;
end
$$;

alter table public.ticket_profiles
  alter column user_code drop expression;

create sequence if not exists public.ticket_user_code_seq
  as bigint
  minvalue 1
  maxvalue 999999
  start with 1
  no cycle;

with numbered_profiles as (
  select
    user_id,
    lpad(row_number() over (order by created_at, user_id)::text, 6, '0') as digits
  from public.ticket_profiles
)
update public.ticket_profiles as profile
set user_code = substr(numbered_profiles.digits, 1, 3) || '-' || substr(numbered_profiles.digits, 4, 3)
from numbered_profiles
where profile.user_id = numbered_profiles.user_id;

select setval(
  'public.ticket_user_code_seq',
  greatest((select count(*) from public.ticket_profiles), 1),
  (select count(*) > 0 from public.ticket_profiles)
);

alter table public.ticket_profiles
  alter column user_code set not null;

alter table public.ticket_profiles
  drop constraint if exists ticket_profiles_user_code_format;
alter table public.ticket_profiles
  add constraint ticket_profiles_user_code_format
  check (user_code ~ '^[0-9]{3}-[0-9]{3}$');

create or replace function public.ticket_assign_user_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  digits text;
begin
  if tg_op = 'INSERT' then
    digits := lpad(nextval('public.ticket_user_code_seq')::text, 6, '0');
    new.user_code := substr(digits, 1, 3) || '-' || substr(digits, 4, 3);
  else
    new.user_code := old.user_code;
  end if;
  return new;
end;
$$;

revoke all on sequence public.ticket_user_code_seq from public, anon, authenticated;
revoke all on function public.ticket_assign_user_code() from public, anon, authenticated;

drop trigger if exists ticket_profile_assign_user_code on public.ticket_profiles;
create trigger ticket_profile_assign_user_code
before insert or update on public.ticket_profiles
for each row execute function public.ticket_assign_user_code();

revoke insert, update on public.ticket_profiles from authenticated;
grant insert (user_id, full_name, phone), update (user_id, full_name, phone)
  on public.ticket_profiles to authenticated;
