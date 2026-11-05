import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { CalendarDays, ChevronDown, CircleUserRound, LogOut, Menu, MessageCircle, RefreshCw, ShieldCheck, Tickets, X } from 'lucide-react';
import AuthDialog from './AuthDialog';
import EventDetail from './EventDetail';
import HomePage from './HomePage';
import SupportChat from './SupportChat';
import TicketVerification from './TicketVerification';
import { ticketSupabase, isTicketSupabaseConfigured } from './supabase';
import { TICKET_EVENT_SELECT } from './types';
import type { TicketBanner, TicketEvent } from './types';

type View = 'home' | 'event' | 'tickets' | 'admin' | 'support' | 'verify';
const verificationCode = new URLSearchParams(window.location.search).get('verify');
const CURRENT_YEAR = new Date().getFullYear();
const AdminPanel = lazy(() => import('./AdminPanel'));
const TicketWallet = lazy(() => import('./TicketWallet'));

function schemaNotReady(error: { code?: string; message: string }) {
  return error.code === 'PGRST205' || error.message.includes('schema cache')
    ? 'CRP Ticket bazasi hali ulanmagan. Supabase SQL Editor’da ticket migratsiyalarini sana tartibida ishga tushiring.'
    : error.message;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState('');
  const [userCode, setUserCode] = useState('');
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [banners, setBanners] = useState<TicketBanner[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<TicketEvent | null>(null);
  const [view, setView] = useState<View>(verificationCode ? 'verify' : 'home');
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshingPermissions, setRefreshingPermissions] = useState(false);
  const isAdmin = user?.app_metadata?.role === 'admin';

  const loadContent = useCallback(async () => {
    const [eventResult, bannerResult] = await Promise.all([
      ticketSupabase.from('ticket_events').select(TICKET_EVENT_SELECT).eq('published', true)
        .gt('starts_at', new Date().toISOString()).order('starts_at'),
      ticketSupabase.from('ticket_banners').select('*').eq('active', true).order('position'),
    ]);
    if (eventResult.error) setPageError(`Tadbirlarni yuklab bo‘lmadi: ${schemaNotReady(eventResult.error)}`);
    else setEvents((eventResult.data || []) as TicketEvent[]);
    if (bannerResult.error) setPageError((current) => current || `Bannerlarni yuklab bo‘lmadi: ${schemaNotReady(bannerResult.error)}`);
    else setBanners((bannerResult.data || []) as TicketBanner[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const syncSession = async (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      setUser(nextSession?.user || null);
      if (!nextSession?.user) {
        setFullName('');
        setUserCode('');
        return;
      }
      const { data, error: profileError } = await ticketSupabase
        .from('ticket_profiles')
        .select('full_name,user_code')
        .eq('user_id', nextSession.user.id)
        .maybeSingle();
      if (!active) return;
      if (profileError) {
        setPageError(`Profilni yuklab bo‘lmadi: ${profileError.message}`);
        return;
      }
      if (data?.full_name) setFullName(data.full_name);
      if (data?.user_code) setUserCode(data.user_code);
    };

    void ticketSupabase.auth.getSession().then(({ data, error }) => {
      if (error) setPageError(`Sessiyani tekshirib bo‘lmadi: ${error.message}`);
      void syncSession(data.session);
    });
    const { data: listener } = ticketSupabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => { void syncSession(nextSession); }, 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => { void loadContent(); }, [loadContent]);

  async function completeSignIn(name: string, phone: string) {
    const { data, error } = await ticketSupabase.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error('Akkaunt yaratilmadi. Iltimos, qaytadan urinib ko‘ring.');
    const { error: profileError } = await ticketSupabase.from('ticket_profiles').upsert({
      user_id: data.user.id,
      full_name: name,
      phone,
    }, { onConflict: 'user_id' });
    if (profileError) throw profileError;
    const { data: profile, error: profileLoadError } = await ticketSupabase
      .from('ticket_profiles')
      .select('user_code')
      .eq('user_id', data.user.id)
      .single();
    if (profileLoadError) throw profileLoadError;
    setFullName(name);
    setUserCode(profile.user_code);
    setUser(data.user);
    setView('home');
  }

  function chooseEvent(event: TicketEvent) {
    setSelectedEvent(event);
    setView('event');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function navigate(nextView: View) {
    setView(nextView);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function signOut() {
    const { error } = await ticketSupabase.auth.signOut();
    if (error) setPageError(`Hisobdan chiqib bo‘lmadi: ${error.message}`);
    else {
      setUser(null);
      setSession(null);
      setUserCode('');
      setView('home');
    }
  }

  async function refreshPermissions() {
    setRefreshingPermissions(true);
    setPageError('');
    const { data, error } = await ticketSupabase.auth.refreshSession();
    setRefreshingPermissions(false);
    if (error) {
      setPageError(`Sessiya ruxsatlarini yangilab bo‘lmadi: ${error.message}`);
      return;
    }
    if (!data.session) {
      setPageError('Sessiya yangilanmadi. Akkauntingizni yo‘qotmaslik uchun undan chiqmang va yordam so‘rang.');
      return;
    }
    setSession(data.session);
    setUser(data.session.user);
    if (data.session.user.app_metadata?.role !== 'admin') {
      setPageError('Sessiya yangilandi, lekin admin huquqi topilmadi. Supabase’da aynan shu akkauntga admin roli berilganini tekshiring.');
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <button className="brand flex items-center gap-2" onClick={() => navigate('home')} aria-label="CRP Ticket bosh sahifa">
            <img className="brand-logo" src="/crp-ticket-logo.png" alt="CRP Ticket" />
          </button>
          <nav className={`main-nav flex items-center gap-6 ${menuOpen ? 'nav-open' : ''}`}>
            <button className={view === 'home' || view === 'event' ? 'nav-active' : ''} onClick={() => navigate('home')}><CalendarDays size={16} /> Tadbirlar</button>
            {user && <button className={view === 'tickets' ? 'nav-active' : ''} onClick={() => navigate('tickets')}><Tickets size={16} /> Chiptalarim</button>}
            <button className={view === 'support' ? 'nav-active' : ''} onClick={() => navigate('support')}><MessageCircle size={16} /> Support</button>
            {isAdmin && <button className={view === 'admin' ? 'nav-active' : ''} onClick={() => navigate('admin')}><ShieldCheck size={16} /> Boshqaruv</button>}
          </nav>
          <div className="header-actions">
            {user ? <div className="account-menu">
              <button className="account-button" onClick={() => navigate('tickets')}><CircleUserRound size={18} /><span className="account-identity"><strong>{fullName || user.phone || 'Hisobim'}</strong>{userCode && <small>{userCode}</small>}</span><ChevronDown size={14} /></button>
              {!isAdmin && <button className="icon-button" onClick={() => void refreshPermissions()} disabled={refreshingPermissions} title="Admin huquqini yangilash" aria-label="Admin huquqini yangilash">{refreshingPermissions ? <RefreshCw className="spin" size={17} /> : <RefreshCw size={17} />}</button>}
              {!user.is_anonymous && <button className="icon-button logout-button" onClick={() => void signOut()} title="Hisobdan chiqish" aria-label="Hisobdan chiqish"><LogOut size={17} /></button>}
            </div> : <button className="button button-outline" onClick={() => setShowAuth(true)}>Ro‘yxatdan o‘tish <span className="button-arrow">↗</span></button>}
            <button className="icon-button mobile-menu" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Menyuni yopish' : 'Menyuni ochish'}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>
      </header>

      {!isTicketSupabaseConfigured && <div className="config-warning">Supabase ulanmagan. `.env.local` faylida `VITE_SUPABASE_URL` va `VITE_SUPABASE_PUBLISHABLE_KEY` qiymatlarini sozlang.</div>}
      {pageError && <div className="page-error" role="alert">{pageError}<button onClick={() => setPageError('')} aria-label="Xabarni yopish"><X size={15} /></button></div>}

      {view === 'home' && <HomePage events={events} banners={banners} loading={loading} onChoose={chooseEvent} />}
      {view === 'event' && selectedEvent && <EventDetail event={selectedEvent} session={session} onBack={() => navigate('home')} onNeedAuth={() => setShowAuth(true)} />}
      {view === 'tickets' && user && <Suspense fallback={<div className="page-section loading-card">Chiptalar yuklanmoqda...</div>}><TicketWallet userId={user.id} userCode={userCode} fullName={fullName} /></Suspense>}
      {view === 'admin' && isAdmin && <Suspense fallback={<div className="page-section loading-card">Boshqaruv yuklanmoqda...</div>}><AdminPanel events={events} onRefresh={loadContent} /></Suspense>}
      {view === 'support' && <SupportChat session={session} onNeedAuth={() => setShowAuth(true)} />}
      {view === 'verify' && verificationCode && <TicketVerification ticketCode={verificationCode} />}
      {view === 'verify' && !verificationCode && <HomePage events={events} banners={banners} loading={loading} onChoose={chooseEvent} />}
      {(view === 'tickets' && !user) || (view === 'admin' && !isAdmin) ? <HomePage events={events} banners={banners} loading={loading} onChoose={chooseEvent} /> : null}

      <footer className="site-footer"><div className="footer-inner"><button className="brand brand-footer" onClick={() => navigate('home')} aria-label="CRP Ticket bosh sahifa"><img className="brand-logo" src="/crp-ticket-logo.png" alt="CRP Ticket" /></button><span>Unutilmas tadbirlar uchun chiptalar.</span><span>© {CURRENT_YEAR} CRP Ticket</span></div></footer>
      {showAuth && <AuthDialog onClose={() => setShowAuth(false)} onComplete={completeSignIn} />}
    </div>
  );
}
