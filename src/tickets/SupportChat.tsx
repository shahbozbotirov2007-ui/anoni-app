import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Bot, LoaderCircle, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { ticketApiUrl } from './api';

type Message = { role: 'user' | 'assistant'; content: string };

export default function SupportChat({ session, onNeedAuth }: { session: Session | null; onNeedAuth: () => void }) {
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: 'Assalomu alaykum! Men CRP TICKET rasmiy yordamchisiman. Tadbir, joy tanlash, to‘lov yoki chiptalar bo‘yicha savolingizni yozing.',
  }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    if (!session) {
      onNeedAuth();
      return;
    }

    const nextMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(nextMessages);
    setDraft('');
    setError('');
    setBusy(true);
    try {
      const response = await fetch(`${ticketApiUrl}/api/support`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: nextMessages.slice(-12).filter((message, index) => index > 0 || message.role !== 'assistant'),
        }),
      });
      const payload = await response.json().catch(() => null) as { answer?: string; detail?: string } | null;
      if (!response.ok) throw new Error(payload?.detail || 'Yordam xizmatiga xabar yuborilmadi.');
      if (!payload?.answer) throw new Error('Yordam xizmatidan javob olinmadi.');
      setMessages((current) => [...current, { role: 'assistant', content: payload.answer || '' }]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Yordam xizmatiga ulanib bo‘lmadi.');
      setMessages((current) => current.slice(0, -1));
      setDraft(text);
    } finally {
      setBusy(false);
    }
  }

  return <main className="page-section support-page">
    <div className="support-heading">
      <div><p className="eyebrow">CRP TICKET YORDAM</p><h1>Support</h1><p>Tadbir, joy tanlash, to‘lov va chiptalaringiz bo‘yicha yordam oling.</p></div>
      <div className="support-secure"><ShieldCheck size={17} /> Shaxsiy buyurtmalar faqat hisobingizda</div>
    </div>
    <section className="support-card">
      <div className="support-card-heading"><div className="support-avatar"><Bot size={20} /></div><div><strong>CRP TICKET rasmiy yordamchisi</strong><small>Gemini AI · O‘zbek tilida</small></div><MessageCircle className="support-heading-icon" size={19} /></div>
      <div className="support-messages" aria-live="polite">
        {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`support-message ${message.role === 'user' ? 'from-user' : 'from-support'}`}>
          {message.role === 'assistant' && <span className="support-message-avatar"><Bot size={14} /></span>}
          <p>{message.content}</p>
        </div>)}
        {busy && <div className="support-message from-support"><span className="support-message-avatar"><Bot size={14} /></span><p><LoaderCircle className="spin" size={16} /> Javob tayyorlanmoqda...</p></div>}
        <div ref={messagesEnd} />
      </div>
      {error && <p className="form-error support-error" role="alert">{error}</p>}
      {!session && <p className="support-login-note">Shaxsiy buyurtma holatini xavfsiz ko‘rish uchun avval akkauntingizga kiring.</p>}
      <form className="support-composer" onSubmit={(event) => void send(event)}>
        <input aria-label="Savolingiz" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Savolingizni yozing..." />
        <button className="button button-primary" type="submit" disabled={busy || !draft.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}<span>Yuborish</span></button>
      </form>
      {!session && <button className="button button-outline support-signin" onClick={onNeedAuth}>Kirish / ro‘yxatdan o‘tish</button>}
      <p className="support-disclaimer">Xabarlaringiz javob tayyorlash uchun Gemini AI’ga yuboriladi; ism va telefon raqamingiz yuborilmaydi. AI tavsiyaviy, to‘lov va chipta holati server hamda admin tasdig‘i bilan belgilanadi.</p>
    </section>
  </main>;
}
