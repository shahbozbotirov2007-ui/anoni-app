import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, CalendarClock, Check, Clock3, Coins, FilePlus2, Fingerprint, LoaderCircle, LockKeyhole, Save, Send, Trophy } from 'lucide-react';

const WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma'];
const EMPTY_CASE = {
  title: '',
  description: '',
  location: '',
  eventDate: '',
  weekStart: '',
  startTime: '00:00',
  endTime: '23:59',
  clues: ['', '', '', '', ''],
  finalQuestion: '',
  answerOptions: ['', '', '', ''],
  correctIndex: 0,
  explanation: '',
  sources: [],
  rewardGold: 500,
  status: 'draft'
};

const errorMessage = error => error?.message || 'So‘rov bajarilmadi. Keyinroq qayta urinib ko‘ring.';

const nextMonday = () => {
  const date = new Date();
  const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatCountdown = milliseconds => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [days && `${days} kun`, hours && `${hours} soat`, minutes && `${minutes} daqiqa`, `${seconds} soniya`]
    .filter(Boolean)
    .join(' ');
};

export default function Detective({ supabase, isAdmin = false, onReward }) {
  const [investigation, setInvestigation] = useState(null);
  const [adminCases, setAdminCases] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_CASE, weekStart: nextMonday() });
  const [editingId, setEditingId] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(0);

  const loadInvestigation = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('detective_get_current_case');
    if (rpcError) throw rpcError;
    setInvestigation(data);
    setSelectedAnswer(data?.selectedIndex ?? null);
    return data;
  }, [supabase]);

  const loadAdminCases = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('detective_admin_list_cases');
    if (rpcError) throw rpcError;
    setAdminCases(Array.isArray(data) ? data : []);
  }, [supabase]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc(
          isAdmin ? 'detective_admin_list_cases' : 'detective_get_current_case'
        );
        if (rpcError) throw rpcError;
        if (!active) return;
        if (isAdmin) {
          setAdminCases(Array.isArray(data) ? data : []);
        } else {
          setInvestigation(data);
          setSelectedAnswer(data?.selectedIndex ?? null);
        }
      } catch (loadError) {
        console.error('Could not load Detective data:', loadError);
        if (active) setError(errorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [isAdmin, supabase]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isAdmin || !investigation?.nextOpenAt) return undefined;
    const delay = Math.max(1000, Date.parse(investigation.nextOpenAt) - Date.now() + 1000);
    const timeout = window.setTimeout(() => {
      void loadInvestigation().catch(loadError => {
        console.error('Could not reveal the next Detective clue:', loadError);
        setError(errorMessage(loadError));
      });
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [investigation, isAdmin, loadInvestigation]);

  const stage = useMemo(() => {
    if (!investigation) return 0;
    return investigation.submissionOpen ? 6 : investigation.revealedClues?.length || 0;
  }, [investigation]);

  const submitAnswer = async () => {
    if (!investigation || selectedAnswer === null || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('detective_submit_answer', {
        p_case_id: investigation.id,
        p_answer_index: selectedAnswer
      });
      if (rpcError) throw rpcError;
      setInvestigation(current => current ? {
        ...current,
        submitted: true,
        isCorrect: data.isCorrect,
        selectedIndex: data.selectedIndex,
        goldAwarded: data.goldAwarded,
        explanation: data.explanation,
        sources: data.sources
      } : current);
      if (data.goldAwarded > 0) {
        setNotice(`SIZ ${data.goldAwarded} GOLD YUTDINGIZ!`);
        onReward?.(data.goldAwarded);
      } else {
        setNotice(data.isCorrect ? 'Javobingiz to‘g‘ri!' : 'Javob qabul qilindi. Bu safar to‘g‘ri javob topilmadi.');
      }
    } catch (submitError) {
      console.error('Could not submit Detective answer:', submitError);
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const startNewDraft = () => {
    setEditingId(null);
    setForm({ ...EMPTY_CASE, weekStart: nextMonday() });
    setNotice('');
    setError('');
  };

  const editCase = detectiveCase => {
    setEditingId(detectiveCase.id);
    setForm({
      ...EMPTY_CASE,
      ...detectiveCase,
      clues: Array.isArray(detectiveCase.clues) ? detectiveCase.clues : EMPTY_CASE.clues,
      answerOptions: Array.isArray(detectiveCase.answerOptions) ? detectiveCase.answerOptions : EMPTY_CASE.answerOptions,
      sources: Array.isArray(detectiveCase.sources) ? detectiveCase.sources : EMPTY_CASE.sources,
      rewardGold: detectiveCase.rewardGold || 500
    });
    setNotice('');
    setError('');
  };

  const saveCase = async status => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const sources = typeof form.sources === 'string'
        ? form.sources.split('\n').map(line => {
          const [title, ...urlParts] = line.split('|');
          return { title: title.trim(), url: urlParts.join('|').trim() };
        }).filter(source => source.title && source.url)
        : form.sources;
      const payload = {
        ...form,
        status,
        correctIndex: Number(form.correctIndex),
        rewardGold: Number(form.rewardGold),
        answerOptions: form.answerOptions.map(option => option.trim()),
        clues: form.clues.map(clue => clue.trim()),
        sources
      };
      const { data, error: rpcError } = await supabase.rpc('detective_admin_save_case', {
        p_case_id: editingId,
        p_payload: payload
      });
      if (rpcError) throw rpcError;
      setEditingId(data);
      setNotice(status === 'scheduled' ? 'Tergov tasdiqlandi va jadvalga qo‘yildi.' : 'Qoralama saqlandi.');
      await loadAdminCases();
    } catch (saveError) {
      console.error('Could not save Detective investigation:', saveError);
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (key, value) => setForm(current => ({ ...current, [key]: value }));

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-300"><LoaderCircle className="animate-spin" /> Tergov ma’lumotlari yuklanmoqda...</div>;
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5">
      <header className="rounded-3xl border border-amber-300/15 bg-gradient-to-br from-[#211832] via-[#15111F] to-[#100D18] p-6 shadow-[0_0_45px_rgba(200,166,106,0.08)] sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-200"><Fingerprint size={26} /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-200">Maxfiy ishlar papkasi</p>
            <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">{isAdmin ? 'DETEKTIV — boshqaruv' : 'DETEKTIV'}</h1>
          </div>
        </div>
        {!isAdmin && <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">Dushanbadan jumagacha dalillarni o‘rganing. Shanba kuni yakuniy xulosangizni yuboring. To‘g‘ri javob uchun <strong className="text-amber-200">500 Gold</strong> yutib oling.</p>}
      </header>

      {error && <div role="alert" className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      {notice && (
        <div role="status" className={`rounded-2xl border p-4 text-center text-base font-extrabold ${notice.includes('GOLD YUTDINGIZ') ? 'detective-gold-win border-amber-300/35 bg-gradient-to-r from-amber-400/20 via-yellow-300/10 to-amber-500/20 text-amber-100' : 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100'}`}>
          {notice.includes('GOLD YUTDINGIZ') && <Trophy size={30} className="mx-auto mb-2 animate-bounce text-amber-200" />}
          {notice}
        </div>
      )}
      {!isAdmin && investigation?.isNewInvestigation && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm font-bold text-amber-100">
          <AlertTriangle size={18} className="shrink-0" /> Yangi tergov boshlandi! Bugungi boshlang‘ich ma’lumot ochildi.
        </div>
      )}

      {isAdmin ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <div className="space-y-5 rounded-3xl border border-white/10 bg-[#1D1729] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold">{editingId ? 'Tergovni tahrirlash' : 'Yangi tergov tayyorlash'}</h2>
              <button type="button" onClick={startNewDraft} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold hover:bg-white/5"><FilePlus2 size={15} /> Yangi</button>
            </div>
            <p className="rounded-xl border border-amber-300/15 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-100/80">Faqat hujjatlar bilan tasdiqlangan, aniq javobi va manbalari mavjud voqeani tasdiqlang. Rejalashtirilgan tergovni boshlashdan oldin barcha dalil, javob va manbalarni tekshiring.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tergov nomi" value={form.title} onChange={value => updateForm('title', value)} />
              <Field label="Joy / hudud" value={form.location} onChange={value => updateForm('location', value)} />
              <Field label="Voqea sanasi" value={form.eventDate} onChange={value => updateForm('eventDate', value)} placeholder="Masalan: 1911-yil" />
              <Field label="Hafta boshlanishi (Dushanba)" type="date" value={form.weekStart} onChange={value => updateForm('weekStart', value)} />
              <Field label="Boshlanish vaqti — Toshkent" type="time" value={form.startTime} onChange={value => updateForm('startTime', value)} />
              <Field label="Yakun vaqti — Shanba, Toshkent" type="time" value={form.endTime} onChange={value => updateForm('endTime', value)} />
            </div>
            <TextArea label="Boshlang‘ich tavsif" value={form.description} onChange={value => updateForm('description', value)} rows={3} />
            <div className="space-y-3">
              <h3 className="text-sm font-extrabold text-amber-100">Dushanbadan jumagacha ochiladigan dalillar</h3>
              {WEEKDAYS.map((day, index) => <TextArea key={day} label={`${day} dalili`} value={form.clues[index] || ''} onChange={value => updateForm('clues', form.clues.map((clue, clueIndex) => clueIndex === index ? value : clue))} rows={2} />)}
            </div>
            <TextArea label="Shanba kungi yakuniy savol" value={form.finalQuestion} onChange={value => updateForm('finalQuestion', value)} rows={2} />
            <div className="space-y-3">
              <h3 className="text-sm font-extrabold text-slate-200">Javob variantlari va to‘g‘ri javob</h3>
              {form.answerOptions.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <input aria-label={`${index + 1}-javob to‘g‘ri`} type="radio" name="detective-correct-answer" checked={Number(form.correctIndex) === index} onChange={() => updateForm('correctIndex', index)} className="mt-3 accent-amber-400" />
                  <input value={option} onChange={event => updateForm('answerOptions', form.answerOptions.map((value, optionIndex) => optionIndex === index ? event.target.value : value))} placeholder={`${String.fromCharCode(65 + index)} javob`} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300/40" />
                </div>
              ))}
            </div>
            <TextArea label="To‘g‘ri javob izohi (foydalanuvchi javob bergach ochiladi)" value={form.explanation} onChange={value => updateForm('explanation', value)} rows={3} />
            <TextArea
              label="Ishonchli manbalar — har qatorda: nom | https://manba"
              value={Array.isArray(form.sources) ? form.sources.map(source => `${source.title} | ${source.url}`).join('\n') : form.sources}
              onChange={value => updateForm('sources', value)}
              rows={4}
            />
            <Field label="Mukofot (Gold)" type="number" value={form.rewardGold} onChange={value => updateForm('rewardGold', value)} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => saveCase('draft')} disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold hover:bg-white/5 disabled:opacity-50"><Save size={16} /> {saving ? 'Saqlanmoqda...' : 'Qoralama saqlash'}</button>
              <button type="button" onClick={() => saveCase('scheduled')} disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-extrabold text-[#21170B] hover:brightness-110 disabled:opacity-50"><CalendarClock size={16} /> Tasdiqlab jadvalga qo‘yish</button>
            </div>
          </div>

          <aside className="space-y-3">
            <h2 className="text-lg font-extrabold">Tergovlar va statistika</h2>
            {adminCases.length === 0 && <p className="rounded-2xl border border-white/10 bg-[#1D1729] p-4 text-sm text-slate-400">Hozircha tergov yaratilmagan.</p>}
            {adminCases.map(item => (
              <article key={item.id} className="rounded-2xl border border-white/10 bg-[#1D1729] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><h3 className="font-bold text-white">{item.title || 'Nomsiz tergov'}</h3><p className="mt-1 text-xs text-slate-400">{item.weekStart} · {item.status === 'scheduled' ? 'Jadvalda' : item.status === 'active' ? 'Faol' : item.status === 'completed' ? 'Yakunlangan' : 'Qoralama'}</p></div>
                  <button type="button" onClick={() => editCase(item)} disabled={item.participantCount > 0 || item.status === 'completed'} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-bold hover:bg-white/5 disabled:opacity-40">Tahrirlash</button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat value={item.participantCount} label="Ishtirokchi" />
                  <Stat value={item.correctCount} label="To‘g‘ri" />
                  <Stat value={item.goldAwarded} label="Gold berildi" />
                </div>
                {item.participants?.length > 0 && <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                  {item.participants.map((participant, index) => (
                    <p key={`${item.id}-${participant.publicId}-${index}`} className="flex justify-between gap-2 text-xs">
                      <span className="truncate text-slate-300">{participant.name} · {participant.publicId} · {participant.selectedAnswer} · {participant.correct ? 'To‘g‘ri' : 'Noto‘g‘ri'}</span>
                      <strong className="shrink-0 text-amber-200">+{participant.goldAwarded}</strong>
                    </p>
                  ))}
                </div>}
              </article>
            ))}
          </aside>
        </div>
      ) : investigation ? (
        <div className="space-y-5">
          <div className="rounded-3xl border border-amber-300/15 bg-[#1D1729] p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">{investigation.location} · {investigation.eventDate}</p>
                <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">{investigation.title}</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{investigation.description}</p>
              </div>
              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/5 px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2 text-amber-200"><Coins size={18} /><strong>{investigation.rewardGold} Gold</strong></div>
                <p className="mt-1 text-[10px] text-slate-400">To‘g‘ri javob uchun</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-6 gap-1.5">
              {[...WEEKDAYS, 'Shanba'].map((day, index) => {
                const unlocked = index < stage;
                return <div key={day} className={`rounded-lg px-1 py-2 text-center text-[9px] font-bold sm:text-xs ${unlocked ? 'bg-amber-300/20 text-amber-100' : 'bg-black/20 text-slate-500'}`}>{day}</div>;
              })}
            </div>
            {investigation.nextOpenAt && (
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Clock3 size={14} /> {investigation.submissionOpen ? 'Yakuniy javob yopilishigacha:' : 'Keyingi ma’lumotgacha:'} <strong className="text-amber-100">{formatCountdown(Date.parse(investigation.nextOpenAt) - now)}</strong></p>
            )}
          </div>

          <div className="grid gap-3">
            {investigation.revealedClues?.map(clue => (
              <article key={clue.day} className="rounded-2xl border border-white/10 bg-[#1D1729] p-5">
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-200"><BookOpen size={15} /> {WEEKDAYS[clue.day - 1]} · dalil #{clue.day}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{clue.text}</p>
              </article>
            ))}
            {investigation.revealedClues?.length === 0 && <p className="rounded-2xl border border-white/10 bg-[#1D1729] p-5 text-sm text-slate-400">Tergov boshlanish vaqti kutilmoqda.</p>}
          </div>

          {investigation.submissionOpen && !investigation.submitted && (
            <section className="rounded-3xl border border-amber-300/25 bg-gradient-to-br from-[#302315] via-[#1D1729] to-[#100D18] p-5 sm:p-7">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-200"><LockKeyhole size={15} /> Shanba — yakuniy tergov</p>
              <h3 className="mt-3 text-xl font-black text-white">{investigation.finalQuestion}</h3>
              <div className="mt-5 grid gap-2">
                {investigation.answerOptions?.map((option, index) => (
                  <button key={index} type="button" onClick={() => setSelectedAnswer(index)} className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${selectedAnswer === index ? 'border-amber-300 bg-amber-300/10 text-amber-50' : 'border-white/10 bg-black/15 text-slate-200 hover:border-amber-200/30'}`}>
                    <span className="mr-2 font-black text-amber-200">{String.fromCharCode(65 + index)}.</span>{option}
                  </button>
                ))}
              </div>
              <button type="button" onClick={submitAnswer} disabled={selectedAnswer === null || submitting} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3.5 text-sm font-extrabold text-[#21170B] transition hover:brightness-110 disabled:opacity-50">
                {submitting ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />} Javobni yakuniy yuborish
              </button>
              <p className="mt-3 text-center text-xs text-slate-400">Yuborilgach javobni o‘zgartirib bo‘lmaydi. Mukofot bir marta serverda hisoblanadi.</p>
            </section>
          )}

          {investigation.submitted && (
            <section className={`rounded-3xl border p-5 sm:p-7 ${investigation.isCorrect ? 'border-amber-300/30 bg-gradient-to-br from-amber-400/15 to-[#1D1729]' : 'border-white/10 bg-[#1D1729]'}`}>
              <div className="flex items-center gap-3">
                {investigation.isCorrect ? <Trophy className="text-amber-200" size={28} /> : <Check className="text-slate-300" size={25} />}
                <div>
                  <h3 className="text-lg font-black">{investigation.isCorrect ? `SIZ ${investigation.goldAwarded} GOLD YUTDINGIZ!` : 'Javobingiz qabul qilindi'}</h3>
                  <p className="mt-1 text-sm text-slate-300">{investigation.isCorrect ? 'Mukofot Gold balansingizga qo‘shildi.' : 'Yakuniy javobni qayta yuborib bo‘lmaydi.'}</p>
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-200">{investigation.explanation}</p>
              {investigation.sources?.length > 0 && <div className="mt-5 border-t border-white/10 pt-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-200">Tarixiy manbalar</h4>
                <ul className="mt-2 space-y-2">{investigation.sources.map((source, index) => (
                  <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-2 text-sm text-sky-200 underline underline-offset-2"><Send size={14} className="mt-0.5 shrink-0" />{source.title}</a></li>
                ))}</ul>
              </div>}
            </section>
          )}
        </div>
      ) : (
        <section className="rounded-3xl border border-white/10 bg-[#1D1729] p-7 text-center">
          <LockKeyhole className="mx-auto text-amber-200" size={30} />
          <h2 className="mt-4 text-xl font-black">Hozir faol tergov mavjud emas</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">Yangi tergov administrator tomonidan tasdiqlanib, belgilangan dushanba kuni boshlanadi. Tugagan ishlar ommaviy arxivda saqlanmaydi.</p>
        </section>
      )}
    </section>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
      {label}
      <input type={type} value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} min={type === 'number' ? 1 : undefined} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300/40" />
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 3 }) {
  return (
    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
      {label}
      <textarea rows={rows} value={value ?? ''} onChange={event => onChange(event.target.value)} className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm leading-5 text-white outline-none focus:border-amber-300/40" />
    </label>
  );
}

function Stat({ value, label }) {
  return <div className="rounded-lg bg-black/20 p-2"><p className="text-sm font-black text-amber-100">{value}</p><p className="text-[9px] text-slate-400">{label}</p></div>;
}
