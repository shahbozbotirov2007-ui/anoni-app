import { useEffect, useState } from 'react';
import { QrCode, TicketCheck, Clock3, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { formatEventDate } from './format';
import { ticketSupabase } from './supabase';
import { normalizeTicket, normalizeTicketOrder } from './types';
import type { TicketJoinRow, TicketOrderJoinRow, Ticket, TicketOrder } from './types';

export default function TicketWallet({ userId, userCode, fullName }: { userId: string; userCode: string; fullName: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [orders, setOrders] = useState<TicketOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      const ticketRows: TicketJoinRow[] = [];
      let ticketError = '';
      for (let offset = 0; ; offset += 500) {
        const { data, error: loadError } = await ticketSupabase.from('ticket_tickets')
          .select('id,order_id,event_id,seat_id,user_id,ticket_code,status,created_at,ticket_seats(seat_number),ticket_events(title,starts_at,ends_at,location)')
          .eq('user_id', userId).eq('status', 'valid').order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(offset, offset + 499);
        if (loadError) {
          ticketError = loadError.message;
          break;
        }
        const page = (data || []) as TicketJoinRow[];
        ticketRows.push(...page);
        if (page.length < 500) break;
      }
      const orderRows: TicketOrderJoinRow[] = [];
      let orderError = '';
      for (let offset = 0; ; offset += 500) {
        const { data, error: loadError } = await ticketSupabase.from('ticket_orders')
          .select('id,event_id,seat_id,user_id,amount,status,proof_path,ai_result,rejection_reason,created_at,ticket_seats(seat_number),ticket_events(title,starts_at,ends_at,location)')
          .eq('user_id', userId).in('status', ['pending_review', 'needs_review', 'rejected', 'reserved'])
          .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
        if (loadError) {
          orderError = loadError.message;
          break;
        }
        const page = (data || []) as TicketOrderJoinRow[];
        orderRows.push(...page);
        if (page.length < 500) break;
      }
      if (!alive) return;
      if (ticketError) setError(`Chiptalarni yuklab bo‘lmadi: ${ticketError}`);
      else setTickets(ticketRows.map(normalizeTicket));
      if (orderError) setError((current) => current || `Buyurtmalarni yuklab bo‘lmadi: ${orderError}`);
      else setOrders(orderRows.map(normalizeTicketOrder));
      setLoading(false);
    }
    void load();
    const channel = ticketSupabase.channel(`ticket-wallet-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_orders', filter: `user_id=eq.${userId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_tickets', filter: `user_id=eq.${userId}` }, () => { void load(); })
      .subscribe();
    return () => { alive = false; void ticketSupabase.removeChannel(channel); };
  }, [userId]);

  async function downloadTicket(ticket: Ticket) {
    const card = document.querySelector<HTMLElement>(`[data-ticket-code="${ticket.ticket_code}"]`);
    const qr = card?.querySelector('svg');
    if (!card || !qr) {
      setError('Chipta rasmini tayyorlab bo‘lmadi. Sahifani yangilab qayta urinib ko‘ring.');
      return;
    }

    const svg = new XMLSerializer().serializeToString(qr);
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const qrImage = new Image();
      qrImage.src = svgUrl;
      await new Promise<void>((resolve, reject) => {
        qrImage.onload = () => resolve();
        qrImage.onerror = () => reject(new Error('QR kodni rasmga aylantirib bo‘lmadi.'));
      });

      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 560;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Chipta rasmi yaratilmadi.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#172033';
      context.fillRect(0, 0, canvas.width, 18);
      context.font = '700 32px Manrope, sans-serif';
      context.fillText('CRP TICKET', 48, 76);
      context.font = '700 30px Manrope, sans-serif';
      context.fillText(ticket.ticket_events?.title || 'CRP Ticket tadbiri', 48, 148, 650);
      context.font = '20px "DM Sans", sans-serif';
      context.fillStyle = '#747d90';
      context.fillText(ticket.ticket_events?.location || '', 48, 190, 650);
      context.fillText(ticket.ticket_events?.starts_at ? formatEventDate(ticket.ticket_events.starts_at) : '', 48, 232);
      context.fillStyle = '#172033';
      context.font = '700 22px "DM Sans", sans-serif';
      context.fillText(`Ism: ${fullName || 'Chipta egasi'}`, 48, 310, 650);
      context.fillText(`Joy: ${ticket.ticket_seats?.seat_number ?? '—'}`, 48, 352);
      context.font = '16px "DM Sans", sans-serif';
      context.fillStyle = '#747d90';
      context.fillText(`CHIPTA ID  ${ticket.ticket_code}`, 48, 420, 650);
      context.drawImage(qrImage, 744, 190, 200, 200);
      context.font = '14px "DM Sans", sans-serif';
      context.fillText('Kirishda QR kodni ko‘rsating', 710, 422);

      const image = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Chipta faylini saqlab bo‘lmadi.')), 'image/png');
      });
      const imageUrl = URL.createObjectURL(image);
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `crp-ticket-${ticket.ticket_code}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Chipta rasmini yuklab bo‘lmadi.');
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  return <main className="page-section wallet-page">
    <div className="section-heading"><div><p className="eyebrow">SIZNING TADBIRLARINGIZ</p><h1>Chiptalarim</h1>{userCode && <p className="user-id-label">Sizning foydalanuvchi ID: <strong>{userCode}</strong></p>}</div><div className="wallet-count">{tickets.length} ta chipta</div></div>
    {error && <div className="form-error">{error}</div>}
    {loading ? <div className="loading-card">Buyurtmalar yuklanmoqda...</div> : <>
      {orders.filter((order) => order.status === 'pending_review' || order.status === 'needs_review').map((order) => <div className="order-status-card" key={order.id}>
        <div className="pending-icon"><Clock3 size={20} /></div><div><strong>{order.ticket_events?.title || 'Tadbir'}</strong><p>{order.ticket_seats?.seat_number ? `${order.ticket_seats.seat_number}-joy · ` : ''}{order.status === 'needs_review' ? 'Admin tekshiruvida' : 'To‘lov tasdiqlanishini kutmoqda'}</p></div><span className="status-pill status-pending">KUTILMOQDA</span>
      </div>)}
      {orders.filter((order) => order.status === 'rejected').map((order) => <div className="order-status-card order-rejected" key={order.id}>
        <div className="pending-icon"><Clock3 size={20} /></div><div><strong>{order.ticket_events?.title || 'Tadbir'}</strong><p>To‘lov tasdiqlanmadi. Joy yana sotuvga chiqarildi.{order.rejection_reason ? ` Sabab: ${order.rejection_reason}` : ''}</p></div><span className="status-pill status-rejected">BEKOR QILINGAN</span>
      </div>)}
      {tickets.length === 0 && orders.every((order) => order.status !== 'pending_review' && order.status !== 'needs_review') ? <div className="empty-state"><div className="empty-icon"><QrCode /></div><h3>Hali chiptangiz yo‘q</h3><p>Tadbir tanlang, joyni band qiling va chiptangiz shu yerda paydo bo‘ladi.</p></div> : <div className="ticket-grid">
        {tickets.map((ticket) => <article className="ticket-card" key={ticket.id}>
          <div className="ticket-card-top" data-ticket-code={ticket.ticket_code}><div><span className="status-pill status-approved"><TicketCheck size={13} /> TASDIQLANGAN</span><h2>{ticket.ticket_events?.title || 'CRP Ticket tadbiri'}</h2><p>{ticket.ticket_events?.location || ''}</p></div><div className="ticket-qr"><QRCodeSVG value={`${window.location.origin}/?verify=${encodeURIComponent(ticket.ticket_code)}`} size={112} level="M" includeMargin /></div></div>
          <div className="ticket-divider"><span /><i /><span /></div>
          <div className="ticket-meta"><div><small>ISMI</small><strong>{fullName || 'Chipta egasi'}</strong></div><div><small>SANA VA VAQT</small><strong>{ticket.ticket_events?.starts_at ? `${formatEventDate(ticket.ticket_events.starts_at)} — ${formatEventDate(ticket.ticket_events.ends_at)}` : '—'}</strong></div><div><small>O‘RINDIQ</small><strong>{ticket.ticket_seats?.seat_number || '—'}</strong></div><div><small>CHIPTA ID</small><strong>{ticket.ticket_code}</strong></div></div>
          <button className="button button-outline ticket-download" onClick={() => void downloadTicket(ticket)}><Download size={16} /> Chiptani rasm sifatida yuklab olish</button>
        </article>)}
      </div>}
    </>}
  </main>;
}
