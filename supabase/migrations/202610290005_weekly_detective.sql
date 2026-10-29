alter table public.profiles
  add column if not exists gold integer not null default 0 check (gold >= 0);

create table if not exists public.detective_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  location text not null,
  event_date text not null,
  week_start date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  clues jsonb not null check (jsonb_typeof(clues) = 'array' and jsonb_array_length(clues) = 5),
  final_question text not null,
  answer_options jsonb not null check (jsonb_typeof(answer_options) = 'array' and jsonb_array_length(answer_options) between 3 and 4),
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text not null,
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  reward_gold integer not null default 500 check (reward_gold between 1 and 1000000),
  status text not null default 'draft' check (status in ('draft', 'scheduled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(isodow from week_start) = 1),
  check ((starts_at at time zone 'Asia/Tashkent')::date = week_start),
  check ((ends_at at time zone 'Asia/Tashkent')::date = week_start + 5),
  check (ends_at > starts_at)
);

create unique index if not exists detective_one_scheduled_case_per_week_idx
  on public.detective_cases (week_start)
  where status = 'scheduled';

create table if not exists public.detective_answers (
  case_id uuid not null references public.detective_cases(id),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  answer_index smallint not null check (answer_index between 0 and 3),
  is_correct boolean not null,
  gold_awarded integer not null default 0 check (gold_awarded >= 0),
  submitted_at timestamptz not null default now(),
  primary key (case_id, user_id)
);

create index if not exists detective_answers_case_result_idx
  on public.detective_answers (case_id, is_correct, submitted_at);

alter table public.detective_cases enable row level security;
alter table public.detective_answers enable row level security;
revoke all on public.detective_cases, public.detective_answers from public, anon, authenticated;

create or replace function public.detective_get_current_case()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.detective_cases%rowtype;
  v_answer public.detective_answers%rowtype;
  v_now timestamptz := now();
  v_revealed smallint;
  v_local_date date := (v_now at time zone 'Asia/Tashkent')::date;
  v_has_answer boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign-in required';
  end if;

  select * into v_case
  from public.detective_cases
  where status = 'scheduled'
    and starts_at <= v_now
    and ends_at > v_now
    and v_local_date between week_start and week_start + 5
  order by week_start desc
  limit 1;

  if not found then
    return null;
  end if;

  v_revealed := greatest(
    0,
    least(5, floor(extract(epoch from (v_now - v_case.starts_at)) / 86400)::smallint + 1)
  );

  select * into v_answer
  from public.detective_answers
  where case_id = v_case.id and user_id = auth.uid();
  v_has_answer := found;

  return jsonb_build_object(
    'id', v_case.id,
    'title', v_case.title,
    'description', v_case.description,
    'location', v_case.location,
    'eventDate', v_case.event_date,
    'weekStart', v_case.week_start,
    'endsAt', v_case.ends_at,
    'isNewInvestigation', v_local_date = v_case.week_start,
    'revealedClues', (
      select coalesce(
        jsonb_agg(jsonb_build_object('day', e.ordinality, 'text', e.value) order by e.ordinality),
        '[]'::jsonb
      )
      from jsonb_array_elements_text(v_case.clues) with ordinality as e(value, ordinality)
      where e.ordinality <= v_revealed
    ),
    'nextOpenAt', case
      when v_revealed < 5 then v_case.starts_at + (v_revealed * interval '1 day')
      when v_now < v_case.starts_at + interval '5 days' then v_case.starts_at + interval '5 days'
      else v_case.ends_at
    end,
    'submissionOpen', v_now >= v_case.starts_at + interval '5 days',
    'finalQuestion', case when v_now >= v_case.starts_at + interval '5 days' then v_case.final_question else null end,
    'answerOptions', case when v_now >= v_case.starts_at + interval '5 days' then v_case.answer_options else null end,
    'rewardGold', v_case.reward_gold,
    'submitted', v_has_answer,
    'isCorrect', case when v_has_answer then v_answer.is_correct else null end,
    'selectedIndex', case when v_has_answer then v_answer.answer_index else null end,
    'goldAwarded', case when v_has_answer then v_answer.gold_awarded else 0 end,
    'explanation', case when v_has_answer then v_case.explanation else null end,
    'sources', case when v_has_answer then v_case.sources else null end
  );
end;
$$;

create or replace function public.detective_submit_answer(p_case_id uuid, p_answer_index integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.detective_cases%rowtype;
  v_user_id uuid := auth.uid();
  v_is_correct boolean;
  v_gold_awarded integer := 0;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Sign-in required';
  end if;
  if p_answer_index is null or p_answer_index < 0 or p_answer_index > 3 then
    raise exception 'Invalid answer';
  end if;

  select * into v_case
  from public.detective_cases
  where id = p_case_id and status = 'scheduled'
  for update;
  if not found then
    raise exception 'This investigation is not available';
  end if;

  if v_now < v_case.starts_at + interval '5 days'
    or v_now >= v_case.ends_at
    or (v_now at time zone 'Asia/Tashkent')::date <> v_case.week_start + 5 then
    raise exception 'Final answers are accepted on Saturday only';
  end if;

  if p_answer_index >= jsonb_array_length(v_case.answer_options) then
    raise exception 'Answer option does not exist';
  end if;

  v_is_correct := p_answer_index = v_case.correct_index;
  if v_is_correct then
    v_gold_awarded := v_case.reward_gold;
  end if;

  insert into public.detective_answers (case_id, user_id, answer_index, is_correct, gold_awarded)
  values (v_case.id, v_user_id, p_answer_index, v_is_correct, v_gold_awarded)
  on conflict (case_id, user_id) do nothing;
  if not found then
    raise exception 'You have already submitted an answer';
  end if;

  if v_is_correct then
    update public.profiles
    set gold = gold + v_gold_awarded,
        updated_at = v_now
    where user_id = v_user_id;
    if not found then
      raise exception 'Profile not found';
    end if;
  end if;

  return jsonb_build_object(
    'isCorrect', v_is_correct,
    'selectedIndex', p_answer_index,
    'goldAwarded', v_gold_awarded,
    'rewardGold', v_case.reward_gold,
    'explanation', v_case.explanation,
    'sources', v_case.sources
  );
end;
$$;

create or replace function public.detective_admin_save_case(p_case_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_case_id, gen_random_uuid());
  v_week_start date := (p_payload ->> 'weekStart')::date;
  v_start_time time := (p_payload ->> 'startTime')::time;
  v_end_time time := (p_payload ->> 'endTime')::time;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_options jsonb := p_payload -> 'answerOptions';
  v_clues jsonb := p_payload -> 'clues';
  v_sources jsonb := coalesce(p_payload -> 'sources', '[]'::jsonb);
  v_correct_index integer := (p_payload ->> 'correctIndex')::integer;
  v_reward integer := coalesce((p_payload ->> 'rewardGold')::integer, 500);
  v_status text := coalesce(p_payload ->> 'status', 'draft');
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception 'Admin role required';
  end if;

  if v_week_start is null or extract(isodow from v_week_start) <> 1 then
    raise exception 'Investigation start date must be a Monday';
  end if;
  if v_start_time is null or v_end_time is null then
    raise exception 'Start and end times are required';
  end if;
  if v_status not in ('draft', 'scheduled') then
    raise exception 'Status must be draft or scheduled';
  end if;
  if v_reward < 1 or v_reward > 1000000 then
    raise exception 'Gold reward must be between 1 and 1000000';
  end if;

  v_starts_at := (v_week_start + v_start_time) at time zone 'Asia/Tashkent';
  v_ends_at := (v_week_start + 5 + v_end_time) at time zone 'Asia/Tashkent';

  if v_status = 'scheduled' then
    if v_week_start <= (now() at time zone 'Asia/Tashkent')::date then
      raise exception 'Scheduled investigations must start on a future Monday';
    end if;
    if length(trim(coalesce(p_payload ->> 'title', ''))) < 3
      or length(trim(coalesce(p_payload ->> 'description', ''))) < 10
      or length(trim(coalesce(p_payload ->> 'location', ''))) < 2
      or length(trim(coalesce(p_payload ->> 'eventDate', ''))) < 4
      or jsonb_typeof(v_clues) <> 'array'
      or jsonb_array_length(v_clues) <> 5
      or exists (select 1 from jsonb_array_elements_text(v_clues) as clue(value) where length(trim(coalesce(clue.value, ''))) < 10)
      or length(trim(coalesce(p_payload ->> 'finalQuestion', ''))) < 10
      or jsonb_typeof(v_options) <> 'array'
      or jsonb_array_length(v_options) not between 3 and 4
      or exists (select 1 from jsonb_array_elements_text(v_options) as answer_option(value) where length(trim(coalesce(answer_option.value, ''))) < 2)
      or v_correct_index is null
      or v_correct_index < 0
      or v_correct_index >= jsonb_array_length(v_options)
      or length(trim(coalesce(p_payload ->> 'explanation', ''))) < 20
      or jsonb_typeof(v_sources) <> 'array'
      or jsonb_array_length(v_sources) < 1
      or exists (
        select 1
        from jsonb_array_elements(v_sources) as source(value)
        where length(trim(coalesce(source.value ->> 'title', ''))) < 3
          or coalesce(source.value ->> 'url', '') !~ '^https://'
      ) then
      raise exception 'A scheduled investigation requires five clues, 3-4 options, a correct answer, an explanation, and HTTPS sources';
    end if;
  end if;

  if p_case_id is not null then
    update public.detective_cases
    set title = coalesce(p_payload ->> 'title', ''),
        description = coalesce(p_payload ->> 'description', ''),
        location = coalesce(p_payload ->> 'location', ''),
        event_date = coalesce(p_payload ->> 'eventDate', ''),
        week_start = v_week_start,
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        clues = coalesce(v_clues, '[]'::jsonb),
        final_question = coalesce(p_payload ->> 'finalQuestion', ''),
        answer_options = coalesce(v_options, '[]'::jsonb),
        correct_index = coalesce(v_correct_index, 0),
        explanation = coalesce(p_payload ->> 'explanation', ''),
        sources = v_sources,
        reward_gold = v_reward,
        status = v_status,
        updated_at = now()
    where id = p_case_id
      and starts_at > now()
      and not exists (select 1 from public.detective_answers a where a.case_id = p_case_id);
    if not found then
      raise exception 'Investigation not found or answers have already been submitted';
    end if;
  else
    insert into public.detective_cases (
      id, title, description, location, event_date, week_start, starts_at, ends_at,
      clues, final_question, answer_options, correct_index, explanation, sources,
      reward_gold, status, created_by
    )
    values (
      v_id, coalesce(p_payload ->> 'title', ''), coalesce(p_payload ->> 'description', ''),
      coalesce(p_payload ->> 'location', ''), coalesce(p_payload ->> 'eventDate', ''),
      v_week_start, v_starts_at, v_ends_at, coalesce(v_clues, '[]'::jsonb),
      coalesce(p_payload ->> 'finalQuestion', ''), coalesce(v_options, '[]'::jsonb),
      coalesce(v_correct_index, 0), coalesce(p_payload ->> 'explanation', ''),
      v_sources, v_reward, v_status, auth.uid()
    );
  end if;

  return v_id;
end;
$$;

create or replace function public.detective_admin_list_cases()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception 'Admin role required';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'description', c.description,
        'location', c.location,
        'eventDate', c.event_date,
        'weekStart', c.week_start,
        'startsAt', c.starts_at,
        'endsAt', c.ends_at,
        'startTime', to_char(c.starts_at at time zone 'Asia/Tashkent', 'HH24:MI'),
        'endTime', to_char(c.ends_at at time zone 'Asia/Tashkent', 'HH24:MI'),
        'clues', c.clues,
        'finalQuestion', c.final_question,
        'answerOptions', c.answer_options,
        'correctIndex', c.correct_index,
        'explanation', c.explanation,
        'sources', c.sources,
        'rewardGold', c.reward_gold,
        'status', case
          when c.status = 'draft' then 'draft'
          when now() < c.starts_at then 'scheduled'
          when now() >= c.ends_at then 'completed'
          else 'active'
        end,
        'participantCount', (select count(*) from public.detective_answers a where a.case_id = c.id),
        'correctCount', (select count(*) from public.detective_answers a where a.case_id = c.id and a.is_correct),
        'goldAwarded', (select coalesce(sum(a.gold_awarded), 0) from public.detective_answers a where a.case_id = c.id),
        'participants', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'name', p.display_name,
            'publicId', p.public_id,
            'selectedIndex', a.answer_index,
            'selectedAnswer', c.answer_options ->> a.answer_index,
            'correct', a.is_correct,
            'goldAwarded', a.gold_awarded,
            'submittedAt', a.submitted_at
          ) order by a.submitted_at), '[]'::jsonb)
          from public.detective_answers a
          join public.profiles p on p.user_id = a.user_id
          where a.case_id = c.id
        )
      ) order by c.week_start desc
    )
    from public.detective_cases c
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.detective_get_current_case() from public, anon;
revoke all on function public.detective_submit_answer(uuid, integer) from public, anon;
revoke all on function public.detective_admin_save_case(uuid, jsonb) from public, anon;
revoke all on function public.detective_admin_list_cases() from public, anon;
grant execute on function public.detective_get_current_case() to authenticated;
grant execute on function public.detective_submit_answer(uuid, integer) to authenticated;
grant execute on function public.detective_admin_save_case(uuid, jsonb) to authenticated;
grant execute on function public.detective_admin_list_cases() to authenticated;
