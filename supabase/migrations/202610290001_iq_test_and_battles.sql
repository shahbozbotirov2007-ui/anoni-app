create table if not exists public.iq_questions (
  id integer primary key,
  category text not null check (category in ('Mantiq', 'Matematika', 'Vizual', 'Qonuniyat', 'Diqqat')),
  difficulty smallint not null check (difficulty between 1 and 5),
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_index smallint not null check (correct_index between 0 and 3)
);

with question_seed as (
  select
    n,
    (n / 20) + 1 as difficulty,
    n % 5 as category_id,
    (n / 5) + 1 as k
  from generate_series(0, 99) as series(n)
),
question_content as (
  select
    n,
    difficulty,
    case category_id
      when 0 then 'Mantiq'
      when 1 then 'Matematika'
      when 2 then 'Vizual'
      when 3 then 'Qonuniyat'
      else 'Diqqat'
    end as category,
    case category_id
      when 0 then format(
        'Ketma-ketlikni davom ettiring: %s, %s, %s, %s, ?',
        k, k + difficulty, 2 * k + difficulty, 3 * k + 2 * difficulty
      )
      when 1 then format('Hisoblang: (%s + %s) × %s − %s', k, difficulty, difficulty + 1, k)
      when 2 then format(
        'Shakllar ketma-ketligini davom ettiring: %s → %s → %s → %s → %s → ?',
        (array['○', '△', '□', '◇'])[(k % 4) + 1],
        (array['○', '△', '□', '◇'])[((k + 1) % 4) + 1],
        (array['○', '△', '□', '◇'])[((k + 2) % 4) + 1],
        (array['○', '△', '□', '◇'])[((k + 3) % 4) + 1],
        (array['○', '△', '□', '◇'])[((k + 4) % 4) + 1]
      )
      when 3 then format('Qatorni davom ettiring: %s, %s, %s, %s, ?', k, k + 2 * difficulty, k + 4 * difficulty, k + 6 * difficulty)
      else format('Quyidagi qatorda nechta ● belgisi bor? %s', repeat('●▲●■', (k % 5) + 2))
    end as question,
    case category_id
      when 0 then 5 * k + 3 * difficulty
      when 1 then (k + difficulty) * (difficulty + 1) - k
      when 2 then ((k + 5) % 4)
      when 3 then k + 8 * difficulty
      else 2 * ((k % 5) + 2)
    end as answer_value,
    (n % 4) as correct_position,
    k
  from question_seed
)
insert into public.iq_questions (id, category, difficulty, question, options, correct_index)
select
  c.n + 1,
  c.category,
  c.difficulty,
  c.question,
  case
    when c.category = 'Vizual' then (
      select jsonb_agg(to_jsonb((array['○', '△', '□', '◇'])[
        (((c.answer_value - c.correct_position + p.option_position) % 4) + 4) % 4 + 1
      ]) order by p.option_position)
      from generate_series(0, 3) as p(option_position)
    )
    else (
      select jsonb_agg(
        to_jsonb(
          case when p.option_position = c.correct_position then c.answer_value
          else c.answer_value + (array[-2, -1, 1])[
            case when p.option_position < c.correct_position then p.option_position + 1 else p.option_position end
          ]
          end
        ) order by p.option_position
      )
      from generate_series(0, 3) as p(option_position)
    )
  end,
  c.correct_position
from question_content c
on conflict (id) do nothing;

do $$
begin
  if (select count(*) from public.iq_questions) <> 100
    or exists (
      select 1
      from public.iq_questions
      group by difficulty
      having count(*) <> 20
    )
    or exists (
      select 1
      from public.iq_questions
      group by category
      having count(*) <> 20
    ) then
    raise exception 'IQ question bank must have 100 questions, evenly split by difficulty and category';
  end if;
end;
$$;

