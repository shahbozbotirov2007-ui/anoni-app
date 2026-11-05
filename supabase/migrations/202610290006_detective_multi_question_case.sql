alter table public.detective_cases
  add column case_type text not null default 'historical'
    check (case_type in ('historical', 'fictional')),
  add column final_questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(final_questions) = 'array'),
  add column reward_tiers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(reward_tiers) = 'object');

update public.detective_cases
set final_questions = jsonb_build_array(jsonb_build_object(
      'question', final_question,
      'options', answer_options,
      'correctIndex', correct_index
    )),
    reward_tiers = jsonb_build_object('1', reward_gold, '0', 0)
where jsonb_array_length(final_questions) = 0;

alter table public.detective_answers
  add column answer_indices jsonb not null default '[]'::jsonb
    check (jsonb_typeof(answer_indices) = 'array'),
  add column score smallint not null default 0
    check (score between 0 and 5);

update public.detective_answers
set answer_indices = jsonb_build_array(answer_index),
    score = case when is_correct then 1 else 0 end
where jsonb_array_length(answer_indices) = 0;

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
  v_questions jsonb;
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
  v_questions := case
    when jsonb_array_length(v_case.final_questions) > 0 then v_case.final_questions
    else jsonb_build_array(jsonb_build_object(
      'question', v_case.final_question,
      'options', v_case.answer_options,
      'correctIndex', v_case.correct_index
    ))
  end;

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
    'caseType', v_case.case_type,
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
    'questions', case
      when v_now >= v_case.starts_at + interval '5 days' then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'question', q.value ->> 'question',
          'options', q.value -> 'options'
        ) order by q.ordinality), '[]'::jsonb)
        from jsonb_array_elements(v_questions) with ordinality as q(value, ordinality)
      )
      else null
    end,
    'rewardGold', v_case.reward_gold,
    'rewardTiers', v_case.reward_tiers,
    'submitted', v_has_answer,
    'isCorrect', case when v_has_answer then v_answer.is_correct else null end,
    'selectedAnswers', case when v_has_answer then v_answer.answer_indices else null end,
    'correctAnswers', case when v_has_answer then (
      select coalesce(jsonb_agg((q.value ->> 'correctIndex')::integer order by q.ordinality), '[]'::jsonb)
      from jsonb_array_elements(v_questions) with ordinality as q(value, ordinality)
    ) else null end,
    'score', case when v_has_answer then v_answer.score else null end,
    'goldAwarded', case when v_has_answer then v_answer.gold_awarded else 0 end,
    'explanation', case when v_has_answer then v_case.explanation else null end,
    'sources', case when v_has_answer then v_case.sources else null end
  );
end;
$$;

