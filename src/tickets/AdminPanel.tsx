import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { BadgeCheck, BellRing, CalendarPlus, Check, ChevronDown, CircleDollarSign, Crop, ImagePlus, LoaderCircle, LockKeyhole, Pencil, Phone, Plus, RefreshCw, Save, Search, ShieldAlert, TicketCheck, ToggleLeft, ToggleRight, Trash2, Upload, Users, X } from 'lucide-react';
import { ticketSupabase } from './supabase';
import { formatEventDay, formatEventDate, formatMoney } from './format';
import { normalizeTicketOrder, TICKET_EVENT_SELECT } from './types';
import type { TicketEvent, TicketOrder, TicketOrderJoinRow, TicketSeat } from './types';

type Props = { events: TicketEvent[]; onRefresh: () => Promise<void> };
type PanelTab = 'events' | 'payments' | 'users' | 'banners' | 'delete';
type ReviewItem = TicketOrder & {
  proofUrl: string | null;
  fullName: string;
  phone: string;
  ticketId: string | null;
  ticketCode: string | null;
  ticketStatus: 'valid' | 'expired' | 'cancelled' | null;
};
type BuyerOrderJoinRow = {
  id: string;
  user_id: string;
  amount: number;
  created_at: string;
  ticket_seats: { seat_number: number } | { seat_number: number }[] | null;
  ticket_events: { title: string } | { title: string }[] | null;
};
type BuyerOrder = {
  id: string;
  eventTitle: string;
  seatNumber: number | null;
  amount: number;
  createdAt: string;
  ticketCode: string | null;
  ticketStatus: 'valid' | 'expired' | 'cancelled' | null;
};
type TicketBuyer = { userId: string; fullName: string; phone: string; orders: BuyerOrder[] };

function firstRelation<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? relation[0] || null : relation;
}

function parseInvitationSeats(input: string, seatCount: number) {
  const numbers = new Set<number>();
  const parts = input.split(',').map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error(`O‘rinlar oralig‘i noto‘g‘ri: ${part}`);
    const first = Number(match[1]);
    const last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > seatCount || last - first > seatCount) {
      throw new Error(`Taklifnoma o‘rinlari 1 dan ${seatCount} gacha bo‘lishi kerak.`);
    }
    for (let seat = first; seat <= last; seat += 1) numbers.add(seat);
  }
  return [...numbers];
}

async function cropImage(imageUrl: string, area: Area) {
  const image = new Image();
  image.src = imageUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Rasmni ochib bo‘lmadi.'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = area.width;
  canvas.height = area.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Rasm kesish muhiti ishga tushmadi.');
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Kesilgan rasmni saqlab bo‘lmadi.')), 'image/jpeg', 0.9);
  });
}

function toUzbekistanIsoDateTime(date: string, time: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error(`${label}: sanani va 24 soatlik vaqtni to‘g‘ri kiriting (masalan, 14:30).`);
  }
  const [year, month, day] = date.split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new Error(`${label}: sana noto‘g‘ri.`);
  }
  return new Date(`${date}T${time}:00+05:00`).toISOString();
}

function getUzbekistanDateTime(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}