create table if not exists public.iq_battles (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default upper(replace(gen_random_uuid()::text, '-', '')),
  created_by uuid not null references auth.users(id) on delete cascade,
  opponent_id uuid references auth.users(id) on delete cascade,
  question_ids integer[] not null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'completed')),
  winner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.iq_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('solo', 'battle')),
  battle_id uuid references public.iq_battles(id) on delete cascade,
  question_ids integer[] not null,
  current_index smallint not null default 1,
  correct_count smallint not null default 0,
  category_correct jsonb not null default '{}'::jsonb,
  category_total jsonb not null default '{}'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  question_started_at timestamptz not null default now(),
  completed_at timestamptz,
  score smallint,
  duration_seconds integer,
  duration_milliseconds integer,
  check ((mode = 'solo' and battle_id is null) or (mode = 'battle' and battle_id is not null))
);

create index if not exists iq_attempts_user_latest_idx on public.iq_attempts (user_id, started_at desc);
create index if not exists iq_attempts_battle_idx on public.iq_attempts (battle_id, user_id);
create unique index if not exists iq_attempts_one_active_solo_idx on public.iq_attempts (user_id)
  where mode = 'solo' and completed_at is null;
create unique index if not exists iq_attempts_battle_participant_idx on public.iq_attempts (battle_id, user_id)
  where battle_id is not null;

alter table public.iq_questions enable row level security;
alter table public.iq_battles enable row level security;
alter table public.iq_attempts enable row level security;

revoke all on public.iq_questions, public.iq_battles, public.iq_attempts from public, anon, authenticated;

