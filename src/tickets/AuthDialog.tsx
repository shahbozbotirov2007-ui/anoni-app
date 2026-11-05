import { useState } from 'react';
import { ArrowRight, LoaderCircle, TicketCheck, X } from 'lucide-react';
import { ticketSupabase } from './supabase';

type Props = {
  onClose: () => void;
  onComplete: (fullName: string, phone: string) => Promise<void>;
};

const OPERATOR_CODES = ['90', '91', '93', '94', '95', '97', '98', '99', '88', '33', '50', '77', '20'];

function formatNumber(value: string) {
  const digits = value.slice(0, 7);
  return digits.replace(/^(\d{0,3})(\d{0,2})(\d{0,2}).*/, (_match, first: string, second: string, third: string) =>
    [first, second, third].filter(Boolean).join(' '));
}

function explainAuthError(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes('ticket_profiles') || message.includes('schema cache') || message.includes('pgrst205')) {
    return 'CRP Ticket bazasi hali tayyor emas. Supabase SQL Editor’da uchta CRP Ticket migratsiyasini ham sana tartibida ishga tushiring.';
  }
  if (message.includes('anonymous') || message.includes('anon')) {
    return 'Supabase sozlamasida Authentication → Providers → Anonymous Sign-Ins funksiyasini yoqing. SMS provayder kerak emas.';
  }
  if (message.includes('phone') && (message.includes('invalid') || message.includes('format'))) {
    return 'Telefon raqami noto‘g‘ri. Operator kodidan keyin 7 ta raqam kiriting.';
  }
  return error.message;
}

export default function AuthDialog({ onClose, onComplete }: Props) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [operatorCode, setOperatorCode] = useState('90');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const normalizedPhone = `+998${operatorCode}${phone}`;

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = fullName.trim();
    if (name.length < 2) {
      setError('Ismingizni kamida 2 ta harf bilan kiriting.');
      return;
    }
    if (!/^\d{7}$/.test(phone)) {
      setError('Operator kodidan keyin telefon raqamining 7 ta raqamini kiriting.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data: sessionData, error: sessionError } = await ticketSupabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) {
        const { error: authError } = await ticketSupabase.auth.signInAnonymously({
          options: { data: { full_name: name, display_name: name } },
        });
        if (authError) throw authError;
      }
      await onComplete(name, normalizedPhone);
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? explainAuthError(requestError) : 'Akkaunt yaratilmadi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Yopish"><X size={20} /></button>
        <div className="brand-mark"><TicketCheck size={23} /></div>
        <p className="eyebrow">CRP TICKET HISOBI</p>
        <h2 id="auth-title">Akkaunt yaratish</h2>
        <p className="muted">Ism va telefon raqamingizni kiriting. SMS-kod yuborilmaydi.</p>
        <form onSubmit={(event) => void createAccount(event)} className="stack-form">
          <label>Ism va familiya<input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Masalan, Ali Valiyev" maxLength={50} required /></label>
          <label>Aloqa uchun telefon raqami
            <span className="phone-input">
              <span className="phone-country">+998</span>
              <select aria-label="Mobil operator kodi" value={operatorCode} onChange={(event) => setOperatorCode(event.target.value)}>
                {OPERATOR_CODES.map((prefix) => <option value={prefix} key={prefix}>{prefix}</option>)}
              </select>
              <input aria-label="Telefon raqamining qolgan 7 raqami" autoComplete="tel-national" inputMode="numeric" value={formatNumber(phone)} onChange={(change) => setPhone(change.target.value.replace(/\D/g, '').slice(0, 7))} placeholder="123 45 67" maxLength={9} required />
            </span>
            <small className="phone-help">Operator kodini tanlang, keyin qolgan 7 raqamni kiriting.</small>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-wide" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
            {busy ? 'Akkaunt yaratilmoqda...' : 'Davom etish'}
          </button>
        </form>
        <p className="auth-footnote">Raqam faqat tadbirga oid muhim xabarlar uchun so‘raladi. SMS tasdiqlash talab qilinmaydi. Akkaunt shu qurilmada saqlanadi.</p>
      </section>
    </div>
  );
}
