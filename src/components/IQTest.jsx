import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Brain, Clock3, Copy, Crown, LoaderCircle, Medal, RefreshCw, Share2, Swords, Trophy } from 'lucide-react';

const QUESTION_SECONDS = 45;
const LAST_ATTEMPT_KEY = userId => `anoni_iq_last_attempt_${userId}`;

const getLevel = score => {
  if (score <= 20) return 'Boshlovchi';
  if (score <= 40) return 'Izlanuvchi';
  if (score <= 60) return 'Ziyrak';
  if (score <= 80) return 'Strateg';
  if (score <= 95) return 'Mutafakkir';
  return 'Genius';
};

const formatDuration = seconds => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes ? `${minutes} daqiqa ${remainingSeconds} soniya` : `${remainingSeconds} soniya`;
};

const errorText = error => error?.message || 'So‘rov bajarilmadi. Internetni tekshirib, qayta urinib ko‘ring.';

export default function IQTest({ supabase, userId, onBack, inviteCode }) {
  const [view, setView] = useState('intro');
  const [attempt, setAttempt] = useState(null);
  const [battleInviteCode, setBattleInviteCode] = useState(inviteCode || '');
  const [leaderboard, setLeaderboard] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [leaderboardReturnView, setLeaderboardReturnView] = useState('intro');
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [timeoutAttempted, setTimeoutAttempted] = useState(false);

  const remainingSeconds = useMemo(() => {
    if (!attempt?.deadline) return 0;
    return Math.min(QUESTION_SECONDS, Math.max(0, Math.ceil((Date.parse(attempt.deadline) - now) / 1000)));
  }, [attempt?.deadline, now]);

  const storeAttempt = useCallback(nextAttempt => {
    setAttempt(nextAttempt);
    setTimeoutAttempted(false);
    setBattleInviteCode(nextAttempt?.battle?.inviteCode || inviteCode || '');
    if (nextAttempt?.attemptId) {
      try {
        localStorage.setItem(LAST_ATTEMPT_KEY(userId), nextAttempt.attemptId);
      } catch (storageError) {
        console.error('Could not save the IQ attempt reference locally:', storageError);
        setError('Test serverda saqlandi, ammo natijani qurilmada eslab qolishning imkoni bo‘lmadi.');
      }
      if (nextAttempt.mode === 'battle' && nextAttempt.battle?.inviteCode && !inviteCode) {
        const url = new URL(window.location.href);
        url.searchParams.set('iq-battle', nextAttempt.battle.inviteCode);
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      }
      setView(nextAttempt.completed ? 'result' : 'question');
    }
  }, [inviteCode, userId]);

  const loadAttempt = useCallback(async attemptId => {
    const { data, error: rpcError } = await supabase.rpc('iq_get_attempt', { p_attempt_id: attemptId });
    if (rpcError) throw rpcError;
    storeAttempt(data);
    return data;
  }, [storeAttempt, supabase]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      let savedAttemptError = null;
      try {
        let savedAttemptId = null;
        try {
          savedAttemptId = localStorage.getItem(LAST_ATTEMPT_KEY(userId));
        } catch (storageError) {
          savedAttemptError = storageError;
        }
        if (savedAttemptId) {
          try {
            const { data: savedAttempt, error: restoreError } = await supabase.rpc('iq_get_attempt', {
              p_attempt_id: savedAttemptId
            });
            if (restoreError) throw restoreError;
            if (!inviteCode || savedAttempt?.battle?.inviteCode === inviteCode) {
              if (active) storeAttempt(savedAttempt);
              return;
            }
          } catch (restoreError) {
            savedAttemptError = restoreError;
            try {
              localStorage.removeItem(LAST_ATTEMPT_KEY(userId));
            } catch (storageError) {
              console.error('Could not clear the stale IQ attempt reference:', storageError);
            }
          }
        }

        const preferredMode = inviteCode ? 'battle' : 'solo';
        const { data, error: rpcError } = await supabase.rpc('iq_get_active_attempt', { p_mode: preferredMode });
        if (rpcError) throw rpcError;
        if (!active) return;
        if (data && (!inviteCode || data.battle?.inviteCode === inviteCode)) {
          storeAttempt(data);
        } else if (savedAttemptError) {
          setError(`Avvalgi IQ urinishni tiklab bo‘lmadi: ${errorText(savedAttemptError)}`);
        }
      } catch (restoreError) {
        if (active) setError(errorText(restoreError));
      } finally {
        if (active) setLoading(false);
      }
    };
    restore();
    return () => { active = false; };
  }, [inviteCode, storeAttempt, supabase, userId]);

  useEffect(() => {
    if (view !== 'question') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [view]);

  const submitAnswer = useCallback(async answerIndex => {
    if (!attempt?.question?.id || busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('iq_submit_answer', {
        p_attempt_id: attempt.attemptId,
        p_question_id: attempt.question.id,
        p_answer_index: answerIndex
      });
      if (rpcError) throw rpcError;
      storeAttempt(data);
    } catch (submitError) {
      setError(errorText(submitError));
    } finally {
      setBusy(false);
    }
  }, [attempt, busy, storeAttempt, supabase]);

  useEffect(() => {
    if (view !== 'question' || !attempt?.deadline || busy || timeoutAttempted) return undefined;
    const delay = Math.max(0, Date.parse(attempt.deadline) - Date.now());
    const timeout = window.setTimeout(() => {
      setTimeoutAttempted(true);
      submitAnswer(null);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [attempt?.deadline, busy, submitAnswer, timeoutAttempted, view]);

  useEffect(() => {
    if (view !== 'result' || attempt?.mode !== 'battle' || attempt?.battle?.status === 'completed') return undefined;
    const poll = window.setInterval(async () => {
      try {
        await loadAttempt(attempt.attemptId);
      } catch (pollError) {
        setError(errorText(pollError));
      }
    }, 5000);
    return () => window.clearInterval(poll);
  }, [attempt?.attemptId, attempt?.battle?.status, attempt?.mode, loadAttempt, view]);

  const startSolo = async () => {
    setBusy(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('iq_start_solo');
      if (rpcError) throw rpcError;
      storeAttempt(data);
    } catch (startError) {
      setError(errorText(startError));
    } finally {
      setBusy(false);
    }
  };

  const createBattle = async () => {
    setBusy(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('iq_create_battle');
      if (rpcError) throw rpcError;
      setBattleInviteCode(data.inviteCode);
      storeAttempt(data.attempt);
      setNotice('Taklif havolasi tayyor. Do‘stingizga yuboring.');
    } catch (createError) {
      setError(errorText(createError));
    } finally {
      setBusy(false);
    }
  };

  const joinBattle = async () => {
    if (!inviteCode) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('iq_join_battle', { p_invite_code: inviteCode });
      if (rpcError) throw rpcError;
      storeAttempt(data.attempt);
    } catch (joinError) {
      setError(errorText(joinError));
    } finally {
      setBusy(false);
    }
  };

  const loadLeaderboard = async () => {
    setLeaderboardReturnView(view);
    setView('leaderboard');
    setBusy(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('iq_get_leaderboard');
      if (rpcError) throw rpcError;
      setLeaderboard(data || []);
    } catch (leaderboardError) {
      setError(errorText(leaderboardError));
    } finally {
      setBusy(false);
    }
  };

  const shareBattle = async () => {
    if (!battleInviteCode) return;
    const url = new URL(window.location.href);
    url.searchParams.set('iq-battle', battleInviteCode);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ANONI IQ Battle', text: 'Meni IQ Battle’da bellashishga chaqiraman!', url: url.toString() });
      } else {
        await navigator.clipboard.writeText(url.toString());
        setNotice('Taklif havolasi nusxalandi.');
      }
    } catch (shareError) {
      if (shareError.name !== 'AbortError') setError(errorText(shareError));
    }
  };

  const leave = () => {
    if (window.location.search.includes('iq-battle=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('iq-battle');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
    onBack();
  };

  const categoryCount = (labels, values) => labels.reduce((total, label) => total + Number(values?.[label] || 0), 0);
  const logicTotal = categoryCount(['Mantiq', 'Matematika', 'Qonuniyat'], attempt?.categoryTotal);
  const logicCorrect = categoryCount(['Mantiq', 'Matematika', 'Qonuniyat'], attempt?.categoryCorrect);
  const focusTotal = categoryCount(['Diqqat'], attempt?.categoryTotal);
  const focusCorrect = categoryCount(['Diqqat'], attempt?.categoryCorrect);
  const logicPercent = logicTotal ? Math.round((logicCorrect / logicTotal) * 100) : 0;
  const speedPercent = attempt?.durationSeconds
    ? Math.max(0, Math.round(100 - (attempt.durationSeconds / (attempt.totalQuestions * QUESTION_SECONDS)) * 100))
    : 0;
  const focusPercent = focusTotal ? Math.round((focusCorrect / focusTotal * 100 + speedPercent) / 2) : speedPercent;

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5 animate-in fade-in duration-300">
      <header className="flex items-center justify-between gap-3">
        <button type="button" onClick={leave} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10">
          <ArrowLeft size={16} /> Orqaga
        </button>
        <div className="flex items-center gap-2 text-sm font-black tracking-wide text-violet-200">
          <Brain size={19} /> IQ TEST
        </div>
        <button type="button" onClick={loadLeaderboard} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">
          <Trophy size={15} /> TOP-100
        </button>
      </header>

      {error && <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between">
        <span>{error}</span>
        {view === 'question' && remainingSeconds === 0 && timeoutAttempted && <button type="button" onClick={() => setTimeoutAttempted(false)} className="shrink-0 rounded-lg bg-red-500/20 px-3 py-2 text-xs font-bold hover:bg-red-500/30">Keyingi savolni qayta yuklash</button>}
      </div>}
      {notice && <div role="status" className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-300"><LoaderCircle className="animate-spin" size={20} /> IQ natijalari tekshirilmoqda...</div>
      ) : view === 'intro' ? (
        <div className="overflow-hidden rounded-3xl border border-violet-300/15 bg-gradient-to-br from-[#211832] via-[#15111F] to-[#100D18] p-6 shadow-[0_0_50px_rgba(139,92,246,0.12)] sm:p-8">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200"><Brain size={30} /></div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">ANONI Logic Score</p>
          <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">Mantiqingizni sinab ko‘ring</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">20 ta savol, har biriga 45 soniya. Savollar osondan qiyinga boradi, har birida 4 ta javobdan faqat bittasi to‘g‘ri. Testni yopib qaytsangiz, serverdagi progress saqlanadi.</p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-slate-300 sm:grid-cols-4">
            {['20 ta savol', '45 soniya', '5 yo‘nalish', '0–100 ball'].map(item => <div key={item} className="rounded-xl border border-white/10 bg-black/20 p-3 text-center font-bold">{item}</div>)}
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-400">Bu ko‘ngilochar mantiqiy test. Natija standartlashtirilgan IQ tashxisi emas.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {inviteCode ? (
              <button type="button" onClick={joinBattle} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-violet-400 disabled:opacity-50">
                {busy ? <LoaderCircle className="animate-spin" size={17} /> : <Swords size={17} />} Do‘stim bilan bellashish
              </button>
            ) : (
              <button type="button" onClick={startSolo} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-violet-400 disabled:opacity-50">
                {busy ? <LoaderCircle className="animate-spin" size={17} /> : <Brain size={17} />} TESTNI BOSHLASH
              </button>
            )}
            {!inviteCode && <button type="button" onClick={createBattle} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-300/25 bg-violet-500/10 px-4 py-3 text-sm font-bold text-violet-100 transition hover:bg-violet-500/20 disabled:opacity-50">
              <Swords size={17} /> Do‘stim bilan bellashish
            </button>}
          </div>
        </div>
      ) : view === 'leaderboard' ? (
        <div className="rounded-3xl border border-white/10 bg-[#1D1729] p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div><h2 className="text-xl font-black">IQ TOP-100</h2><p className="mt-1 text-xs text-slate-400">Eng yaxshi ANONI Logic Score natijalari</p></div>
            <button type="button" onClick={() => setView(leaderboardReturnView)} className="rounded-lg bg-white/5 p-2 text-slate-300 hover:bg-white/10" aria-label="IQ testga qaytish"><ArrowLeft size={17} /></button>
          </div>
          {busy ? <div className="flex justify-center py-10"><LoaderCircle className="animate-spin text-violet-300" /></div> : leaderboard.length === 0 ? (
            <p className="rounded-xl bg-black/20 p-5 text-center text-sm text-slate-400">Hozircha yakunlangan IQ testi yo‘q. Birinchi bo‘lib natija qoldiring!</p>
          ) : <div className="space-y-2">{leaderboard.map((row, index) => (
            <div key={`${row.rank}-${row.user_name}`} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${index === 0 ? 'border-amber-300/30 bg-amber-300/10' : 'border-white/5 bg-black/15'}`}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black">{index < 3 ? ['🥇', '🥈', '🥉'][index] : row.rank}</span>
                <div className="min-w-0"><p className="truncate text-sm font-bold">{row.user_name}</p><p className="text-[11px] text-slate-400">{row.level} · {row.completed_tests} ta test</p></div>
              </div>
              <span className="shrink-0 text-lg font-black text-violet-200">{row.best_score}<small className="ml-1 text-[10px] font-semibold text-slate-400">ball</small></span>
            </div>
          ))}</div>}
        </div>
      ) : view === 'question' && attempt?.question ? (
        <div key={attempt.question.id} className="iq-question-card rounded-3xl border border-white/10 bg-[#1D1729] p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-wider text-violet-300">{attempt.mode === 'battle' ? 'IQ Battle' : 'ANONI Logic Score'}</p><p className="mt-1 text-sm font-bold">Savol {attempt.currentIndex}/{attempt.totalQuestions}</p></div>
            {attempt.mode === 'battle' && <button type="button" onClick={shareBattle} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300/20 px-3 py-2 text-xs font-bold text-violet-100"><Share2 size={14} /> Taklif</button>}
          </div>
          <div className="mb-6 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-500" style={{ width: `${attempt.currentIndex / attempt.totalQuestions * 100}%` }} /></div>
          <div className="mb-5 flex items-center justify-between">
            <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-300">{attempt.question.category}</span>
            <span className={`inline-flex items-center gap-1.5 text-sm font-extrabold ${remainingSeconds <= 10 ? 'text-rose-300' : 'text-amber-200'}`}><Clock3 size={15} /> 00:{String(remainingSeconds).padStart(2, '0')}</span>
          </div>
          <div className="mb-5 h-1 overflow-hidden rounded-full bg-black/30"><div className={`h-full transition-all ${remainingSeconds <= 10 ? 'bg-rose-400' : 'bg-amber-300'}`} style={{ width: `${remainingSeconds / QUESTION_SECONDS * 100}%` }} /></div>
          <h2 className="min-h-20 text-lg font-bold leading-relaxed sm:text-xl">{attempt.question.text}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">{attempt.question.options.map((option, index) => (
            <button type="button" key={`${attempt.question.id}-${index}`} disabled={busy} onClick={() => submitAnswer(index)} className="group flex min-h-14 items-center gap-3 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-left text-sm font-semibold transition hover:-translate-y-0.5 hover:border-violet-300/50 hover:bg-violet-500/10 disabled:cursor-wait disabled:opacity-50">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-black text-violet-200">{String.fromCharCode(65 + index)}</span>{String(option)}
            </button>
          ))}</div>
          {busy && <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400"><LoaderCircle size={14} className="animate-spin" /> Javob serverda tekshirilmoqda...</p>}
        </div>
      ) : view === 'result' && attempt ? (
        <div className="rounded-3xl border border-violet-300/15 bg-gradient-to-br from-[#211832] via-[#15111F] to-[#100D18] p-6 text-center shadow-[0_0_50px_rgba(139,92,246,0.12)] sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200"><Trophy size={28} /></div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">ANONI Logic Score</p>
          <h2 className="mt-2 text-2xl font-black">Test yakunlandi!</h2>
          <div className="relative mx-auto my-6 flex h-44 w-44 items-center justify-center">
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 160 160" aria-hidden="true">
              <circle cx="80" cy="80" r="68" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" />
              <circle cx="80" cy="80" r="68" fill="none" stroke="url(#iq-score-gradient)" strokeWidth="10" strokeLinecap="round" className="iq-score-ring" style={{ '--iq-score-dash': `${(attempt.score || 0) * 4.27} 427` }} />
              <defs><linearGradient id="iq-score-gradient"><stop stopColor="#8B5CF6" /><stop offset="1" stopColor="#E879F9" /></linearGradient></defs>
            </svg>
            <div><p className="text-5xl font-black text-white">{attempt.score}</p><p className="mt-1 text-xs font-bold text-slate-400">100 dan</p></div>
          </div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm font-extrabold text-amber-100"><Medal size={16} /> {getLevel(attempt.score)}</div>
          <div className="mx-auto grid max-w-xl grid-cols-2 gap-3 text-left">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">To‘g‘ri javob</p><p className="mt-1 text-lg font-black text-emerald-300">{attempt.correctCount}/{attempt.totalQuestions}</p></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">Noto‘g‘ri javob</p><p className="mt-1 text-lg font-black text-rose-300">{attempt.wrongCount}</p></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">Sarflangan vaqt</p><p className="mt-1 text-sm font-black">{formatDuration(attempt.durationSeconds)}</p></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">Mantiqiy fikrlash</p><p className="mt-1 text-lg font-black">{logicPercent}%</p></div>
            <div className="col-span-2 rounded-xl border border-white/10 bg-black/20 p-3 text-left"><div className="flex items-center justify-between text-xs"><span className="text-slate-400">Diqqat va tezkorlik</span><strong>{focusPercent}%</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" style={{ width: `${focusPercent}%` }} /></div></div>
          </div>
          {attempt.mode === 'battle' && (
            <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-violet-300/15 bg-violet-500/10 p-4 text-sm">
              {attempt.battle?.status === 'completed' ? (
                <p className={`font-bold ${attempt.battle.winnerUserId === userId ? 'animate-bounce text-amber-100' : ''}`}>{attempt.battle.winnerUserId === userId ? '🏆 Siz g‘olib bo‘ldingiz!' : attempt.battle.winnerUserId ? `${attempt.battle.opponentName} g‘olib bo‘ldi.` : 'Battle durang yakunlandi.'} {attempt.battle.opponentName}: {attempt.battle.opponentScore} ball</p>
              ) : <p className="text-violet-100">Natijangiz saqlandi. {attempt.battle?.opponentCompleted ? 'Raqib natijasi qayta tekshirilmoqda...' : 'Do‘stingiz testni yakunlashini kutyapmiz...'}</p>}
              <button type="button" onClick={shareBattle} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold hover:bg-white/5"><Copy size={13} /> Taklif havolasini ulashish</button>
            </div>
          )}
          <p className="mt-5 text-[11px] leading-5 text-slate-500">Bu natija professional yoki klinik IQ diagnostikasi hisoblanmaydi. Natijalar profilingizga bog‘langan holda serverda saqlanadi.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={loadLeaderboard} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold hover:bg-white/5"><Trophy size={16} /> IQ TOP-100</button>
            <button type="button" onClick={startSolo} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-extrabold hover:bg-violet-400 disabled:opacity-50"><RefreshCw size={16} /> Yangi test</button>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-white/10 bg-[#1D1729] p-6 text-center">
          <Crown className="mx-auto text-amber-200" />
          <p className="mt-3 text-sm text-slate-300">Test holati topilmadi. Yangi testni boshlashingiz mumkin.</p>
          <button type="button" onClick={() => setView('intro')} className="mt-4 rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold">IQ Testga qaytish</button>
        </div>
      )}
    </section>
  );
}