create or replace function public.detective_submit_answers(p_case_id uuid, p_answer_indices integer[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.detective_cases%rowtype;
  v_user_id uuid := auth.uid();
  v_questions jsonb;
  v_choice integer;
  v_score smallint := 0;
  v_question_count integer;
  v_gold_awarded integer := 0;
  v_now timestamptz := now();
  v_reward_tiers jsonb;
begin
  if v_user_id is null then
    raise exception 'Sign-in required';
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

  v_questions := case
    when jsonb_array_length(v_case.final_questions) > 0 then v_case.final_questions
    else jsonb_build_array(jsonb_build_object(
      'question', v_case.final_question,
      'options', v_case.answer_options,
      'correctIndex', v_case.correct_index
    ))
  end;
  v_question_count := jsonb_array_length(v_questions);
  if p_answer_indices is null or array_length(p_answer_indices, 1) <> v_question_count then
    raise exception 'Answer every question exactly once';
  end if;

  for v_choice in 1..v_question_count loop
    if p_answer_indices[v_choice] is null
      or p_answer_indices[v_choice] < 0
      or p_answer_indices[v_choice] >= jsonb_array_length(v_questions -> (v_choice - 1) -> 'options') then
      raise exception 'Invalid answer for question %', v_choice;
    end if;
    if p_answer_indices[v_choice] = ((v_questions -> (v_choice - 1) ->> 'correctIndex')::integer) then
      v_score := v_score + 1;
    end if;
  end loop;

  v_reward_tiers := v_case.reward_tiers;
  if jsonb_object_length(v_reward_tiers) = 0 then
    v_reward_tiers := jsonb_build_object('1', v_case.reward_gold, '0', 0);
  end if;
  v_gold_awarded := coalesce((v_reward_tiers ->> v_score::text)::integer, 0);

  insert into public.detective_answers (
    case_id, user_id, answer_index, answer_indices, score, is_correct, gold_awarded
  )
  values (
    v_case.id, v_user_id, p_answer_indices[1], to_jsonb(p_answer_indices),
    v_score, v_score = v_question_count, v_gold_awarded
  )
  on conflict (case_id, user_id) do nothing;
  if not found then
    raise exception 'You have already submitted an answer';
  end if;

  if v_gold_awarded > 0 then
    update public.profiles
    set gold = gold + v_gold_awarded,
        updated_at = v_now
    where user_id = v_user_id;
    if not found then
      raise exception 'Profile not found';
    end if;
  end if;

  return jsonb_build_object(
    'isCorrect', v_score = v_question_count,
    'score', v_score,
    'selectedAnswers', to_jsonb(p_answer_indices),
    'correctAnswers', (
      select coalesce(jsonb_agg((q.value ->> 'correctIndex')::integer order by q.ordinality), '[]'::jsonb)
      from jsonb_array_elements(v_questions) with ordinality as q(value, ordinality)
    ),
    'goldAwarded', v_gold_awarded,
    'explanation', v_case.explanation,
    'sources', v_case.sources
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
  v_questions jsonb;
begin
  select final_questions into v_questions
  from public.detective_cases
  where id = p_case_id and status = 'scheduled';
  if not found then
    raise exception 'This investigation is not available';
  end if;
  if jsonb_array_length(v_questions) > 1 then
    raise exception 'Submit answers for every question';
  end if;
  return public.detective_submit_answers(p_case_id, array[p_answer_index]);
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
  v_questions jsonb := p_payload -> 'questions';
  v_clues jsonb := p_payload -> 'clues';
  v_sources jsonb := coalesce(p_payload -> 'sources', '[]'::jsonb);
  v_reward_tiers jsonb := p_payload -> 'rewardTiers';
  v_case_type text := coalesce(p_payload ->> 'caseType', 'historical');
  v_status text := coalesce(p_payload ->> 'status', 'draft');
  v_question jsonb;
  v_question_index integer := 0;
  v_correct_index integer;
  v_max_reward integer := 0;
  v_score integer;
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
  if v_case_type not in ('historical', 'fictional') then
    raise exception 'Case type must be historical or fictional';
  end if;

  v_starts_at := (v_week_start + v_start_time) at time zone 'Asia/Tashkent';
  v_ends_at := (v_week_start + 5 + v_end_time) at time zone 'Asia/Tashkent';
  if v_questions is null then
    v_questions := jsonb_build_array(jsonb_build_object(
      'question', coalesce(p_payload ->> 'finalQuestion', ''),
      'options', coalesce(p_payload -> 'answerOptions', '[]'::jsonb),
      'correctIndex', coalesce((p_payload ->> 'correctIndex')::integer, 0)
    ));
  end if;
  if v_reward_tiers is null then
    v_reward_tiers := jsonb_build_object(
      '5', coalesce((p_payload ->> 'rewardGold')::integer, 500),
      '4', 0, '3', 0, '2', 0, '1', 0, '0', 0
    );
  end if;

  if jsonb_typeof(v_questions) is distinct from 'array' then
    if v_status = 'scheduled' then
      raise exception 'A scheduled Detective case requires exactly five final questions';
    end if;
    v_questions := '[]'::jsonb;
  end if;
  if jsonb_array_length(v_questions) <> 5 then
    if v_status = 'scheduled' then
      raise exception 'A scheduled Detective case requires exactly five final questions';
    end if;
  end if;
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
      or length(trim(coalesce(p_payload ->> 'explanation', ''))) < 20
      or jsonb_typeof(v_sources) <> 'array'
      or (v_case_type = 'historical' and jsonb_array_length(v_sources) < 1)
      or exists (
        select 1
        from jsonb_array_elements(v_sources) as source(value)
        where length(trim(coalesce(source.value ->> 'title', ''))) < 3
          or coalesce(source.value ->> 'url', '') !~ '^https://'
      )
      or jsonb_typeof(v_reward_tiers) <> 'object' then
      raise exception 'Scheduled cases require five clues, an explanation, valid reward tiers and (for historical cases) HTTPS sources';
    end if;

    for v_score in 0..5 loop
      if not (v_reward_tiers ? v_score::text)
        or jsonb_typeof(v_reward_tiers -> (v_score::text)) <> 'number'
        or (v_reward_tiers ->> v_score::text)::numeric < 0
        or (v_reward_tiers ->> v_score::text)::numeric > 1000000 then
        raise exception 'Reward tiers must define scores 0 through 5 with Gold amounts from 0 to 1000000';
      end if;
    end loop;

    for v_question in select value from jsonb_array_elements(v_questions)
    loop
      v_question_index := v_question_index + 1;
      v_correct_index := (v_question ->> 'correctIndex')::integer;
      if length(trim(coalesce(v_question ->> 'question', ''))) < 10
        or jsonb_typeof(v_question -> 'options') <> 'array'
        or jsonb_array_length(v_question -> 'options') <> 4
        or exists (
          select 1
          from jsonb_array_elements_text(v_question -> 'options') as option(value)
          where length(trim(coalesce(option.value, ''))) < 2
        )
        or v_correct_index is null
        or v_correct_index < 0
        or v_correct_index > 3 then
        raise exception 'Question % must contain a prompt, four options and a correct answer', v_question_index;
      end if;
    end loop;
  end if;

  select max((v_reward_tiers ->> score::text)::integer)
  into v_max_reward
  from generate_series(0, 5) as score;

  if p_case_id is not null then
    update public.detective_cases
    set title = coalesce(p_payload ->> 'title', ''),
        description = coalesce(p_payload ->> 'description', ''),
        location = coalesce(p_payload ->> 'location', ''),
        event_date = coalesce(p_payload ->> 'eventDate', ''),
        case_type = v_case_type,
        week_start = v_week_start,
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        clues = coalesce(v_clues, '[]'::jsonb),
        final_question = coalesce(v_questions -> 0 ->> 'question', ''),
        answer_options = coalesce(v_questions -> 0 -> 'options', '[]'::jsonb),
        correct_index = coalesce((v_questions -> 0 ->> 'correctIndex')::smallint, 0),
        final_questions = coalesce(v_questions, '[]'::jsonb),
        reward_tiers = v_reward_tiers,
        explanation = coalesce(p_payload ->> 'explanation', ''),
        sources = v_sources,
        reward_gold = coalesce(v_max_reward, 0),
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
      id, title, description, location, event_date, case_type, week_start, starts_at, ends_at,
      clues, final_question, answer_options, correct_index, final_questions, reward_tiers,
      explanation, sources, reward_gold, status, created_by
    )
    values (
      v_id, coalesce(p_payload ->> 'title', ''), coalesce(p_payload ->> 'description', ''),
      coalesce(p_payload ->> 'location', ''), coalesce(p_payload ->> 'eventDate', ''),
      v_case_type, v_week_start, v_starts_at, v_ends_at, coalesce(v_clues, '[]'::jsonb),
      coalesce(v_questions -> 0 ->> 'question', ''),
      coalesce(v_questions -> 0 -> 'options', '[]'::jsonb),
      coalesce((v_questions -> 0 ->> 'correctIndex')::smallint, 0),
      coalesce(v_questions, '[]'::jsonb), v_reward_tiers,
      coalesce(p_payload ->> 'explanation', ''), v_sources, coalesce(v_max_reward, 0),
      v_status, auth.uid()
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
        'caseType', c.case_type,
        'weekStart', c.week_start,
        'startsAt', c.starts_at,
        'endsAt', c.ends_at,
        'startTime', to_char(c.starts_at at time zone 'Asia/Tashkent', 'HH24:MI'),
        'endTime', to_char(c.ends_at at time zone 'Asia/Tashkent', 'HH24:MI'),
        'clues', c.clues,
        'questions', c.final_questions,
        'rewardTiers', c.reward_tiers,
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
            'selectedAnswers', a.answer_indices,
            'score', a.score,
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
revoke all on function public.detective_submit_answers(uuid, integer[]) from public, anon;
revoke all on function public.detective_submit_answer(uuid, integer) from public, anon;
revoke all on function public.detective_admin_save_case(uuid, jsonb) from public, anon;
revoke all on function public.detective_admin_list_cases() from public, anon;
grant execute on function public.detective_get_current_case() to authenticated;
grant execute on function public.detective_submit_answers(uuid, integer[]) to authenticated;
grant execute on function public.detective_submit_answer(uuid, integer) to authenticated;
grant execute on function public.detective_admin_save_case(uuid, jsonb) to authenticated;
grant execute on function public.detective_admin_list_cases() to authenticated;

do $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id
  from auth.users
  where raw_app_meta_data ->> 'role' = 'admin'
  order by created_at
  limit 1;
  if v_admin_id is null then
    raise exception 'AN-001 could not be scheduled: no admin account with app_metadata.role=admin exists';
  end if;

  insert into public.detective_cases (
    id, title, description, location, event_date, case_type, week_start, starts_at, ends_at,
    clues, final_question, answer_options, correct_index, final_questions, reward_tiers,
    explanation, sources, reward_gold, status, created_by
  )
  values (
    '00000000-0000-4000-8000-000000000001',
    '001-JINOIY ISH: SO‘NGGI QO‘NG‘IROQ',
    'Badiiy, o‘ylab topilgan kriminalistik tergov ssenariysi. Undagi shaxslar va voqea haqiqiy emas.',
    'Toshkent shahri',
    '2025-yil 17-oktabr',
    'fictional',
    date '2026-11-02',
    timestamp '2026-11-02 00:00:00' at time zone 'Asia/Tashkent',
    timestamp '2026-11-07 23:59:00' at time zone 'Asia/Tashkent',
    jsonb_build_array(
      '2025-yil 17-oktabr soat 22:46 da biznes markazining 4-qavatidagi kabinetda tadbirkor Kamol Rahimov (42) o‘lik holda topildi. O‘lim vaqti taxminan 21:00–22:00. Eshik yopiq, lekin qulflanmagan; stol ustida ikki qahva finjoni bor edi. Telefon yo‘qolgan, qimmatbaho buyumlarga tegilmagan va kurash izlari topilmadi.',
      'Gumondorlar: biznes hamkori Aziz Karimov (moliyaviy kelishmovchilik; 20:24 da kirib, 20:52 da chiqdi), turmush o‘rtog‘i Dilnoza Rahimova (binoga kirgani qayd etilmadi) va yordamchi Sardor Valiyev (18:12 da kirib, 22:18 da chiqdi). Sardor 21:10 da hujjat olib kirganini aytdi, ammo chiqish vaqtini aniq ko‘rsatмаган.',
      '4-qavat kamerasi 21:34–21:51 oralig‘ida boshqaruv panelidan ataylab o‘chirilgan. Unga faqat xavfsizlik boshlig‘i va Sardor kira olardi; boshliq 19:00 da ketgan va qaytmagan. Farrosh 21:40 larda “Buni hech kim bilmasligi kerak edi!” degan baqiriqni eshitgan.',
      'Sud-tibbiy xulosa: o‘lim boshga kuchli zarbadan. Kabinetdagi og‘ir metall haykalchada qon bor, ammo barmoq izlari artib tashlangan. Birinchi qahva finjonida Kamol, ikkinchisida Sardor DNKsi topildi. Kompyuterda tiklangan AUDIT_FINAL_17.10 hujjatida Sardorning xizmat akkaunti orqali 480 million so‘m o‘tkazilgani qayd etilgan; akkauntdan kim foydalangani hali alohida isbotlanmagan.',
      'Kamolning telefoni oxirgi marta yerosti avtoturargohida qayd etildi. 22:12 dagi tasvirda Sardor qo‘lida ikki telefon bilan ko‘ringan. Kamol 21:28 da Azizga “Pulni kim olganini bildim. Sardor bilan gaplashib olaman. Ertaga barcha hujjatlarni senga ko‘rsataman” degan xabarni tayyorlagan, lekin yubormagan. Jurnal: 21:31 da Sardor akkaunti kirgan, 21:34 da kamera o‘chgan, 21:51 da yoqilgan, 22:06 da Sardor avtoturargohga kirgan.'
    ),
    'Барча далилларни ҳисобга олиб, ҳар бир саволга биттадан жавоб танланг. Балл 5 та жавобнинг тўғри сонига қараб ҳисобланади.',
    jsonb_build_array('Aziz Karimov', 'Dilnoza Rahimova', 'Sardor Valiyev', 'Xavfsizlik boshlig‘i'),
    2,
    jsonb_build_array(
      jsonb_build_object('question', 'Kamol Rahimovni kim o‘ldirgan?', 'options', jsonb_build_array('Aziz Karimov', 'Dilnoza Rahimova', 'Sardor Valiyev', 'Xavfsizlik boshlig‘i'), 'correctIndex', 2),
      jsonb_build_object('question', 'Jinoyatning asosiy sababi nima?', 'options', jsonb_build_array('Oilaviy kelishmovchilik', 'Moliyaviy jinoyatni yashirish', 'Tasodifiy janjal', 'Qimmatbaho buyumlarni o‘g‘irlash'), 'correctIndex', 1),
      jsonb_build_object('question', 'Jinoyatchi nima uchun kamerani o‘chirgan?', 'options', jsonb_build_array('Binodan yashirincha chiqish uchun', 'Boshqa odamni aybdor qilish uchun', 'Uchrashuv va jinoyatni kameradan yashirish uchun', 'Kamera tasodifan o‘chgan'), 'correctIndex', 2),
      jsonb_build_object('question', 'Jinoyatchining ko‘rsatmasidagi asosiy shubhali holat nima?', 'options', jsonb_build_array('Qahva ichganini tan olgani', 'Ish joyini tark etgan vaqtini chalg‘itib ko‘rsatgani', 'Aziz bilan tanishligi', 'Telefon ishlatmagani'), 'correctIndex', 1),
      jsonb_build_object('question', 'Jinoyatchi nima uchun marhumning telefonini olib ketgan?', 'options', jsonb_build_array('Uni sotish uchun', 'Telefon qimmat bo‘lgani uchun', 'Undagi yozishmalar va dalillarni yashirish uchun', 'Tasodifan'), 'correctIndex', 2)
    ),
    jsonb_build_object('5', 500, '4', 200, '3', 100, '2', 50, '1', 0, '0', 0),
    'Ssenariy yechimiga ko‘ra, aybdor Sardor Valiyev: u kamerani o‘chirish vakolati va imkoniga ega bo‘lgan, ish joyidan ketish haqidagi ko‘rsatmasi yozuvlarga mos kelmagan, uning xizmat akkaunti orqali 480 million so‘mlik o‘tkazma qayd etilgan va u marhumning telefoni bilan ketgan. Ehtimoliy sabab — moliyaviy firibgarlikni yashirish. Bu badiiy o‘yin xulosasi; haqiqiy ishda aybni isbotlash uchun qo‘shimcha protsessual dalillar talab qilinadi.',
    '[]'::jsonb,
    500,
    'scheduled',
    v_admin_id
  )
  on conflict (id) do nothing;
end;
$$;