create or replace function public.iq_attempt_payload(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.iq_attempts%rowtype;
  v_question public.iq_questions%rowtype;
  v_battle jsonb;
begin
  select * into v_attempt
  from public.iq_attempts
  where id = p_attempt_id;

  if not found then
    raise exception 'IQ attempt not found';
  end if;

  if v_attempt.completed_at is null then
    select * into v_question
    from public.iq_questions
    where id = v_attempt.question_ids[v_attempt.current_index];
  end if;

  if v_attempt.battle_id is not null then
    select jsonb_build_object(
      'inviteCode', b.invite_code,
      'status', b.status,
      'winnerUserId', b.winner_user_id,
      'opponentName', coalesce(p.display_name, 'Do‘st'),
      'opponentCompleted', oa.completed_at is not null,
      'opponentScore', oa.score,
      'opponentDurationSeconds', oa.duration_seconds
    ) into v_battle
    from public.iq_battles b
    left join public.profiles p
      on p.user_id = case when b.created_by = v_attempt.user_id then b.opponent_id else b.created_by end
    left join public.iq_attempts oa
      on oa.battle_id = b.id
      and oa.user_id = case when b.created_by = v_attempt.user_id then b.opponent_id else b.created_by end
    where b.id = v_attempt.battle_id;
  end if;

  return jsonb_build_object(
    'attemptId', v_attempt.id,
    'mode', v_attempt.mode,
    'currentIndex', v_attempt.current_index,
    'totalQuestions', cardinality(v_attempt.question_ids),
    'deadline', case when v_attempt.completed_at is null then v_attempt.question_started_at + interval '45 seconds' else null end,
    'completed', v_attempt.completed_at is not null,
    'score', v_attempt.score,
    'correctCount', v_attempt.correct_count,
    'wrongCount', case when v_attempt.completed_at is not null then cardinality(v_attempt.question_ids) - v_attempt.correct_count else null end,
    'durationSeconds', v_attempt.duration_seconds,
    'categoryCorrect', v_attempt.category_correct,
    'categoryTotal', v_attempt.category_total,
    'battle', v_battle,
    'question', case when v_attempt.completed_at is null then jsonb_build_object(
      'id', v_question.id,
      'category', v_question.category,
      'difficulty', v_question.difficulty,
      'text', v_question.question,
      'options', v_question.options
    ) else null end
  );
end;
$$;

create or replace function public.iq_advance_attempt(p_attempt_id uuid, p_question_id integer, p_answer_index integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.iq_attempts%rowtype;
  v_question public.iq_questions%rowtype;
  v_is_correct boolean := false;
  v_now timestamptz;
  v_elapsed integer;
  v_total integer;
  v_winner uuid;
begin
  select * into v_attempt
  from public.iq_attempts
  where id = p_attempt_id
  for update;

  if not found or v_attempt.completed_at is not null then
    raise exception 'IQ attempt is not active';
  end if;

  v_now := clock_timestamp();

  if v_attempt.question_ids[v_attempt.current_index] <> p_question_id then
    raise exception 'This IQ question is no longer active';
  end if;

  if p_answer_index is not null and (p_answer_index < 0 or p_answer_index > 3) then
    raise exception 'Answer must be between 0 and 3';
  end if;

  if p_answer_index is null
    and v_now < v_attempt.question_started_at + interval '45 seconds' then
    raise exception 'The question timer has not expired';
  end if;

  select * into v_question
  from public.iq_questions
  where id = p_question_id;

  if v_now < v_attempt.question_started_at + interval '45 seconds'
    and p_answer_index is not null then
    v_is_correct := p_answer_index = v_question.correct_index;
  end if;

  update public.iq_attempts
  set
    correct_count = correct_count + case when v_is_correct then 1 else 0 end,
    category_correct = case
      when v_is_correct then jsonb_set(
        category_correct,
        array[v_question.category],
        to_jsonb(coalesce((category_correct ->> v_question.category)::integer, 0) + 1),
        true
      )
      else category_correct
    end,
    category_total = jsonb_set(
      category_total,
      array[v_question.category],
      to_jsonb(coalesce((category_total ->> v_question.category)::integer, 0) + 1),
      true
    ),
    answers = answers || jsonb_build_array(jsonb_build_object(
      'questionId', p_question_id,
      'answerIndex', case when v_now < v_attempt.question_started_at + interval '45 seconds' then p_answer_index else null end,
      'correct', v_is_correct
    )),
    current_index = current_index + 1,
    question_started_at = case
      when v_now >= v_attempt.question_started_at + interval '45 seconds'
        then v_attempt.question_started_at + interval '45 seconds'
      else v_now
    end
  where id = p_attempt_id
  returning * into v_attempt;

  if v_attempt.current_index > cardinality(v_attempt.question_ids) then
    v_elapsed := greatest(1, floor(extract(epoch from (v_now - v_attempt.started_at)) * 1000)::integer);
    v_total := cardinality(v_attempt.question_ids);

    update public.iq_attempts
    set completed_at = v_now,
        score = round((correct_count::numeric / v_total) * 100)::smallint,
        duration_seconds = ceil(v_elapsed / 1000.0)::integer,
        duration_milliseconds = v_elapsed
    where id = p_attempt_id
    returning * into v_attempt;

    if v_attempt.battle_id is not null then
      perform 1
      from public.iq_battles
      where id = v_attempt.battle_id
      for update;

      if exists (
        select 1 from public.iq_attempts
        where battle_id = v_attempt.battle_id
          and user_id <> v_attempt.user_id
          and completed_at is not null
      ) then
        select case
          when max(a.score) = min(a.score) and max(a.duration_milliseconds) = min(a.duration_milliseconds) then null
          else (array_agg(a.user_id order by a.score desc, a.duration_milliseconds asc))[1]
        end into v_winner
        from public.iq_attempts a
        where a.battle_id = v_attempt.battle_id
          and a.completed_at is not null;

        update public.iq_battles
        set status = 'completed', winner_user_id = v_winner
        where id = v_attempt.battle_id;
      end if;
    end if;
  end if;
end;
$$;

create or replace function public.iq_get_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.iq_attempts%rowtype;
begin
  select * into v_attempt
  from public.iq_attempts
  where id = p_attempt_id and user_id = auth.uid();

  if not found then
    raise exception 'IQ attempt not found';
  end if;

  while v_attempt.completed_at is null
    and now() >= v_attempt.question_started_at + interval '45 seconds'
  loop
    perform public.iq_advance_attempt(
      v_attempt.id,
      v_attempt.question_ids[v_attempt.current_index],
      null
    );
    select * into v_attempt from public.iq_attempts where id = p_attempt_id;
  end loop;

  return public.iq_attempt_payload(p_attempt_id);
end;
$$;

create or replace function public.iq_get_active_attempt(p_mode text default 'solo')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_id uuid;
begin
  if auth.uid() is null or p_mode not in ('solo', 'battle') then
    raise exception 'Valid sign-in and IQ attempt mode are required';
  end if;

  select id into v_attempt_id
  from public.iq_attempts
  where user_id = auth.uid() and mode = p_mode and completed_at is null
  order by started_at desc
  limit 1;

  if v_attempt_id is null then
    return null;
  end if;

  return public.iq_get_attempt(v_attempt_id);
end;
$$;

create or replace function public.iq_start_solo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_id uuid;
  v_question_ids integer[];
begin
  if auth.uid() is null then
    raise exception 'Sign-in required';
  end if;

  select id into v_attempt_id
  from public.iq_attempts
  where user_id = auth.uid() and mode = 'solo' and completed_at is null
  order by started_at desc
  limit 1;

  if v_attempt_id is not null then
    return public.iq_get_attempt(v_attempt_id);
  end if;

  select array_agg(id order by difficulty, category) into v_question_ids
  from (
    select id, difficulty, category,
      row_number() over (partition by difficulty, category order by random()) as pick_order
    from public.iq_questions
  ) selected
  where pick_order = 1
    and category <> case difficulty
      when 1 then 'Mantiq'
      when 2 then 'Matematika'
      when 3 then 'Vizual'
      when 4 then 'Qonuniyat'
      else 'Diqqat'
    end;

  if cardinality(v_question_ids) <> 20 then
    raise exception 'IQ question bank is incomplete';
  end if;

  insert into public.iq_attempts (user_id, mode, question_ids)
  values (auth.uid(), 'solo', v_question_ids)
  returning id into v_attempt_id;

  return public.iq_attempt_payload(v_attempt_id);
end;
$$;

create or replace function public.iq_submit_answer(p_attempt_id uuid, p_question_id integer, p_answer_index integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.iq_attempts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign-in required';
  end if;

  select * into v_attempt
  from public.iq_attempts
  where id = p_attempt_id and user_id = auth.uid();

  if not found then
    raise exception 'IQ attempt not found';
  end if;

  perform public.iq_advance_attempt(p_attempt_id, p_question_id, p_answer_index);
  return public.iq_get_attempt(p_attempt_id);
end;
$$;

create or replace function public.iq_create_battle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_battle_id uuid;
  v_attempt_id uuid;
  v_question_ids integer[];
  v_invite_code text;
begin
  if auth.uid() is null then
    raise exception 'Sign-in required';
  end if;

  select array_agg(id order by difficulty, category) into v_question_ids
  from (
    select id, difficulty, category,
      row_number() over (partition by difficulty, category order by random()) as pick_order
    from public.iq_questions
  ) selected
  where pick_order = 1
    and category in (
      case difficulty
        when 1 then 'Mantiq'
        when 2 then 'Matematika'
        when 3 then 'Vizual'
        when 4 then 'Qonuniyat'
        else 'Diqqat'
      end,
      case difficulty
        when 1 then 'Matematika'
        when 2 then 'Vizual'
        when 3 then 'Qonuniyat'
        when 4 then 'Diqqat'
        else 'Mantiq'
      end
    );

  if cardinality(v_question_ids) <> 10 then
    raise exception 'IQ question bank is incomplete';
  end if;

  insert into public.iq_battles (created_by, question_ids)
  values (auth.uid(), v_question_ids)
  returning id, invite_code into v_battle_id, v_invite_code;

  insert into public.iq_attempts (user_id, mode, battle_id, question_ids)
  values (auth.uid(), 'battle', v_battle_id, v_question_ids)
  returning id into v_attempt_id;

  return jsonb_build_object(
    'inviteCode', v_invite_code,
    'attempt', public.iq_attempt_payload(v_attempt_id)
  );
end;
$$;

create or replace function public.iq_join_battle(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_battle public.iq_battles%rowtype;
  v_attempt_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign-in required';
  end if;

  select * into v_battle
  from public.iq_battles
  where invite_code = upper(trim(p_invite_code))
  for update;

  if not found then
    raise exception 'Battle invite was not found';
  end if;

  if v_battle.created_by = auth.uid() then
    select id into v_attempt_id
    from public.iq_attempts
    where battle_id = v_battle.id and user_id = auth.uid();
    return jsonb_build_object('attempt', public.iq_get_attempt(v_attempt_id));
  end if;

  if v_battle.opponent_id is not null and v_battle.opponent_id <> auth.uid() then
    raise exception 'This battle already has an opponent';
  end if;

  select id into v_attempt_id
  from public.iq_attempts
  where battle_id = v_battle.id and user_id = auth.uid();

  if v_attempt_id is null then
    update public.iq_battles
    set opponent_id = auth.uid(), status = 'active'
    where id = v_battle.id;

    insert into public.iq_attempts (user_id, mode, battle_id, question_ids)
    values (auth.uid(), 'battle', v_battle.id, v_battle.question_ids)
    returning id into v_attempt_id;
  end if;

  return jsonb_build_object('attempt', public.iq_get_attempt(v_attempt_id));
end;
$$;

create or replace function public.iq_get_leaderboard()
returns table (rank bigint, user_name text, best_score integer, level text, completed_tests bigint)
language sql
security definer
set search_path = ''
as $$
  with best_results as (
    select distinct on (a.user_id)
      a.user_id,
      a.score,
      a.duration_seconds,
      a.duration_milliseconds
    from public.iq_attempts a
    where a.mode = 'solo' and a.completed_at is not null
    order by a.user_id, a.score desc, a.duration_milliseconds asc
  ),
  ranked as (
    select
      p.display_name,
      b.score,
      count(a.id) as completed_tests,
      row_number() over (order by b.score desc, b.duration_milliseconds asc, p.display_name) as position
    from best_results b
    join public.profiles p on p.user_id = b.user_id
    join public.iq_attempts a on a.user_id = b.user_id and a.mode = 'solo' and a.completed_at is not null
    where p.leaderboard_hidden = false
    group by p.user_id, p.display_name, b.score, b.duration_milliseconds
  )
  select
    r.position,
    r.display_name,
    r.score,
    case
      when r.score <= 20 then 'Boshlovchi'
      when r.score <= 40 then 'Izlanuvchi'
      when r.score <= 60 then 'Ziyrak'
      when r.score <= 80 then 'Strateg'
      when r.score <= 95 then 'Mutafakkir'
      else 'Genius'
    end,
    r.completed_tests
  from ranked r
  where r.position <= 100
  order by r.position;
$$;

revoke all on function public.iq_attempt_payload(uuid) from public, anon, authenticated;
revoke all on function public.iq_advance_attempt(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.iq_get_attempt(uuid) from public, anon;
revoke all on function public.iq_get_active_attempt(text) from public, anon;
revoke all on function public.iq_start_solo() from public, anon;
revoke all on function public.iq_submit_answer(uuid, integer, integer) from public, anon;
revoke all on function public.iq_create_battle() from public, anon;
revoke all on function public.iq_join_battle(text) from public, anon;
revoke all on function public.iq_get_leaderboard() from public, anon;

grant execute on function public.iq_get_attempt(uuid) to authenticated;
grant execute on function public.iq_get_active_attempt(text) to authenticated;
grant execute on function public.iq_start_solo() to authenticated;
grant execute on function public.iq_submit_answer(uuid, integer, integer) to authenticated;
grant execute on function public.iq_create_battle() to authenticated;
grant execute on function public.iq_join_battle(text) to authenticated;
grant execute on function public.iq_get_leaderboard() to authenticated;
