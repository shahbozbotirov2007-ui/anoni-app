import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import type { TicketBanner, TicketEvent } from './types';
import { formatEventDate, formatMoney } from './format';

type Props = {
  events: TicketEvent[];
  banners: TicketBanner[];
  loading: boolean;
  onChoose: (event: TicketEvent) => void;
};

export default function HomePage({ events, banners, loading, onChoose }: Props) {
  const [activeBanner, setActiveBanner] = useState(0);
  useEffect(() => {
    if (banners.length < 2) return undefined;
    const timer = window.setInterval(() => setActiveBanner((current) => (current + 1) % banners.length), 5500);
    return () => window.clearInterval(timer);
  }, [banners.length]);

  const banner = banners.length > 0 ? banners[activeBanner % banners.length] : undefined;

  return (
    <main>
      {banner && <section className="hero hero-banner" aria-label="Reklama bannerlari">
        <img className="hero-banner-image" src={banner.image_url} alt={banner.title || 'Reklama banneri'} />
      </section>}

      <section className="events-section page-section" id="events">
        <div className="section-heading">
          <div><p className="eyebrow">TAQVIMINGIZNI BOYITING</p><h2>Yaqinlashayotgan tadbirlar</h2></div>
          <span className="event-count">{events.length} ta tadbir</span>
        </div>
        {loading ? <div className="loading-card">Tadbirlar yuklanmoqda...</div> : events.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><CalendarDays /></div><h3>Hozircha tadbirlar yo‘q</h3><p>Yangi tadbirlar e’lon qilinganda shu yerda paydo bo‘ladi.</p></div>
        ) : <div className="event-grid grid gap-5 md:grid-cols-3">
          {events.map((event) => <article className="event-card" key={event.id}>
            <div className={`event-art ${event.poster_url ? 'has-poster' : ''}`}>
              {event.poster_url ? <img className="event-poster" src={event.poster_url} alt={`${event.title} posteri`} /> : <><div className="event-art-glow" /><span className="event-art-mark">CRP<span>LIVE</span></span></>}
              {event.artist_image_url && <img className="event-artist-thumb" src={event.artist_image_url} alt="Ijrochi" />}
              <span className="event-type">JONLI TADBIR</span>
            </div>
            <div className="event-info">
              <p className="event-date"><CalendarDays size={15} /> {formatEventDate(event.starts_at)}</p>
              <h3>{event.title}</h3>
              <p className="event-location"><MapPin size={15} /> {event.location}</p>
              <div className="event-card-bottom"><strong>{formatMoney(event.ticket_price)}</strong><button className="button button-dark" onClick={() => onChoose(event)}>Joy tanlash <ArrowRight size={16} /></button></div>
            </div>
          </article>)}
        </div>}
      </section>
    </main>
  );
}
