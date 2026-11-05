alter table public.ticket_profiles
  add column if not exists user_code text
    generated always as ('CRP-' || upper(replace(user_id::text, '-', ''))) stored;

create unique index if not exists ticket_profiles_user_code_idx
  on public.ticket_profiles(user_code);
