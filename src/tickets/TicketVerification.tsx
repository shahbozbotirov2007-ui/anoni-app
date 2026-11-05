import { useEffect, useState } from 'react';
import { BadgeCheck, BadgeX, LoaderCircle, ShieldCheck } from 'lucide-react';
import { ticketApiUrl } from './api';
import { formatEventDate } from './format';

type Verification = {
  valid: boolean;
  status: 'valid' | 'expired' | 'cancelled' | 'not_found' | string;
  event_title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  seat_number?: number | null;
};

export default function TicketVerification({ ticketCode }: { ticketCode: string }) {
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function verify() {
      try {
        const response = await fetch(`${ticketApiUrl}/api/verify-ticket?ticket_code=${encodeURIComponent(ticketCode)}`);
        const payload = await response.json().catch(() => null) as Verification | { detail?: string } | null;
        if (!response.ok) {
          const message = payload && 'detail' in payload ? payload.detail : 'Chipta tekshiruvi bajarilmadi.';
          throw new Error(message || 'Chipta tekshiruvi bajarilmadi.');
        }
        if (!payload || !('valid' in payload)) throw new Error('Tekshiruv xizmatidan noto‘g‘ri javob olindi.');
        if (active) setResult(payload);
      } catch (verificationError) {
        if (active) setError(verificationError instanceof Error ? verificationError.message : 'Chipta tekshiruvida xatolik.');
      }
    }
    void verify();
    return () => { active = false; };
  }, [ticketCode]);

  return <main className="page-section verification-page">
    <section className={`verification-card ${result?.valid ? 'is-valid' : result ? 'is-invalid' : ''}`}>
      {!result && !error ? <LoaderCircle className="spin" size={34} /> : result?.valid ? <BadgeCheck size={42} /> : error ? <BadgeX size={42} /> : <BadgeX size={42} />}
      <p className="eyebrow">CRP TICKET · CHIPTA TEKSHIRUVI</p>
      <h1>{result?.valid ? 'Haqiqiy chipta' : result ? 'Chipta yaroqsiz' : error ? 'Tekshirib bo‘lmadi' : 'Tekshirilmoqda...'}</h1>
      {result?.valid && <div className="verification-details">
        <strong>{result.event_title || 'CRP Ticket tadbiri'}</strong>
        <span>{result.seat_number ? `${result.seat_number}-joy` : ''}</span>
        <span>{result.starts_at ? formatEventDate(result.starts_at) : ''}</span>
      </div>}
      {result && !result.valid && <p>{result.status === 'expired' ? 'Chipta muddati tugagan.' : result.status === 'cancelled' ? 'Chipta bekor qilingan.' : 'Chipta topilmadi yoki QR kodi noto‘g‘ri.'}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="verification-code"><ShieldCheck size={15} /> CHIPTA ID: <strong>{ticketCode}</strong></div>
      <a className="button button-outline" href="/">CRP Ticket bosh sahifasi</a>
    </section>
  </main>;
}