async function prepareEventImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Rasm JPG, PNG yoki WEBP formatida bo‘lishi kerak.');
  }
  if (file.size > 30 * 1024 * 1024) throw new Error('Rasm hajmi 30 MB dan oshmasligi kerak.');
  if (file.size <= 9 * 1024 * 1024) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Rasmni ochib bo‘lmadi. Uni JPG, PNG yoki WEBP formatida qayta saqlab yuklang.');
  }
  try {
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Rasmni qayta ishlash muhiti ishga tushmadi.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const toBlob = (type: string, quality: number) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Rasmni kichraytirib bo‘lmadi.')), type, quality);
    });
    let blob = await toBlob('image/webp', 0.86);
    if (blob.size > 9 * 1024 * 1024) blob = await toBlob('image/jpeg', 0.76);
    if (blob.size > 9 * 1024 * 1024) throw new Error('Rasmni 9 MB dan kichraytirib bo‘lmadi. Boshqa rasm tanlang.');
    const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const name = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${name}.${extension}`, { type: blob.type, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

async function uploadEventImage(eventId: string, kind: 'poster' | 'artist', file: File) {
  const uploadFile = await prepareEventImage(file);
  const extension = uploadFile.type === 'image/jpeg' ? 'jpg' : uploadFile.type === 'image/png' ? 'png' : 'webp';
  const path = `events/${eventId}/${kind}-${crypto.randomUUID()}.${extension}`;
  const { error } = await ticketSupabase.storage.from('ticket-banners')
    .upload(path, uploadFile, { contentType: uploadFile.type, upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error('Tadbir rasmlari uchun Supabase Storage bucket topilmadi. Bazadagi CRP Ticket migratsiyalarini tekshiring.');
    }
    if (/row-level security|unauthorized|permission denied/i.test(error.message)) {
      throw new Error('Rasm yuklashga ruxsat berilmadi. Admin huquqini yangilash uchun hisobdan chiqib qayta kiring.');
    }
    if (/payload too large|file size|exceed|413/i.test(error.message)) {
      throw new Error('Rasm hajmi Storage limitidan katta. Kichikroq rasm tanlang.');
    }
    throw new Error(`Rasmni Supabase Storage’ga yuklab bo‘lmadi: ${error.message}`);
  }
  return {
    path,
    publicUrl: ticketSupabase.storage.from('ticket-banners').getPublicUrl(path).data.publicUrl,
  };
}

function EventForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [values, setValues] = useState({
    title: '', description: '', location: '',
    startsAtDate: '', startsAtTime: '', endsAtDate: '', endsAtTime: '', salesStartDate: '', salesStartTime: '',
    salesEndDate: '', salesEndTime: '', ticketPrice: '', seatCount: '300', paymentCardNumber: '',
    charityEnabled: false, charityPercent: '5', invitationRanges: '',
  });
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [artistFile, setArtistFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState('');
  const [artistPreview, setArtistPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key: keyof typeof values, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));

  useEffect(() => () => {
    if (posterPreview) URL.revokeObjectURL(posterPreview);
    if (artistPreview) URL.revokeObjectURL(artistPreview);
  }, [posterPreview, artistPreview]);

  function chooseEventImage(kind: 'poster' | 'artist', file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Rasm JPG, PNG yoki WEBP formatida bo‘lishi kerak.');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setError('Rasm hajmi 30 MB dan oshmasligi kerak.');
      return;
    }
    setError('');
    const preview = URL.createObjectURL(file);
    if (kind === 'poster') {
      setPosterFile(file);
      setPosterPreview(preview);
    } else {
      setArtistFile(file);
      setArtistPreview(preview);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const uploadedPaths: string[] = [];
    try {
      const seatCount = Number(values.seatCount);
      const price = Number(values.ticketPrice);
      const charityPercent = Number(values.charityPercent);
      if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 5000) throw new Error('O‘rindiqlar soni 1 dan 5000 gacha bo‘lishi kerak.');
      if (!Number.isFinite(price) || price <= 0) throw new Error('Chipta narxini to‘g‘ri kiriting.');
      if (values.charityEnabled && (charityPercent < 0 || charityPercent > 100)) throw new Error('Xayriya foizi 0 dan 100 gacha bo‘lishi kerak.');
      const invitationSeats = parseInvitationSeats(values.invitationRanges, seatCount);
      const startsAt = toUzbekistanIsoDateTime(values.startsAtDate, values.startsAtTime, 'Tadbir boshlanishi');
      const endsAt = toUzbekistanIsoDateTime(values.endsAtDate, values.endsAtTime, 'Tadbir tugashi');
      if (endsAt <= startsAt) throw new Error('Tadbir tugash vaqti boshlanishidan keyin bo‘lishi kerak.');
      const uploadFolderId = crypto.randomUUID();
      const poster = posterFile ? await uploadEventImage(uploadFolderId, 'poster', posterFile) : null;
      if (poster) uploadedPaths.push(poster.path);
      const artistImage = artistFile ? await uploadEventImage(uploadFolderId, 'artist', artistFile) : null;
      if (artistImage) uploadedPaths.push(artistImage.path);
      const payload = {
        title: values.title.trim(),
        description: values.description.trim(),
        location: values.location.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
        sales_start_at: toUzbekistanIsoDateTime(values.salesStartDate, values.salesStartTime, 'Sotuv boshlanishi'),
        sales_end_at: toUzbekistanIsoDateTime(values.salesEndDate, values.salesEndTime, 'Sotuv tugashi'),
        ticket_price: price,
        seat_count: seatCount,
        payment_card_number: values.paymentCardNumber.replace(/\s/g, ''),
        poster_url: poster?.publicUrl ?? null,
        artist_image_url: artistImage?.publicUrl ?? null,
        charity_enabled: values.charityEnabled,
        charity_percent: values.charityEnabled ? charityPercent : 0,
        published: false,
      };
      const { error: saveError } = await ticketSupabase.rpc('ticket_admin_create_event', {
        p_event: payload,
        p_invitation_seats: invitationSeats,
      });
      if (saveError) throw saveError;
      uploadedPaths.length = 0;
      setValues((current) => ({
        ...current,
        title: '', description: '', location: '',
        startsAtDate: '', startsAtTime: '', endsAtDate: '', endsAtTime: '', salesStartDate: '', salesStartTime: '',
        salesEndDate: '', salesEndTime: '', ticketPrice: '', paymentCardNumber: '', invitationRanges: '',
      }));
      setPosterFile(null);
      setArtistFile(null);
      setPosterPreview('');
      setArtistPreview('');
      await onCreated();
    } catch (saveError) {
      let message = saveError instanceof Error ? saveError.message : 'Tadbirni saqlab bo‘lmadi.';
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await ticketSupabase.storage.from('ticket-banners').remove(uploadedPaths);
        if (cleanupError) message += ` Rasmlarni tozalab bo‘lmadi: ${cleanupError.message}`;
        else uploadedPaths.length = 0;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return <form className="admin-form" onSubmit={(event) => void submit(event)}>
    <div className="form-section-title"><div className="admin-icon"><CalendarPlus size={19} /></div><div><h3>Yangi tadbir</h3><p>Tadbir va chipta sotuv ma’lumotlari</p></div></div>
    <div className="form-grid">
      <label className="field-span">Tadbir nomi<input value={values.title} onChange={(event) => update('title', event.target.value)} minLength={2} maxLength={160} required placeholder="Masalan, Yozgi musiqa festivali" /></label>
      <label className="field-span">Tavsif<textarea value={values.description} onChange={(event) => update('description', event.target.value)} rows={3} placeholder="Tadbir haqida qisqacha" /></label>
      <label>Manzil<input value={values.location} onChange={(event) => update('location', event.target.value)} required placeholder="Toshkent, Humo Arena" /></label>
      <label>Chipta narxi (so‘m)<input type="number" min="1" step="1" value={values.ticketPrice} onChange={(event) => update('ticketPrice', event.target.value)} required /></label>
      <div className="datetime-field field-span"><span>Tadbir boshlanishi <small className="field-hint">O‘zbekiston vaqti · 24 soatlik format</small></span><div className="datetime-inputs"><label>Sana<input type="date" value={values.startsAtDate} onChange={(event) => update('startsAtDate', event.target.value)} required /></label><label>Soat<input type="text" inputMode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} placeholder="14:30" value={values.startsAtTime} onChange={(event) => update('startsAtTime', event.target.value)} required /></label></div></div>
      <div className="datetime-field field-span"><span>Tadbir tugashi <small className="field-hint">Chipta 48 soat saqlanadi</small></span><div className="datetime-inputs"><label>Sana<input type="date" value={values.endsAtDate} onChange={(event) => update('endsAtDate', event.target.value)} required /></label><label>Soat<input type="text" inputMode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} placeholder="17:30" value={values.endsAtTime} onChange={(event) => update('endsAtTime', event.target.value)} required /></label></div></div>
      <label>Jami o‘rindiqlar<input type="number" min="1" max="5000" value={values.seatCount} onChange={(event) => update('seatCount', event.target.value)} required /></label>
      <div className="datetime-field field-span"><span>Sotuv boshlanishi <small className="field-hint">O‘zbekiston vaqti · 24 soatlik format</small></span><div className="datetime-inputs"><label>Sana<input type="date" value={values.salesStartDate} onChange={(event) => update('salesStartDate', event.target.value)} required /></label><label>Soat<input type="text" inputMode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} placeholder="09:00" value={values.salesStartTime} onChange={(event) => update('salesStartTime', event.target.value)} required /></label></div></div>
      <div className="datetime-field field-span"><span>Sotuv tugashi <small className="field-hint">O‘zbekiston vaqti · 24 soatlik format</small></span><div className="datetime-inputs"><label>Sana<input type="date" value={values.salesEndDate} onChange={(event) => update('salesEndDate', event.target.value)} required /></label><label>Soat<input type="text" inputMode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} placeholder="20:00" value={values.salesEndTime} onChange={(event) => update('salesEndTime', event.target.value)} required /></label></div></div>
      <label className="field-span">To‘lov kartasi raqami<input inputMode="numeric" value={values.paymentCardNumber} onChange={(event) => update('paymentCardNumber', event.target.value)} minLength={16} maxLength={23} placeholder="8600 0000 0000 0000" required /></label>
      <label className="field-span">Taklifnoma o‘rinlari <span className="field-hint">Masalan: 1-20, 35, 40-45. Ushbu joylar sotuvga chiqmaydi.</span><input value={values.invitationRanges} onChange={(event) => update('invitationRanges', event.target.value)} placeholder="1-20, 35, 40-45" /></label>
      <label className="toggle-row field-span"><span><strong>Xayriya ajratish</strong><small>Har bir sotilgan chiptadan ajratiladi</small></span><button type="button" className="toggle-button" aria-label="Xayriyani yoqish yoki o‘chirish" onClick={() => update('charityEnabled', !values.charityEnabled)}>{values.charityEnabled ? <ToggleRight size={30} /> : <ToggleLeft size={30} />}</button></label>
      {values.charityEnabled && <label>Xayriya foizi (%)<input type="number" min="0" max="100" step="0.5" value={values.charityPercent} onChange={(event) => update('charityPercent', event.target.value)} required /></label>}
      <div className="event-media-fields field-span">
        <div><strong>Tadbir rasmlari</strong><p>Istalgan o‘lchamdagi poster yuklang. Sayt uni kartochka va tadbir sahifasiga avtomatik moslaydi; rasm kesilmasdan sig‘diriladi.</p></div>
        <label>Tadbir posteri<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseEventImage('poster', event.target.files?.[0])} /><small className="field-hint">JPG, PNG yoki WEBP · 30 MB gacha; katta rasm avtomatik kichrayadi</small>{posterPreview && <img className="event-image-preview" src={posterPreview} alt="Tadbir posteri ko‘rinishi" />}</label>
        <label>Ijrochi rasmi (ixtiyoriy)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseEventImage('artist', event.target.files?.[0])} /><small className="field-hint">JPG, PNG yoki WEBP · 30 MB gacha; katta rasm avtomatik kichrayadi</small>{artistPreview && <img className="event-image-preview artist-preview" src={artistPreview} alt="Ijrochi rasmi ko‘rinishi" />}</label>
      </div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-form-footer"><p>Tadbir yaratilgach, ko‘rinishi uchun “Sotuvda” holatini yoqing.</p><button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}{busy ? 'Saqlanmoqda...' : 'Tadbir yaratish'}</button></div>
  </form>;
}

function EventManager({ events, onRefresh }: { events: TicketEvent[]; onRefresh: () => Promise<void> }) {
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [editingEventId, setEditingEventId] = useState('');
  const [managingSeatsEventId, setManagingSeatsEventId] = useState('');
  const [error, setError] = useState('');
  async function toggleEvent(event: TicketEvent) {
    setBusyId(event.id);
    setError('');
    try {
      const { error: updateError } = await ticketSupabase.rpc('ticket_admin_set_event_published', {
        p_event_id: event.id, p_published: !event.published,
      });
      if (updateError) throw updateError;
      setMessage(`${event.title}: ${event.published ? 'sotuvdan olindi' : 'saytda e’lon qilindi'}.`);
      await onRefresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Holatni o‘zgartirib bo‘lmadi.');
    } finally {
      setBusyId('');
    }
  }

  return <section className="admin-section">
    <div className="admin-section-heading"><div><p className="eyebrow">TADBIRLAR RO‘YXATI</p><h3>Sotuv holati</h3></div><button className="icon-button" onClick={() => void onRefresh()} title="Yangilash"><RefreshCw size={17} /></button></div>
    {message && <p className="form-success">{message}</p>}{error && <p className="form-error">{error}</p>}
    {events.length === 0 ? <p className="admin-empty">Hali tadbir yaratilmagan.</p> : <div className="admin-event-list">{events.map((event) => <div key={event.id}>
      <div className="admin-event-row">
        <div className="admin-event-date">{formatEventDay(event.starts_at)}</div>
        <div className="admin-event-info"><strong>{event.title}</strong><span>{formatEventDate(event.starts_at)} · {event.location} · {formatMoney(event.ticket_price)}</span></div>
        <span className={`status-pill ${event.published ? 'status-approved' : 'status-draft'}`}>{event.published ? 'SOTUVDA' : 'YASHIRIN'}</span>
        <button className="button button-outline button-small" onClick={() => setManagingSeatsEventId((current) => current === event.id ? '' : event.id)}>{managingSeatsEventId === event.id ? <X size={14} /> : <TicketCheck size={14} />}{managingSeatsEventId === event.id ? 'Yopish' : 'Joylar'}</button>
        <button className="button button-outline button-small" onClick={() => setEditingEventId((current) => current === event.id ? '' : event.id)}>{editingEventId === event.id ? <X size={14} /> : <Pencil size={14} />}{editingEventId === event.id ? 'Yopish' : 'Tahrirlash'}</button>
        <button className={`button ${event.published ? 'button-outline' : 'button-primary'} button-small`} disabled={busyId === event.id} onClick={() => void toggleEvent(event)}>{busyId === event.id ? '...' : event.published ? 'Yashirish' : 'E’lon qilish'}</button>
      </div>
      {managingSeatsEventId === event.id && <SeatStatusManager event={event} />}
      {editingEventId === event.id && <EventEditor event={event} onCancel={() => setEditingEventId('')} onSaved={async () => { await onRefresh(); setEditingEventId(''); setMessage('Tadbir ma’lumotlari saqlandi.'); }} />}
    </div>)}</div>}
  </section>;
}

function SeatStatusManager({ event }: { event: TicketEvent }) {
  const [seats, setSeats] = useState<TicketSeat[]>([]);
  const [offlineSeats, setOfflineSeats] = useState<number[]>([]);
  const [invitationSeats, setInvitationSeats] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadSeats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await ticketSupabase.rpc('ticket_get_seats', { p_event_id: event.id });
      if (loadError) throw loadError;
      const loadedSeats = (data || []) as TicketSeat[];
      setSeats(loadedSeats);
      setOfflineSeats(loadedSeats.filter((seat) => seat.status === 'offline_sold').map((seat) => seat.seat_number));
      setInvitationSeats(loadedSeats.filter((seat) => seat.status === 'invitation').map((seat) => seat.seat_number));
      return true;
    } catch (loadError) {
      setError(`Joylar ro‘yxatini yuklab bo‘lmadi: ${loadError instanceof Error ? loadError.message : 'noma’lum xatolik'}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  useEffect(() => { void loadSeats(); }, [loadSeats]);

  function toggleSeat(seat: TicketSeat, status: 'invitation' | 'offline_sold') {
    if (status === 'invitation') {
      if (seat.status !== 'available' && seat.status !== 'invitation') return;
      setInvitationSeats((current) => current.includes(seat.seat_number)
        ? current.filter((number) => number !== seat.seat_number)
        : [...current, seat.seat_number].sort((a, b) => a - b));
      return;
    }
    if (seat.status !== 'available' && seat.status !== 'offline_sold') return;
    setOfflineSeats((current) => current.includes(seat.seat_number)
      ? current.filter((number) => number !== seat.seat_number)
      : [...current, seat.seat_number].sort((a, b) => a - b));
  }

  async function saveSeatStatuses() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { error: saveError } = await ticketSupabase.rpc('ticket_admin_set_seat_statuses', {
        p_event_id: event.id,
        p_offline_seats: offlineSeats,
        p_invitation_seats: invitationSeats,
      });
      if (saveError) throw saveError;
      if (!await loadSeats()) throw new Error('Joylar saqlandi, lekin ularning holatini qayta yuklab bo‘lmadi.');
      setNotice('Joylar holati saqlandi. Chipta narxi o‘zgartirilmadi.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Joylar holatini saqlab bo‘lmadi.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="seat-status-manager" aria-label={`${event.title} o‘rindiqlarini boshqarish`}>
    <h4>{event.title} — o‘rindiqlarni boshqarish</h4>
    <p className="field-hint">Joylarni band qilish uchun tanlang. Bu bo‘lim chipta narxiga ta’sir qilmaydi.</p>
    {loading ? <p className="admin-empty">O‘rindiqlar yuklanmoqda...</p> : <>
      <div className="seat-management-block">
        <strong>Taklifnoma joylari</strong>
        <p className="field-hint">Sotuvga chiqmaydi va sotilgan deb hisoblanmaydi.</p>
        <div className="event-seat-grid">{seats.map((seat) => {
          const selected = invitationSeats.includes(seat.seat_number);
          const blocked = seat.status !== 'available' && seat.status !== 'invitation';
          return <button type="button" className={`event-seat-choice ${selected ? 'selected invitation-selected' : ''}`} key={seat.id} disabled={blocked || busy} title={blocked ? (seat.status === 'reserved' ? 'Mijoz band qilgan' : 'Sotilgan joy') : selected ? 'Taklifnoma holatidan chiqarish' : 'Taklifnoma joyi deb belgilash'} onClick={() => toggleSeat(seat, 'invitation')}>{seat.seat_number}</button>;
        })}</div>
      </div>
      <div className="seat-management-block">
        <strong>Oflayn sotilgan joylar</strong>
        <p className="field-hint">Sotuvdan yopiladi va sotilgan deb hisoblanadi.</p>
        <div className="event-seat-grid">{seats.map((seat) => {
          const selected = offlineSeats.includes(seat.seat_number);
          const blocked = seat.status !== 'available' && seat.status !== 'offline_sold';
          return <button type="button" className={`event-seat-choice ${selected ? 'selected' : ''}`} key={seat.id} disabled={blocked || busy} title={blocked ? (seat.status === 'invitation' ? 'Taklifnoma joyi' : seat.status === 'reserved' ? 'Mijoz band qilgan' : 'Onlayn sotilgan chipta') : selected ? 'Oflayn sotuvdan chiqarish' : 'Oflayn sotilgan deb belgilash'} onClick={() => toggleSeat(seat, 'offline_sold')}>{seat.seat_number}</button>;
        })}</div>
      </div>
      <button type="button" className="button button-outline seat-status-save" onClick={() => void saveSeatStatuses()} disabled={busy || seats.length === 0}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
        {busy ? 'Joylar saqlanmoqda...' : 'Joylar holatini saqlash'}
      </button>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </section>;
}

function EventEditor({ event, onCancel, onSaved }: { event: TicketEvent; onCancel: () => void; onSaved: () => Promise<void> }) {
  const eventTime = getUzbekistanDateTime(event.starts_at);
  const eventEndTime = getUzbekistanDateTime(event.ends_at);
  const salesStart = getUzbekistanDateTime(event.sales_start_at);
  const salesEnd = getUzbekistanDateTime(event.sales_end_at);
  const [values, setValues] = useState({
    title: event.title,
    description: event.description,
    location: event.location,
    startsDate: eventTime.date,
    startsTime: eventTime.time,
    endsDate: eventEndTime.date,
    endsTime: eventEndTime.time,
    salesStartDate: salesStart.date,
    salesStartTime: salesStart.time,
    salesEndDate: salesEnd.date,
    salesEndTime: salesEnd.time,
    ticketPrice: String(event.ticket_price),
    paymentCardNumber: event.payment_card_number,
  });
  const [offlineSeats, setOfflineSeats] = useState<number[]>([]);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [artistFile, setArtistFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState('');
  const [artistPreview, setArtistPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    let active = true;
    ticketSupabase.rpc('ticket_get_seats', { p_event_id: event.id }).then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) setError(`Tadbir joylarini tekshirib bo‘lmadi: ${loadError.message}`);
      else setOfflineSeats(((data || []) as TicketSeat[]).filter((seat) => seat.status === 'offline_sold').map((seat) => seat.seat_number));
    });
    return () => { active = false; };
  }, [event.id]);

  async function save(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setBusy(true);
    setError('');
    const uploadedPaths: string[] = [];
    try {
      const ticketPrice = Number(values.ticketPrice);
      if (!Number.isFinite(ticketPrice) || ticketPrice <= 0) throw new Error('Chipta narxini to‘g‘ri kiriting.');
      const startsAt = toUzbekistanIsoDateTime(values.startsDate, values.startsTime, 'Tadbir sanasi');
      const endsAt = toUzbekistanIsoDateTime(values.endsDate, values.endsTime, 'Tadbir tugashi');
      const salesStartAt = toUzbekistanIsoDateTime(values.salesStartDate, values.salesStartTime, 'Sotuv boshlanishi');
      const salesEndAt = toUzbekistanIsoDateTime(values.salesEndDate, values.salesEndTime, 'Sotuv tugashi');
      if (endsAt <= startsAt) throw new Error('Tadbir tugash vaqti boshlanishidan keyin bo‘lishi kerak.');
      if (salesStartAt >= salesEndAt || salesEndAt > startsAt) {
        throw new Error('Sotuv tugash vaqti sotuv boshlanishidan keyin va tadbirdan oldin bo‘lishi kerak.');
      }
      const poster = posterFile ? await uploadEventImage(event.id, 'poster', posterFile) : null;
      if (poster) uploadedPaths.push(poster.path);
      const artistImage = artistFile ? await uploadEventImage(event.id, 'artist', artistFile) : null;
      if (artistImage) uploadedPaths.push(artistImage.path);
      const payload = {
        title: values.title.trim(),
        description: values.description.trim(),
        location: values.location.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
        sales_start_at: salesStartAt,
        sales_end_at: salesEndAt,
        ticket_price: ticketPrice,
        payment_card_number: values.paymentCardNumber.replace(/\s/g, ''),
        poster_url: poster?.publicUrl ?? event.poster_url,
        artist_image_url: artistImage?.publicUrl ?? event.artist_image_url,
      };
      const { error: saveError } = await ticketSupabase.rpc('ticket_admin_update_event', {
        p_event_id: event.id,
        p_event: payload,
        p_offline_seats: offlineSeats,
      });
      if (saveError) throw saveError;
      uploadedPaths.length = 0;
      await onSaved();
    } catch (saveError) {
      let message = saveError instanceof Error ? saveError.message : 'Tadbirni saqlab bo‘lmadi.';
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await ticketSupabase.storage.from('ticket-banners').remove(uploadedPaths);
        if (cleanupError) message += ` Yuklangan rasmlarni tozalab bo‘lmadi: ${cleanupError.message}`;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  function chooseImage(kind: 'poster' | 'artist', file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Rasm JPG, PNG yoki WEBP formatida bo‘lishi kerak.');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setError('Rasm hajmi 30 MB dan oshmasligi kerak.');
      return;
    }
    setError('');
    const url = URL.createObjectURL(file);
    if (kind === 'poster') {
      if (posterPreview.startsWith('blob:')) URL.revokeObjectURL(posterPreview);
      setPosterFile(file);
      setPosterPreview(url);
    } else {
      if (artistPreview.startsWith('blob:')) URL.revokeObjectURL(artistPreview);
      setArtistFile(file);
      setArtistPreview(url);
    }
  }

  return <form className="event-edit-panel" onSubmit={(formEvent) => void save(formEvent)}>
    <h4>Tadbir ma’lumotlarini tahrirlash</h4>
    <div className="form-grid">
      <label className="field-span">Tadbir nomi<input value={values.title} onChange={(change) => update('title', change.target.value)} minLength={2} maxLength={160} required /></label>
      <label className="field-span">Tavsif<textarea value={values.description} onChange={(change) => update('description', change.target.value)} rows={3} /></label>
      <label>Manzil<input value={values.location} onChange={(change) => update('location', change.target.value)} minLength={2} maxLength={240} required /></label>
      <label>Chipta narxi (so‘m)<input type="number" min="1" step="1" value={values.ticketPrice} onChange={(change) => update('ticketPrice', change.target.value)} required /></label>
      <div className="datetime-field field-span"><span>Tadbir sanasi va vaqti <small className="field-hint">O‘zbekiston vaqti · 24 soatlik format</small></span><div className="datetime-inputs"><label>Sana<input type="date" value={values.startsDate} onChange={(change) => update('startsDate', change.target.value)} required /></label><label>Soat<input type="text" inputMode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} placeholder="14:30" value={values.startsTime} onChange={(change) => update('startsTime', change.target.value)} required /></label></div></div>
      <div className="datetime-field field-span"><span>Tadbir tugashi <small className="field-hint">O‘zbekiston vaqti · chipta 48 soat saqlanadi</small></span><div className="datetime-inputs"><label>Sana<input type="date" value={values.endsDate} onChange={(change) => update('endsDate', change.target.value)} required /></label><label>Soat<input type="text" inputMode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} placeholder="17:30" value={values.endsTime} onChange={(change) => update('endsTime', change.target.value)} required /></label></div></div>
      <div className="datetime-field field-span"><span>Sotuv boshlanishi <small className="field-hint">O‘zbekiston vaqti</small></span><div className="datetime-inputs"><label>Sana<input type="date" value={values.salesStartDate} onChange={(change) => update('salesStartDate', change.target.value)} required /></label><label>Soat<input type="text" inputMode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} placeholder="09:00" value={values.salesStartTime} onChange={(change) => update('salesStartTime', change.target.value)} required /></label></div></div>
      <div className="datetime-field field-span"><span>Sotuv tugashi <small className="field-hint">O‘zbekiston vaqti</small></span><div className="datetime-inputs"><label>Sana<input type="date" value={values.salesEndDate} onChange={(change) => update('salesEndDate', change.target.value)} required /></label><label>Soat<input type="text" inputMode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} placeholder="20:00" value={values.salesEndTime} onChange={(change) => update('salesEndTime', change.target.value)} required /></label></div></div>
      <label className="field-span">To‘lov kartasi raqami<input inputMode="numeric" value={values.paymentCardNumber} onChange={(change) => update('paymentCardNumber', change.target.value)} minLength={16} maxLength={23} placeholder="8600 0000 0000 0000" required /></label>
      <label>Poster rasmi<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(change) => chooseImage('poster', change.target.files?.[0])} /><small className="field-hint">JPG, PNG yoki WEBP · 30 MB gacha; katta rasm avtomatik kichrayadi</small>{(posterPreview || event.poster_url) && <img className="event-image-preview" src={posterPreview || event.poster_url || ''} alt="Tadbir posteri" />}</label>
      <label>Ijrochi rasmi<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(change) => chooseImage('artist', change.target.files?.[0])} /><small className="field-hint">JPG, PNG yoki WEBP · 30 MB gacha; katta rasm avtomatik kichrayadi</small>{(artistPreview || event.artist_image_url) && <img className="event-image-preview" src={artistPreview || event.artist_image_url || ''} alt="Ijrochi rasmi" />}</label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="event-edit-actions"><button type="button" className="button button-outline" onClick={onCancel}>Bekor qilish</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{busy ? 'Saqlanmoqda...' : 'Saqlash'}</button></div>
  </form>;
}

