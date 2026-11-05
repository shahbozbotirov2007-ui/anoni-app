import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, Check, Clock3, Copy, CreditCard, LoaderCircle, LockKeyhole, MapPin, RotateCcw, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { uploadPaymentProof } from './api';
import { formatEventDate, formatMoney } from './format';
import { ticketSupabase } from './supabase';
import type { TicketEvent, TicketSeat } from './types';

type Props = {
  event: TicketEvent;
  session: Session | null;
  onBack: () => void;
  onNeedAuth: () => void;
};

type Reservation = { order_id: string; expires_at: string };

function seatLabel(status: TicketSeat['status']) {
  if (status === 'sold' || status === 'offline_sold') return 'Band';
  if (status === 'reserved') return 'Kutishda';
  if (status === 'invitation') return 'Taklifnoma';
  return 'Bo‘sh';
}

export default function EventDetail({ event, session, onBack, onNeedAuth }: Props) {
  const [seats, setSeats] = useState<TicketSeat[]>([]);
  const [seatsForEventId, setSeatsForEventId] = useState('');
  const loadingSeats = seatsForEventId !== event.id;
  const [selectedSeat, setSelectedSeat] = useState<TicketSeat | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [reservationMessage, setReservationMessage] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seatPointerRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressSeatClickRef = useRef(false);

  useEffect(() => {
    if (!filePreviewUrl) return undefined;
    return () => URL.revokeObjectURL(filePreviewUrl);
  }, [filePreviewUrl]);

  const loadSeats = useCallback(async () => {
    const { data, error: seatsError } = await ticketSupabase.rpc('ticket_get_seats', { p_event_id: event.id });
    if (seatsError) setError(seatsError.message);
    else setSeats((data || []) as TicketSeat[]);
    setSeatsForEventId(event.id);
  }, [event.id]);

  useEffect(() => {
    void loadSeats();
    const channel = ticketSupabase.channel(`ticket-seats-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_seats', filter: `event_id=eq.${event.id}` }, () => { void loadSeats(); })
      .subscribe();
    return () => { void ticketSupabase.removeChannel(channel); };
  }, [event.id, loadSeats]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return undefined;
    let active = true;
    async function restoreReservation() {
      const { data: order, error: orderError } = await ticketSupabase
        .from('ticket_orders')
        .select('id,seat_id,reservation_expires_at')
        .eq('event_id', event.id)
        .eq('user_id', userId)
        .eq('status', 'reserved')
        .gt('reservation_expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (orderError) {
        setError(`Band qilingan joyni tiklab bo‘lmadi: ${orderError.message}`);
        return;
      }
      if (!order?.reservation_expires_at) return;
      const { data: seat, error: seatError } = await ticketSupabase
        .from('ticket_seats')
        .select('id,event_id,seat_number,status')
        .eq('id', order.seat_id)
        .maybeSingle();
      if (!active) return;
      if (seatError) {
        setError(`O‘rindiq ma’lumotini tiklab bo‘lmadi: ${seatError.message}`);
        return;
      }
      if (seat) {
        setReservation({ order_id: order.id, expires_at: order.reservation_expires_at });
        setSelectedSeat(seat as TicketSeat);
      }
    }
    void restoreReservation();
    return () => { active = false; };
  }, [event.id, session?.user.id]);

  useEffect(() => {
    if (!reservation) return undefined;
    const remaining = new Date(reservation.expires_at).getTime() - Date.now();
    const timeout = window.setTimeout(() => {
      setReservation(null);
      setSelectedSeat(null);
      setError('O‘rindiqni band qilish vaqti tugadi. Iltimos, joyni qayta tanlang.');
      void loadSeats();
    }, Math.max(remaining, 0));
    return () => window.clearTimeout(timeout);
  }, [reservation, loadSeats]);

  const rows = useMemo(() => {
    const output: TicketSeat[][] = [];
    for (let index = 0; index < seats.length; index += 10) output.push(seats.slice(index, index + 10));
    return output;
  }, [seats]);

  async function reserveSeat(seat: TicketSeat) {
    if (!session) {
      onNeedAuth();
      return;
    }
    setBusy(true);
    setError('');
    setReservationMessage('');
    try {
      const { data, error: reserveError } = await ticketSupabase.rpc('ticket_reserve_seat', { p_seat_id: seat.id });
      if (reserveError) throw reserveError;
      if (!data || typeof data !== 'object' || !('order_id' in data) || !('expires_at' in data)) {
        throw new Error('Band qilishdan kutilmagan javob olindi.');
      }
      setReservation(data as Reservation);
      setSelectedSeat(seat);
      void loadSeats();
    } catch (reserveError) {
      setError(reserveError instanceof Error ? reserveError.message : 'O‘rindiqni band qilib bo‘lmadi.');
    } finally {
      setBusy(false);
    }
  }

  async function changeReservation(nextSeat: TicketSeat | null) {
    if (!session || !reservation) return;
    setBusy(true);
    setError('');
    setReservationMessage('');
    try {
      const { data, error: changeError } = await ticketSupabase.rpc('ticket_change_reservation', {
        p_order_id: reservation.order_id,
        p_new_seat_id: nextSeat?.id ?? null,
      });
      if (changeError) {
        if (changeError.message.includes('Selected seat is no longer available')) {
          throw new Error('Bu joyni boshqa xaridor band qildi. Boshqa bo‘sh joyni tanlang; hozirgi joyingiz bandligicha qoladi.');
        }
        if (changeError.message.includes('Reservation can no longer be changed')) {
          throw new Error('Bu band qilish endi o‘zgartirilmaydi. Joylar holatini yangilab qayta tanlang.');
        }
        throw changeError;
      }
      if (!data || typeof data !== 'object' || !('cancelled' in data)) {
        throw new Error('Joyni o‘zgartirishdan kutilmagan javob olindi.');
      }
      const result = data as { cancelled: boolean; expired?: boolean; order_id?: string; expires_at?: string };
      if (result.cancelled) {
        setReservation(null);
        setSelectedSeat(null);
        setReservationMessage(result.expired
          ? 'Band qilish vaqti tugadi. Endi istalgan bo‘sh joyni tanlashingiz mumkin.'
          : 'Joy bandi bekor qilindi. Endi istalgan bo‘sh joyni tanlang.');
      } else {
        if (result.order_id !== reservation.order_id || !result.expires_at || !nextSeat) {
          throw new Error('Yangi joy band qilingani tasdiqlanmadi. Joylar holatini yangilang.');
        }
        setReservation({ order_id: result.order_id, expires_at: result.expires_at });
        setSelectedSeat(nextSeat);
        setReservationMessage(`${nextSeat.seat_number}-joy tanlandi. To‘lovni davom ettirishingiz mumkin.`);
      }
      void loadSeats();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Joyni o‘zgartirib bo‘lmadi.');
      void loadSeats();
    } finally {
      setBusy(false);
    }
  }

  async function copyCard() {
    try {
      await navigator.clipboard.writeText(event.payment_card_number.replace(/\s/g, ''));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Karta raqamini nusxalab bo‘lmadi. Uni qo‘lda belgilang.');
    }
  }

  async function submitProof(eventForm: React.FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    if (!session || !reservation || !file) return;
    setBusy(true);
    setError('');
    setPaymentMessage('');
    try {
      const result = await uploadPaymentProof(session, reservation.order_id, file);
      setPaymentMessage(result.message);
      setPaymentStatus(result.status);
      setReservation(null);
      setSelectedSeat(null);
      setFile(null);
      setFilePreviewUrl('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      void loadSeats();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Chekni yuborishda xatolik yuz berdi.');
    } finally {
      setBusy(false);
    }
  }

  function chooseProof(fileInput: HTMLInputElement) {
    const selectedFile = fileInput.files?.[0];
    if (!selectedFile) return;
    if (!selectedFile.type.startsWith('image/')) {
      setFile(null);
      setFilePreviewUrl('');
      setError('Galereyadan chek rasmi tanlang.');
      return;
    }
    if (selectedFile.size > 30 * 1024 * 1024) {
      setFile(null);
      setFilePreviewUrl('');
      setError('Chek rasmi 30 MB dan katta. Galereyadan kichikroq rasm tanlang.');
      return;
    }
    setError('');
    setFile(selectedFile);
    setFilePreviewUrl(URL.createObjectURL(selectedFile));
  }

  function clearProof() {
    setFile(null);
    setFilePreviewUrl('');
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <main className="page-section event-detail">
      <button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Tadbirlar</button>
      <div className="event-detail-heading">
        <div className="event-heading-info">{event.artist_image_url && <img className="event-artist-photo" src={event.artist_image_url} alt="Tadbir ijrochisi" />}<div><p className="eyebrow">TADBIR HAQIDA</p><h1>{event.title}</h1><p className="event-location"><MapPin size={16} /> {event.location}</p></div></div>
        <div className="event-summary"><span><Clock3 size={15} /> {formatEventDate(event.starts_at)} — {formatEventDate(event.ends_at)}</span><strong>{formatMoney(event.ticket_price)}</strong></div>
      </div>
      {event.poster_url && <div className="event-detail-poster"><img src={event.poster_url} alt={`${event.title} posteri`} /></div>}
      {event.description && <p className="event-description">{event.description}</p>}
      <div className="seat-layout">
        <section className="seat-panel">
          <div className="stage">SAHNA</div>
          <div className="seat-legend">
            <span><i className="seat-dot free" /> Bo‘sh</span><span><i className="seat-dot reserved" /> Kutishda</span><span><i className="seat-dot sold" /> Band</span>
          </div>
          {loadingSeats ? <div className="loading-card">Zal xaritasi yuklanmoqda...</div> : <div className="seat-rows">
            {rows.map((row, rowIndex) => <div className="seat-row" key={`row-${rowIndex}`}>
              <span className="row-label">{String.fromCharCode(65 + rowIndex)}</span>
              {row.map((seat) => {
                const isSelected = selectedSeat?.id === seat.id;
                const state = isSelected ? 'selected' : seat.status;
                return <button
                  type="button"
                  key={seat.id}
                  className={`seat seat-${state}`}
                  disabled={busy || (seat.status !== 'available' && !(Boolean(reservation) && isSelected))}
                  aria-label={isSelected && reservation ? `${seat.seat_number}: tanlangan joy, bekor qilish uchun bosing` : `${seat.seat_number}: ${seatLabel(seat.status)}`}
                  title={`${seat.seat_number}-joy · ${seatLabel(seat.status)}`}
                  onPointerDown={(pointer) => {
                    seatPointerRef.current = {
                      pointerId: pointer.pointerId,
                      startX: pointer.clientX,
                      startY: pointer.clientY,
                      moved: false,
                    };
                    suppressSeatClickRef.current = false;
                  }}
                  onPointerMove={(pointer) => {
                    const gesture = seatPointerRef.current;
                    if (gesture?.pointerId === pointer.pointerId
                      && (Math.abs(pointer.clientX - gesture.startX) > 10 || Math.abs(pointer.clientY - gesture.startY) > 10)) {
                      gesture.moved = true;
                    }
                  }}
                  onPointerUp={(pointer) => {
                    const gesture = seatPointerRef.current;
                    if (gesture?.pointerId === pointer.pointerId) {
                      suppressSeatClickRef.current = gesture.moved;
                      seatPointerRef.current = null;
                      window.setTimeout(() => { suppressSeatClickRef.current = false; }, 0);
                    }
                  }}
                  onPointerCancel={(pointer) => {
                    if (seatPointerRef.current?.pointerId === pointer.pointerId) {
                      seatPointerRef.current = null;
                      suppressSeatClickRef.current = true;
                      window.setTimeout(() => { suppressSeatClickRef.current = false; }, 0);
                    }
                  }}
                  onClick={(click) => {
                    if (click.detail > 0 && suppressSeatClickRef.current) {
                      click.preventDefault();
                      click.stopPropagation();
                      suppressSeatClickRef.current = false;
                      return;
                    }
                    void (reservation
                      ? changeReservation(isSelected ? null : seat)
                      : reserveSeat(seat));
                  }}
                >{seat.seat_number}</button>;
              })}
            </div>)}
          </div>}
          <p className="seat-help"><LockKeyhole size={14} /> Joy 10 daqiqaga band qilinadi. Boshqa bo‘sh joyni bossangiz joyingiz almashtiriladi; tanlangan joyni qayta bossangiz band bekor qilinadi.</p>
        </section>
        <aside className="checkout-panel">
          <div className="checkout-title"><div className="checkout-icon"><CreditCard size={19} /></div><div><h2>To‘lov</h2><p>{event.title}</p></div></div>
          {selectedSeat && reservation && <div className="selected-seat-number"><span>Tanlangan joy</span><strong>{selectedSeat.seat_number}</strong></div>}
          {reservationMessage && <p className="reservation-message" role="status">{reservationMessage}</p>}
          {selectedSeat && reservation ? <>
            <section className="payment-rules" aria-labelledby="payment-rules-title">
              <h3 id="payment-rules-title">To‘lovdan oldin tanishib chiqing</h3>
              <ol>
                <li>iPhone’da chek rasmini tanlashda muammo bo‘lsa, Photos/Galereya uchun Face ID talabini vaqtincha o‘chirib turing. Bu holat faqat iPhone’da uchrashi mumkin.</li>
                <li>Tanlagan joyingizni yuqorida ko‘rsatilgan raqam bilan solishtiring.</li>
                <li>To‘lov tasdiqlangach QR-kod “Chiptalarim” bo‘limida chiqadi — xavfsizlik uchun skrinshot qilib oling. Admin tasdiqlamaguncha buyurtma chipta hisoblanmaydi.</li>
                <li>Saytda xatolik sezsangiz, darhol Support tizimiga yozing.</li>
              </ol>
            </section>
            <div className="order-line"><span>To‘lov summasi</span><strong>{formatMoney(event.ticket_price)}</strong></div>
            <button type="button" className="text-button reservation-cancel" onClick={() => void changeReservation(null)} disabled={busy}><RotateCcw size={14} /> Joyni bekor qilish</button>
            <div className="payment-instructions">
              <p className="eyebrow">P2P O‘TKAZMA</p>
              <p>Quyidagi kartaga aniq summani o‘tkazing:</p>
              <div className="card-number">{event.payment_card_number}<button className="icon-button" onClick={() => void copyCard()} aria-label="Nusxalash">{copied ? <Check size={17} /> : <Copy size={17} />}</button></div>
            </div>
            <form className="stack-form" onSubmit={(form) => void submitProof(form)}>
              {file ? <div className="proof-selected">
                {filePreviewUrl && <img src={filePreviewUrl} alt="Tanlangan chek rasmi" />}
                <div className="proof-selected-info"><strong>Chek rasmi tanlandi</strong><small>{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</small></div>
                <button type="button" className="icon-button proof-remove" onClick={clearProof} aria-label="Tanlangan rasmni olib tashlash" disabled={busy}><Trash2 size={17} /></button>
              </div> : <label className={`upload-field${busy ? ' upload-field-disabled' : ''}`}>
                <UploadCloud size={21} /><span>Galereyadan chek rasmini tanlang</span><small>Rasm tanlashga bosing · katta rasm avtomatik kichraytiriladi</small>
                <input
                  ref={fileInputRef}
                  className="proof-file-input"
                  type="file"
                  accept="image/*"
                  aria-label="Galereyadan chek rasmini tanlang"
                  disabled={busy}
                  onClick={(click) => { click.currentTarget.value = ''; }}
                  onChange={(change) => chooseProof(change.currentTarget)}
                />
              </label>}
              {file && <button className="button button-primary button-wide" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}{busy ? 'Tekshirilmoqda...' : 'Chekni yuborish'}</button>}
            </form>
            <p className="secure-note"><ShieldCheck size={14} /> Chek tekshiruvga yuboriladi. Chipta faqat admin tasdiqlagach beriladi.</p>
          </> : paymentMessage ? <div className="notice-success"><Check size={22} /><div><strong>{paymentStatus === 'approved' ? 'Chipta tasdiqlandi' : 'Chek qabul qilindi'}</strong><p>{paymentMessage}</p></div></div> : <div className="checkout-empty"><div className="empty-icon"><CreditCard /></div><p>Davom etish uchun zal xaritasidan bo‘sh joyni tanlang.</p></div>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </aside>
      </div>
    </main>
  );
}
