export const TICKET_EVENT_SELECT =
  'id,title,description,location,starts_at,ends_at,sales_start_at,sales_end_at,ticket_price,seat_count,payment_card_number,charity_enabled,charity_percent,published,poster_url,artist_image_url';

export type TicketEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  sales_start_at: string;
  sales_end_at: string;
  ticket_price: number;
  seat_count: number;
  payment_card_number: string;
  charity_enabled: boolean;
  charity_percent: number;
  published: boolean;
  poster_url: string | null;
  artist_image_url: string | null;
};

export type TicketSeat = {
  id: string;
  event_id: string;
  seat_number: number;
  status: 'available' | 'reserved' | 'sold' | 'invitation' | 'offline_sold';
};

export type TicketOrder = {
  id: string;
  event_id: string;
  seat_id: string;
  user_id: string;
  amount: number;
  status: 'reserved' | 'pending_review' | 'needs_review' | 'approved' | 'rejected' | 'expired';
  proof_path: string | null;
  ai_result: { reason?: string; confidence?: number; matched?: boolean } | null;
  rejection_reason: string | null;
  created_at: string;
  ticket_seats?: { seat_number: number } | null;
  ticket_events?: Pick<TicketEvent, 'title' | 'starts_at' | 'ends_at' | 'location'> | null;
};

export type Ticket = {
  id: string;
  order_id: string;
  event_id: string;
  seat_id: string;
  user_id: string;
  ticket_code: string;
  status: 'valid' | 'expired' | 'cancelled';
  created_at: string;
  ticket_seats: { seat_number: number } | null;
  ticket_events: Pick<TicketEvent, 'title' | 'starts_at' | 'ends_at' | 'location'> | null;
};

type Relation<T> = T | T[] | null;

export type TicketOrderJoinRow = Omit<TicketOrder, 'ticket_seats' | 'ticket_events'> & {
  ticket_seats: Relation<{ seat_number: number }>;
  ticket_events: Relation<Pick<TicketEvent, 'title' | 'starts_at' | 'ends_at' | 'location'>>;
};

export type TicketJoinRow = Omit<Ticket, 'ticket_seats' | 'ticket_events'> & {
  ticket_seats: Relation<{ seat_number: number }>;
  ticket_events: Relation<Pick<TicketEvent, 'title' | 'starts_at' | 'ends_at' | 'location'>>;
};

function first<T>(relation: Relation<T>) {
  return Array.isArray(relation) ? relation[0] || null : relation;
}

export function normalizeTicketOrder(row: TicketOrderJoinRow): TicketOrder {
  return {
    ...row,
    ticket_seats: first(row.ticket_seats),
    ticket_events: first(row.ticket_events),
  };
}

export function normalizeTicket(row: TicketJoinRow): Ticket {
  return {
    ...row,
    ticket_seats: first(row.ticket_seats),
    ticket_events: first(row.ticket_events),
  };
}

export type TicketBanner = {
  id: string;
  image_path: string;
  image_url: string;
  title: string;
  active: boolean;
  position: number;
};