function PaymentReviews() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [incomingPayment, setIncomingPayment] = useState<ReviewItem | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [stats, setStats] = useState({
    total_seats: 0, available_seats: 0, sold_seats: 0,
    pending_orders: 0, approved_orders: 0, rejected_orders: 0,
  });

  async function load(silent = false, incomingOrderId?: string) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const { data: statsData, error: statsError } = await ticketSupabase.rpc('ticket_admin_dashboard_stats');
      if (statsError) throw new Error(`Statistikani yuklab bo‘lmadi: ${statsError.message}`);
      const allRows: TicketOrderJoinRow[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: ordersError } = await ticketSupabase.from('ticket_orders')
          .select('id,event_id,seat_id,user_id,amount,status,proof_path,ai_result,rejection_reason,created_at,ticket_seats(seat_number),ticket_events(title,starts_at,ends_at,location)')
          .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
        if (ordersError) throw new Error(`To‘lovlarni yuklab bo‘lmadi: ${ordersError.message}`);
        const page = (data || []) as TicketOrderJoinRow[];
        allRows.push(...page);
        if (page.length < 500) break;
      }
      const rows = allRows.map(normalizeTicketOrder);
      setStats(statsData?.[0] || {
        total_seats: 0, available_seats: 0, sold_seats: 0,
        pending_orders: 0, approved_orders: 0, rejected_orders: 0,
      });

      const userIds = [...new Set(rows.map((order) => order.user_id))];
      const orderIds = rows.map((order) => order.id);
      const profiles = new Map<string, { full_name: string; phone: string }>();
      for (let offset = 0; offset < userIds.length; offset += 100) {
        const { data, error: profilesError } = await ticketSupabase.from('ticket_profiles')
          .select('user_id,full_name,phone').in('user_id', userIds.slice(offset, offset + 100));
        if (profilesError) throw new Error(`Xaridor ma’lumotlarini yuklab bo‘lmadi: ${profilesError.message}`);
        for (const profile of data || []) profiles.set(profile.user_id, profile);
      }
      const tickets = new Map<string, { id: string; ticket_code: string; status: 'valid' | 'expired' | 'cancelled' }>();
      for (let offset = 0; offset < orderIds.length; offset += 100) {
        const { data, error: ticketsError } = await ticketSupabase.from('ticket_tickets')
          .select('id,order_id,ticket_code,status').in('order_id', orderIds.slice(offset, offset + 100));
        if (ticketsError) throw new Error(`Chipta ma’lumotlarini yuklab bo‘lmadi: ${ticketsError.message}`);
        for (const ticket of data || []) tickets.set(ticket.order_id, ticket);
      }
      const withDetails: ReviewItem[] = [];
      for (let offset = 0; offset < rows.length; offset += 25) {
        const page = await Promise.all(rows.slice(offset, offset + 25).map(async (order) => {
          let proofUrl: string | null = null;
          if (order.proof_path) {
            const { data: signed, error: urlError } = await ticketSupabase.storage
              .from('ticket-payment-proofs').createSignedUrl(order.proof_path, 300);
            if (urlError) throw new Error(`Chek uchun xavfsiz havola yaratilmadi: ${urlError.message}`);
            proofUrl = signed.signedUrl;
          }
          const profile = profiles.get(order.user_id);
          const ticket = tickets.get(order.id);
          return {
            ...order,
            proofUrl,
            fullName: profile?.full_name || 'Noma’lum xaridor',
            phone: profile?.phone || '—',
            ticketId: ticket?.id || null,
            ticketCode: ticket?.ticket_code || null,
            ticketStatus: ticket?.status || null,
          };
        }));
        withDetails.push(...page);
      }
      setItems(withDetails);
      if (incomingOrderId) {
        const receivedOrder = withDetails.find((order) => order.id === incomingOrderId);
        if (receivedOrder?.proof_path && (receivedOrder.status === 'pending_review' || receivedOrder.status === 'needs_review')) {
          setIncomingPayment(receivedOrder);
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'To‘lovlar ma’lumotlarini yuklab bo‘lmadi.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const channel = ticketSupabase.channel('admin-ticket-payment-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_orders' }, (payload) => {
        if (payload.eventType !== 'UPDATE') return;
        const order = payload.new as Partial<TicketOrder>;
        if (
          order.id &&
          order.proof_path &&
          (order.status === 'pending_review' || order.status === 'needs_review')
        ) {
          void load(true, order.id);
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Admin to‘lov bildirishnomasi realtime holati: ${status}`);
        }
      });
    const refreshOnFocus = () => { if (document.visibilityState === 'visible') void load(true); };
    const fallbackRefresh = window.setInterval(() => { void load(true); }, 30_000);
    document.addEventListener('visibilitychange', refreshOnFocus);
    void load();
    return () => {
      window.clearInterval(fallbackRefresh);
      document.removeEventListener('visibilitychange', refreshOnFocus);
      void ticketSupabase.removeChannel(channel);
    };
  }, []);

  async function decide(order: ReviewItem, approve: boolean) {
    setBusyId(order.id);
    setError('');
    setNotice('');
    try {
      if (!approve && !reasons[order.id]?.trim()) throw new Error('Bekor qilish sababini kiriting.');
      const { error: actionError } = approve
        ? await ticketSupabase.rpc('ticket_approve_order', { p_order_id: order.id })
        : await ticketSupabase.rpc('ticket_reject_order', {
          p_order_id: order.id,
          p_reason: reasons[order.id].trim(),
        });
      if (actionError) throw actionError;
      setNotice(approve ? 'To‘lov tasdiqlandi va chipta berildi.' : 'Buyurtma bekor qilindi, o‘rindiq sotuvga qaytdi.');
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'To‘lovni ko‘rib chiqib bo‘lmadi.');
    } finally {
      setBusyId('');
    }
  }

  async function cancelTicket(order: ReviewItem) {
    const reason = reasons[order.id]?.trim();
    if (!reason) {
      setError('Chiptani bekor qilish sababini kiriting.');
      return;
    }
    setBusyId(order.id);
    setError('');
    setNotice('');
    try {
      if (!order.ticketId) throw new Error('Chipta identifikatori topilmadi.');
      const { error: cancelError } = await ticketSupabase.rpc('ticket_admin_cancel_ticket', {
        p_ticket_id: order.ticketId,
        p_reason: reason,
      });
      if (cancelError) throw cancelError;
      setNotice('Chipta bekor qilindi. Uning QR kodi endi yaroqsiz.');
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Chiptani bekor qilib bo‘lmadi.');
    } finally {
      setBusyId('');
    }
  }

  const filteredItems = items.filter((order) => {
    const pending = order.status === 'pending_review' || order.status === 'needs_review';
    const statusMatches = filter === 'all'
      || (filter === 'pending' && pending)
      || order.status === filter;
    const query = search.trim().toLocaleLowerCase();
    const searchMatches = !query || [
      order.id, order.ticketCode, order.fullName, order.phone, order.ticket_events?.title,
    ].some((value) => value?.toLocaleLowerCase().includes(query));
    return statusMatches && searchMatches;
  });

  return <section className="admin-section">
    <div className="admin-section-heading"><div><p className="eyebrow">BUYURTMALAR VA CHIPTALAR</p><h3>To‘lovlar</h3></div><button className="icon-button" onClick={() => void load()} title="Yangilash"><RefreshCw size={17} /></button></div>
    <div className="payment-stats">
      <div><small>Tekshirilmoqda</small><strong>{stats.pending_orders}</strong></div>
      <div><small>Tasdiqlangan</small><strong>{stats.approved_orders}</strong></div>
      <div><small>Rad etilgan</small><strong>{stats.rejected_orders}</strong></div>
      <div><small>Sotilgan joy</small><strong>{stats.sold_seats}</strong></div>
      <div><small>Bo‘sh joy</small><strong>{stats.available_seats}</strong></div>
    </div>
    {notice && <p className="form-success">{notice}</p>}{error && <p className="form-error">{error}</p>}
    {incomingPayment && <aside className="incoming-payment" role="status">
      <div className="incoming-payment-heading"><BellRing size={18} /><div><strong>Yangi to‘lov cheki kelib tushdi</strong><small>{incomingPayment.fullName} · {incomingPayment.phone}</small></div><button className="icon-button" onClick={() => setIncomingPayment(null)} aria-label="Bildirishnomani yopish"><X size={16} /></button></div>
      <div className="incoming-payment-details"><span><small>Buyurtma ID</small><strong>{incomingPayment.id}</strong></span><span><small>Tadbir</small><strong>{incomingPayment.ticket_events?.title || 'Tadbir'}</strong></span><span><small>Joy raqami</small><strong>{incomingPayment.ticket_seats?.seat_number ?? '—'}</strong></span><span><small>To‘lov</small><strong>{formatMoney(incomingPayment.amount)}</strong></span></div>
      {incomingPayment.proofUrl && <a className="incoming-proof-link" href={incomingPayment.proofUrl} target="_blank" rel="noreferrer"><img src={incomingPayment.proofUrl} alt="Yangi kelgan to‘lov cheki" /><span>Chekni to‘liq ochish</span></a>}
      <button className="button button-outline button-small" onClick={() => { setFilter('pending'); setSearch(incomingPayment.id); setIncomingPayment(null); }}>To‘lovni ko‘rib chiqish</button>
    </aside>}
    <div className="payment-filters">
      <label>Holat<select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="pending">Tekshirilmoqda</option><option value="approved">Tasdiqlangan</option><option value="rejected">Rad etilgan</option><option value="all">Barcha buyurtmalar</option></select></label>
      <label>Qidirish<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buyurtma/chipta ID, ism yoki telefon" /></label>
    </div>
    {loading ? <div className="loading-card">To‘lovlar yuklanmoqda...</div> : filteredItems.length === 0 ? <div className="admin-empty"><BadgeCheck size={22} /> Bu filtrlarda buyurtma topilmadi.</div> : <div className="review-list">{filteredItems.map((order) => {
      const pending = order.status === 'pending_review' || order.status === 'needs_review';
      const statusLabel = order.status === 'approved' ? 'TASDIQLANGAN'
        : order.status === 'rejected' ? 'RAD ETILGAN'
          : order.status === 'reserved' ? 'TO‘LOV KUTILMOQDA'
            : order.status === 'expired' ? 'MUDDATI TUGAGAN'
              : order.status === 'needs_review' ? 'QO‘LDA TEKSHIRISH'
                : 'TEKSHIRILMOQDA';
      return <article className="review-card" key={order.id}>
        <div className="review-top"><div><span className={`status-pill ${order.status === 'approved' ? 'status-approved' : order.status === 'rejected' || order.status === 'expired' ? 'status-rejected' : pending ? 'status-pending' : 'status-draft'}`}>{statusLabel}</span>{order.ticketStatus && <span className={`status-pill ${order.ticketStatus === 'valid' ? 'status-approved' : 'status-rejected'}`}>{order.ticketStatus === 'valid' ? 'CHIPTA FAOL' : order.ticketStatus === 'expired' ? 'CHIPTA MUDDATI TUGAGAN' : 'CHIPTA BEKOR QILINGAN'}</span>}<h4>{order.ticket_events?.title || 'Tadbir'}</h4><p>Buyurtma ID: {order.id}</p></div><ShieldAlert size={20} /></div>
        <div className="review-customer"><span><small>Xaridor</small><strong>{order.fullName}</strong></span><span><small>Telefon</small><strong>{order.phone}</strong></span><span><small>Joy</small><strong>{order.ticket_seats?.seat_number ?? '—'}</strong></span><span><small>Summa</small><strong>{formatMoney(order.amount)}</strong></span><span><small>Yuborilgan vaqt</small><strong>{formatEventDate(order.created_at)}</strong></span>{order.ticketCode && <span><small>Chipta ID</small><strong>{order.ticketCode}</strong></span>}</div>
        {order.ai_result?.reason && <div className="ai-reason"><CircleDollarSign size={16} /><span>{order.ai_result.reason}{typeof order.ai_result.confidence === 'number' ? ` · Ishonch ${Math.round(order.ai_result.confidence * 100)}%` : ''}</span></div>}
        {order.proof_path && order.proofUrl ? <a href={order.proofUrl} target="_blank" rel="noreferrer" className="proof-image-link"><img src={order.proofUrl} alt="Xaridor to‘lov cheki" /></a> : order.proof_path ? <div className="proof-missing">Chek rasmini ochib bo‘lmadi.</div> : null}
        {order.rejection_reason && <p className="rejection-note">Rad etish sababi: {order.rejection_reason}</p>}
        {(pending || order.ticketStatus === 'valid') && <label className="review-reason">{pending ? 'Bekor qilish sababi' : 'Chipta bekor qilish sababi'}<textarea value={reasons[order.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [order.id]: event.target.value }))} maxLength={500} placeholder="Sababini yozing..." /></label>}
        {pending && <div className="review-actions"><button className="button button-outline" disabled={busyId === order.id} onClick={() => void decide(order, false)}><Trash2 size={16} /> Bekor qilish</button><button className="button button-primary" disabled={busyId === order.id} onClick={() => void decide(order, true)}>{busyId === order.id ? <LoaderCircle className="spin" size={16} /> : <Check size={17} />} Qabul qilish</button></div>}
        {order.ticketStatus === 'valid' && <div className="review-actions"><button className="button button-outline" disabled={busyId === order.id} onClick={() => void cancelTicket(order)}><X size={16} /> Chiptani bekor qilish</button></div>}
      </article>;
    })}</div>}
  </section>;
}

function TicketBuyers() {
  const [buyers, setBuyers] = useState<TicketBuyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    try {
      const orders: BuyerOrderJoinRow[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: ordersError } = await ticketSupabase.from('ticket_orders')
          .select('id,user_id,amount,created_at,ticket_seats(seat_number),ticket_events(title)')
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .range(offset, offset + 499);
        if (ordersError) throw new Error(`Sotib olingan chiptalarni yuklab bo‘lmadi: ${ordersError.message}`);
        const page = (data || []) as BuyerOrderJoinRow[];
        orders.push(...page);
        if (page.length < 500) break;
      }

      const userIds = [...new Set(orders.map((order) => order.user_id))];
      const profiles = new Map<string, { full_name: string; phone: string }>();
      for (let offset = 0; offset < userIds.length; offset += 100) {
        const { data, error: profilesError } = await ticketSupabase.from('ticket_profiles')
          .select('user_id,full_name,phone').in('user_id', userIds.slice(offset, offset + 100));
        if (profilesError) throw new Error(`Xaridorlar ma’lumotlarini yuklab bo‘lmadi: ${profilesError.message}`);
        for (const profile of data || []) profiles.set(profile.user_id, profile);
      }

      const tickets = new Map<string, { ticket_code: string; status: BuyerOrder['ticketStatus'] }>();
      for (let offset = 0; offset < orders.length; offset += 100) {
        const orderIds = orders.slice(offset, offset + 100).map((order) => order.id);
        const { data, error: ticketsError } = await ticketSupabase.from('ticket_tickets')
          .select('order_id,ticket_code,status').in('order_id', orderIds);
        if (ticketsError) throw new Error(`Chipta holatlarini yuklab bo‘lmadi: ${ticketsError.message}`);
        for (const ticket of data || []) tickets.set(ticket.order_id, ticket);
      }

      const grouped = new Map<string, TicketBuyer>();
      for (const order of orders) {
        const profile = profiles.get(order.user_id);
        const ticket = tickets.get(order.id);
        const buyer = grouped.get(order.user_id) || {
          userId: order.user_id,
          fullName: profile?.full_name || 'Noma’lum xaridor',
          phone: profile?.phone || 'Telefon ko‘rsatilmagan',
          orders: [],
        };
        const event = firstRelation(order.ticket_events);
        const seat = firstRelation(order.ticket_seats);
        buyer.orders.push({
          id: order.id,
          eventTitle: event?.title || 'Tadbir',
          seatNumber: seat?.seat_number ?? null,
          amount: Number(order.amount),
          createdAt: order.created_at,
          ticketCode: ticket?.ticket_code || null,
          ticketStatus: ticket?.status || null,
        });
        grouped.set(order.user_id, buyer);
      }
      setBuyers([...grouped.values()].sort((left, right) => left.fullName.localeCompare(right.fullName, 'uz')));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Xaridorlar ro‘yxatini yuklab bo‘lmadi.');
    } finally {
      setLoading(false);
    }
  }

  function refresh() {
    setLoading(true);
    setError('');
    void load();
  }

  useEffect(() => { void load(); }, []);

  const query = search.trim().toLocaleLowerCase();
  const filteredBuyers = buyers.filter((buyer) => !query || [
    buyer.fullName,
    buyer.phone,
    ...buyer.orders.flatMap((order) => [order.eventTitle, order.ticketCode, String(order.seatNumber ?? '')]),
  ].some((value) => value?.toLocaleLowerCase().includes(query)));
  const ticketCount = buyers.reduce((total, buyer) => total + buyer.orders.length, 0);

  return <section className="admin-section">
    <div className="admin-section-heading"><div><p className="eyebrow">CHIPTA XARID QILGAN MIJOZLAR</p><h3>Foydalanuvchilar</h3></div><button className="icon-button" onClick={refresh} title="Yangilash"><RefreshCw size={17} /></button></div>
    <div className="buyer-stats"><div><small>Xaridorlar</small><strong>{buyers.length}</strong></div><div><small>Tasdiqlangan chiptalar</small><strong>{ticketCount}</strong></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <label className="buyer-search"><Search size={16} /><span className="sr-only">Xaridorni qidirish</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ism, telefon, tadbir, joy yoki chipta ID" /></label>
    {loading ? <div className="loading-card">Xaridorlar yuklanmoqda...</div> : filteredBuyers.length === 0
      ? <div className="admin-empty"><Users size={22} /> Tasdiqlangan chipta xarid qilgan foydalanuvchi topilmadi.</div>
      : <div className="buyer-list">{filteredBuyers.map((buyer) => <article className="buyer-card" key={buyer.userId}>
        <div className="buyer-heading">
          <div className="buyer-avatar"><Users size={18} /></div>
          <div className="buyer-identity"><strong>{buyer.fullName}</strong><a href={`tel:${buyer.phone.replace(/[^\d+]/g, '')}`}><Phone size={13} />{buyer.phone}</a></div>
          <span className="status-pill status-approved">{buyer.orders.length} ta chipta</span>
        </div>
        <div className="buyer-ticket-list">{buyer.orders.map((order) => <div className="buyer-ticket-row" key={order.id}>
          <div><strong>{order.eventTitle}</strong><small>{order.seatNumber === null ? 'Joy ma’lumoti yo‘q' : `${order.seatNumber}-joy`} · {formatMoney(order.amount)} · {formatEventDate(order.createdAt)}</small></div>
          <span className={`status-pill ${order.ticketStatus === 'valid' ? 'status-approved' : order.ticketStatus ? 'status-rejected' : 'status-pending'}`}>
            {order.ticketStatus === 'valid' ? <><TicketCheck size={12} /> Faol</>
              : order.ticketStatus === 'expired' ? 'Muddati tugagan'
                : order.ticketStatus === 'cancelled' ? 'Bekor qilingan'
                  : 'Arxivlangan'}
          </span>
          {order.ticketCode && <small className="buyer-ticket-code">ID: {order.ticketCode}</small>}
        </div>)}</div>
      </article>)}</div>}
  </section>;
}

function getEventImagePath(publicUrl: string | null, bucket: string) {
  if (!publicUrl) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const pathname = new URL(publicUrl).pathname;
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return null;
  const path = decodeURIComponent(pathname.slice(markerIndex + marker.length));
  return path.startsWith('events/') ? path : null;
}

function DeleteEvents({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadCounts() {
    setLoading(true);
    setError('');
    try {
      const { count: eventsCount, error: eventsError } = await ticketSupabase.from('ticket_events')
        .select('id', { count: 'exact', head: true });
      if (eventsError) throw new Error(`Tadbirlar sonini aniqlab bo‘lmadi: ${eventsError.message}`);
      const { count: ordersCount, error: ordersError } = await ticketSupabase.from('ticket_orders')
        .select('id', { count: 'exact', head: true });
      if (ordersError) throw new Error(`Buyurtmalar sonini aniqlab bo‘lmadi: ${ordersError.message}`);
      setEventCount(eventsCount || 0);
      setOrderCount(ordersCount || 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'O‘chirishdan oldingi ma’lumotlarni yuklab bo‘lmadi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCounts(); }, []);

  async function removeFiles(bucket: string, paths: string[]) {
    const uniquePaths = [...new Set(paths)];
    for (let offset = 0; offset < uniquePaths.length; offset += 100) {
      const { error: removeError } = await ticketSupabase.storage.from(bucket).remove(uniquePaths.slice(offset, offset + 100));
      if (removeError) throw new Error(`${bucket} fayllarini o‘chirib bo‘lmadi: ${removeError.message}`);
    }
  }

  async function purgeAll() {
    if (confirmation !== 'OCHIRISH') {
      setError('Davom etish uchun OCHIRISH so‘zini aynan kiriting.');
      return;
    }
    if (!window.confirm('Hamma tadbirlar, barcha buyurtmalar, chiptalar va chek rasmlari butunlay o‘chiriladi. Bu amalni qaytarib bo‘lmaydi. Davom etasizmi?')) {
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const events: Array<{ id: string; poster_url: string | null; artist_image_url: string | null }> = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: eventError } = await ticketSupabase.from('ticket_events')
          .select('id,poster_url,artist_image_url').order('id').range(offset, offset + 499);
        if (eventError) throw new Error(`Tadbir ma’lumotlarini yuklab bo‘lmadi: ${eventError.message}`);
        const page = data || [];
        events.push(...page);
        if (page.length < 500) break;
      }

      const orders: Array<{ proof_path: string | null }> = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: orderError } = await ticketSupabase.from('ticket_orders')
          .select('proof_path').order('id').range(offset, offset + 499);
        if (orderError) throw new Error(`To‘lov cheklari ro‘yxatini yuklab bo‘lmadi: ${orderError.message}`);
        const page = data || [];
        orders.push(...page);
        if (page.length < 500) break;
      }

      for (const event of events) {
        const { error: hideError } = await ticketSupabase.rpc('ticket_admin_set_event_published', {
          p_event_id: event.id,
          p_published: false,
        });
        if (hideError) throw new Error(`Tadbirlarni sotuvdan yopib bo‘lmadi: ${hideError.message}`);
      }

      const proofPaths = orders.flatMap((order) => order.proof_path ? [order.proof_path] : []);
      const mediaPaths = events.flatMap((event) => [
        getEventImagePath(event.poster_url, 'ticket-banners'),
        getEventImagePath(event.artist_image_url, 'ticket-banners'),
      ].filter((path): path is string => Boolean(path)));
      await removeFiles('ticket-payment-proofs', proofPaths);
      await removeFiles('ticket-banners', mediaPaths);

      const { data, error: purgeError } = await ticketSupabase.rpc('ticket_admin_delete_all_events');
      if (purgeError) {
        throw new Error(`Rasmlar o‘chirildi, lekin bazadagi xarid ma’lumotlarini o‘chirish amalga oshmadi: ${purgeError.message}. Tadbirlar xavfsizlik uchun sotuvdan yopiq qoldi.`);
      }
      const counts = data as { deleted_events?: number; deleted_orders?: number; deleted_tickets?: number } | null;
      setNotice(`${counts?.deleted_events ?? events.length} ta tadbir, ${counts?.deleted_orders ?? orders.length} ta buyurtma va ${counts?.deleted_tickets ?? 0} ta chipta o‘chirildi.`);
      setConfirmation('');
      await loadCounts();
      await onRefresh();
    } catch (purgeError) {
      setError(purgeError instanceof Error
        ? `${purgeError.message} Agar tadbirlar sotuvdan yopilgan bo‘lsa, fayllar va o‘chirish holatini tekshirib, amalni qayta bajaring.`
        : 'Ma’lumotlarni o‘chirish amalga oshmadi.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-section danger-section">
    <div className="admin-section-heading"><div><p className="eyebrow">QAYTARIB BO‘LMAYDIGAN AMAL</p><h3>Tadbirlarni o‘chirish</h3></div><button className="icon-button" onClick={() => void loadCounts()} title="Yangilash"><RefreshCw size={17} /></button></div>
    <div className="danger-warning"><ShieldAlert size={20} /><div><strong>Bu amal barcha savdo ma’lumotlarini butunlay o‘chiradi.</strong><p>Tadbirlar, o‘rindiqlar, buyurtmalar, chipta QR-kodlari, chek rasmlari hamda tadbir posterlari o‘chadi. Foydalanuvchi akkauntlari va bosh sahifa bannerlari saqlanib qoladi. O‘chirilgan ma’lumotlarni tiklab bo‘lmaydi.</p></div></div>
    <div className="buyer-stats"><div><small>O‘chiriladigan tadbirlar</small><strong>{loading ? '…' : eventCount ?? '—'}</strong></div><div><small>O‘chiriladigan buyurtmalar</small><strong>{loading ? '…' : orderCount ?? '—'}</strong></div></div>
    {notice && <p className="form-success" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <label className="purge-confirm">Tasdiqlash uchun OCHIRISH deb yozing<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" disabled={busy || loading || eventCount === 0} placeholder="OCHIRISH" /></label>
    <button className="button button-danger" onClick={() => void purgeAll()} disabled={busy || loading || eventCount === null || eventCount === 0 || confirmation !== 'OCHIRISH'}>
      {busy ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />}{busy ? 'O‘chirilmoqda...' : 'Barcha tadbirlar va xaridlarni o‘chirish'}
    </button>
  </section>;
}

function Banners() {
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropArea, setCropArea] = useState<Area | null>(null);
  const [title, setTitle] = useState('');
  const [banners, setBanners] = useState<Array<{ id: string; image_url: string; title: string; active: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    const { data, error: loadError } = await ticketSupabase.from('ticket_banners')
      .select('id,image_url,title,active').order('position');
    if (loadError) setError(`Bannerlarni yuklab bo‘lmadi: ${loadError.message}`);
    else setBanners(data || []);
  }
  useEffect(() => { void load(); return () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }; }, [imageUrl]);
  function chooseFile(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Faqat JPG, PNG yoki WEBP rasm yuklash mumkin.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Rasm hajmi 10 MB dan oshmasligi kerak.');
      return;
    }
    setError('');
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
  }
  async function upload() {
    if (!imageUrl || !cropArea) {
      setError('Avval banner rasmini tanlab, kesish chegarasini belgilang.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const blob = await cropImage(imageUrl, cropArea);
      const path = `${crypto.randomUUID()}.jpg`;
      const { error: storageError } = await ticketSupabase.storage.from('ticket-banners')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (storageError) throw storageError;
      const { data: publicUrl } = ticketSupabase.storage.from('ticket-banners').getPublicUrl(path);
      const { error: metadataError } = await ticketSupabase.from('ticket_banners').insert({
        image_path: path, image_url: publicUrl.publicUrl, title: title.trim(), position: banners.length,
      });
      if (metadataError) throw metadataError;
      setNotice('Banner yuklandi va bosh sahifada ko‘rsatildi.');
      setImageUrl('');
      setImageFile(null);
      setTitle('');
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Banner yuklanmadi.');
    } finally {
      setBusy(false);
    }
  }
  async function toggleBanner(banner: (typeof banners)[number]) {
    setError('');
    const { error: updateError } = await ticketSupabase.from('ticket_banners')
      .update({ active: !banner.active }).eq('id', banner.id);
    if (updateError) setError(`Banner holatini o‘zgartirib bo‘lmadi: ${updateError.message}`);
    else await load();
  }

  return <section className="admin-section">
    <div className="admin-section-heading"><div><p className="eyebrow">BOSH SAHIFA DIZAYNI</p><h3>Hero bannerlar</h3></div><ImagePlus size={20} /></div>
    <div className="banner-upload-layout">
      <div className="banner-crop-stage">{imageUrl ? <Cropper image={imageUrl} crop={crop} zoom={zoom} aspect={16 / 5} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_area, pixels) => setCropArea(pixels)} /> : <label className="banner-drop"><Upload size={23} /><strong>Rasm tanlash</strong><span>JPG, PNG yoki WEBP · 10 MB gacha</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} /></label>}</div>
      <div className="banner-tools">{imageUrl && <>
        <div className="crop-tip"><Crop size={17} /><span>Banner 16:5 nisbatda kesiladi. Rasmni suring va yaqinlashtiring.</span></div>
        <label>Kattalashtirish<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <label>Banner sarlavhasi (ixtiyoriy)<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Yangi festival" /></label>
        <div className="banner-tool-actions"><button className="button button-outline" onClick={() => { setImageUrl(''); setImageFile(null); }}>Bekor qilish</button><button className="button button-primary" disabled={busy || !imageFile} onClick={() => void upload()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Upload size={16} />}{busy ? 'Yuklanmoqda...' : 'Kesib yuklash'}</button></div>
      </>}</div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success">{notice}</p>}
    <div className="banner-list">{banners.map((banner) => <div className={`banner-list-item ${!banner.active ? 'banner-disabled' : ''}`} key={banner.id}><img src={banner.image_url} alt={banner.title || 'Hero banner'} /><div><strong>{banner.title || 'Sarlavhasiz banner'}</strong><small>{banner.active ? 'Saytda faol' : 'Yashirilgan'}</small></div><button className="button button-small button-outline" onClick={() => void toggleBanner(banner)}>{banner.active ? 'Yashirish' : 'Faollashtirish'}</button></div>)}</div>
    {banners.length === 0 && <p className="admin-empty">Hozircha banner yo‘q. Banner rasmlari Supabase Storage’da ommaviy ko‘rinadigan holda saqlanadi.</p>}
  </section>;
}

export default function AdminPanel({ events, onRefresh }: Props) {
  const [tab, setTab] = useState<PanelTab>('events');
  const [allEvents, setAllEvents] = useState<TicketEvent[]>([]);
  const tabItems = useMemo(() => [
    { id: 'events' as const, label: 'Tadbirlar', icon: CalendarPlus },
    { id: 'payments' as const, label: 'To‘lovlar', icon: ShieldAlert },
    { id: 'users' as const, label: 'Foydalanuvchilar', icon: Users },
    { id: 'banners' as const, label: 'Bannerlar', icon: ImagePlus },
    { id: 'delete' as const, label: 'Tadbirlarni o‘chirish', icon: Trash2 },
  ], []);
  async function loadAllEvents() {
    const { data, error } = await ticketSupabase.from('ticket_events').select(TICKET_EVENT_SELECT).order('starts_at');
    if (error) throw error;
    setAllEvents((data || []) as TicketEvent[]);
  }
  useEffect(() => { void loadAllEvents().catch((error: unknown) => console.error('Admin tadbirlarini yuklab bo‘lmadi:', error)); }, []);

  return <main className="page-section admin-page">
    <div className="admin-page-heading"><div><p className="eyebrow">CRP TICKET ADMIN</p><h1>Boshqaruv paneli</h1><p>Tadbirlar, to‘lovlar va bosh sahifa bannerlarini boshqaring.</p></div><div className="admin-secure"><LockKeyhole size={15} /> Himoyalangan</div></div>
    <div className="admin-tabs">{tabItems.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'admin-tab active' : 'admin-tab'} onClick={() => setTab(id)}><Icon size={17} />{label}{id === 'events' && <ChevronDown className="tab-chevron" size={13} />}</button>)}</div>
    {tab === 'events' && <div className="admin-workspace"><EventForm onCreated={async () => { await loadAllEvents(); await onRefresh(); }} /><EventManager events={allEvents.length ? allEvents : events} onRefresh={async () => { await loadAllEvents(); await onRefresh(); }} /></div>}
    {tab === 'payments' && <PaymentReviews />}
    {tab === 'users' && <TicketBuyers />}
    {tab === 'banners' && <Banners />}
    {tab === 'delete' && <DeleteEvents onRefresh={onRefresh} />}
  </main>;
}
