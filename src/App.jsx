import React, { useState, useEffect } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

import { 

  Home, FileText, Trophy, Zap, User, Shield, Plus, Trash2, Check, 

  X, Sparkles, AlertTriangle, MessageSquare, ShoppingBag,

  CreditCard, Settings, Users, Ban, Gift, Search, Eye, Share2, 

  ChevronRight, ArrowLeft, Send, Image as ImageIcon, RefreshCw, 

  Award, Clock, CheckCircle2, HelpCircle, Sliders, Heart, Bird,
  Flame, Crown, Star, BadgeCheck, Copy

} from 'lucide-react';



// --- Gemini API Helper ---

const callGeminiAPI = async (prompt, systemInstruction = "", jsonSchema = null) => {

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

  

  const payload = {

    contents: [{ parts: [{ text: prompt }] }],

  };



  if (systemInstruction) {

    payload.systemInstruction = { parts: [{ text: systemInstruction }] };

  }



  if (jsonSchema) {

    payload.generationConfig = {

      responseMimeType: "application/json",

      responseSchema: jsonSchema

    };

  }



  for (let attempt = 0; attempt < 3; attempt++) {

    try {

      const response = await fetch(apiUrl, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify(payload)

      });

      if (!response.ok) throw new Error('API Error');

      const result = await response.json();

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) return text;

    } catch (e) {

      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));

    }

  }

  return null;

};



// --- Daraja hisoblash funksiyasi ---

const LEVEL_THRESHOLDS = [

  { level: 1, xp: 0, color: 'yellow' },

  { level: 2, xp: 100, color: 'yellow' },

  { level: 3, xp: 250, color: 'yellow' },

  { level: 4, xp: 450, color: 'yellow' },

  { level: 5, xp: 750, color: 'green' },

  { level: 6, xp: 1150, color: 'green' },

  { level: 7, xp: 1650, color: 'green' },

  { level: 8, xp: 2300, color: 'green' },

  { level: 9, xp: 3300, color: 'red', requiresProMonths: 3 },

  { level: 10, xp: 5000, color: 'red', requiresProMonths: 3 },

  { level: 11, xp: 8000, color: 'red', requiresProMonths: 3 }

];

const getUTCDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

const ADMIN_PUBLIC_ID = '777-777';

const loadSavedAvatar = () => {
  try {
    const avatar = localStorage.getItem('anoni_avatar');
    return avatar?.startsWith('data:image/') ? avatar : null;
  } catch (error) {
    console.error('Could not load the saved avatar:', error);
    return null;
  }
};

const mapProfileRow = row => ({
  id: row.user_id,
  publicId: row.public_id,
  name: row.display_name,
  age: row.age,
  xp: row.xp,
  coins: row.coins,
  subscriptionUntil: row.subscription_until ? Date.parse(row.subscription_until) : null,
  subscriptionPermanent: Boolean(row.subscription_permanent),
  bannedUntil: row.banned_until ? Date.parse(row.banned_until) : null,
  isPro: Boolean(row.subscription_permanent || (row.subscription_until && Date.parse(row.subscription_until) > Date.now())),
  leaderboardHidden: Boolean(row.leaderboard_hidden),
  ownedItems: row.owned_items || [],
  testsCreatedToday: row.tests_created_date === getUTCDateKey() ? row.tests_created_count : 0,
  testsCreatedDate: row.tests_created_date,
  equipped: {
    nameColor: 'text-white',
    font: 'font-sans',
    frame: 'border-violet-400',
    anim: '',
    status: row.equipped_status || null
  },
  avatar: null,
  username: '',
  proMonths: 0,
  ban: row.banned_until && Date.parse(row.banned_until) > Date.now()
    ? { duration: 'vaqtinchalik', bannedUntil: Date.parse(row.banned_until) }
    : null
});

const fetchProfiles = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('xp', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(mapProfileRow);
};

const ADMIN_PROFILE = {
  id: 'ANONI-ADMIN',
  publicId: ADMIN_PUBLIC_ID,
  name: 'ADMIN',
  xp: 0,
  proMonths: 0,
  avatar: null,
  equipped: { nameColor: 'text-[#C8A66A]', font: 'font-black', frame: 'border-[#C8A66A]', anim: '' }
};

const SUBSCRIPTION_DURATIONS = [
  { label: '1 oylik', months: 1 },
  { label: '2 oylik', months: 2 },
  { label: '3 oylik', months: 3 },
  { label: 'Doimiy', permanent: true }
];
const BAN_DURATIONS = [
  { label: '1 kunlik', days: 1 },
  { label: '2 kunlik', days: 2 },
  { label: '3 kunlik', days: 3 },
  { label: '1 oylik', months: 1 },
  { label: '1 yillik', years: 1 }
];

const addCalendarDuration = (timestamp, duration) => {
  const date = new Date(timestamp);
  const dayOfMonth = date.getDate();
  date.setDate(1);
  if (duration.years) date.setFullYear(date.getFullYear() + duration.years);
  if (duration.months) date.setMonth(date.getMonth() + duration.months);
  if (duration.days) date.setDate(date.getDate() + duration.days);
  if (duration.months || duration.years) {
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(dayOfMonth, lastDayOfMonth));
  }
  return date.getTime();
};

const formatLocalDateTime = timestamp => new Intl.DateTimeFormat('uz-UZ', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
}).format(new Date(timestamp));

const getUserLevelInfo = (xp, proMonths = 0, isTopRank = false) => {

  let current = LEVEL_THRESHOLDS[0];

  let next = LEVEL_THRESHOLDS[1];

  let blockedByPro = false;



  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {

    if (xp >= LEVEL_THRESHOLDS[i].xp) {

      if (LEVEL_THRESHOLDS[i].level >= 9 && proMonths < 3 && !isTopRank) {

        blockedByPro = true;

        break;

      }

      current = LEVEL_THRESHOLDS[i];

      next = LEVEL_THRESHOLDS[i + 1] || null;

    } else {

      next = LEVEL_THRESHOLDS[i];

      break;

    }

  }

  return { ...current, nextXp: next ? next.xp : current.xp, blockedByPro };

};



export default function App() {
  const [registeredProfile, setRegisteredProfile] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [authBusy, setAuthBusy] = useState(false);
  const [avatarDataUrl, setAvatarDataUrl] = useState(loadSavedAvatar);
  const [isAvatarDragOver, setIsAvatarDragOver] = useState(false);
  const [registrationName, setRegistrationName] = useState('');
  const [registrationAge, setRegistrationAge] = useState('');
  const [registrationTermsAccepted, setRegistrationTermsAccepted] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const currentUserInitials = (registeredProfile?.name || '')
    .split(/\s+/)
    .slice(0, 2)
    .map(namePart => namePart[0])
    .join('')
    .toUpperCase();

  // --- Global Navigation & Mode ---

  const [activeTab, setActiveTab] = useState('bosh_sahifa');

  const [subView, setSubView] = useState(null); // 'create_test', 'solve_test', 'test_details', 'shop', 'pro', 'support'

  const [isAdminMode, setIsAdminMode] = useState(false);

  const [adminTab, setAdminTab] = useState('dashboard');

  const [toast, setToast] = useState(null);
  const [dailyRewardModal, setDailyRewardModal] = useState(null);
  const [accountActionModal, setAccountActionModal] = useState(null);
  const [testShareModal, setTestShareModal] = useState(null);
  const [dailyTestCreationProgress, setDailyTestCreationProgress] = useState(() => {
    return { date: getUTCDateKey(), count: 0 };
  });

  const dailyTestCreationCount = dailyTestCreationProgress.date === getUTCDateKey()
    ? dailyTestCreationProgress.count
    : 0;
  const reachedDailyTestCreationLimit = dailyTestCreationCount >= 2;



  const showToast = (message, type = 'success') => {

    setToast({ message, type });

    setTimeout(() => setToast(null), 3500);

  };

  const handleCopyPublicId = async publicId => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable.');
      }
      await navigator.clipboard.writeText(publicId);
      showToast('ID nusxa olindi!');
    } catch (error) {
      console.error('Could not copy the public ID:', error);
      showToast("ID nusxa olinmadi. Brauzer ruxsatlarini tekshiring.", 'error');
    }
  };

  const getTestShareMessage = test => (
    `Men ANONI’da "${test.title}" nomli yangi test yaratdim! ANONI’ga kiring: ${window.location.origin}`
  );

  const handleShareCreatedTest = async () => {
    if (!testShareModal) return;
    const shareData = {
      title: `ANONI testi: ${testShareModal.title}`,
      text: getTestShareMessage(testShareModal)
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setTestShareModal(null);
        return;
      }
      if (!navigator.clipboard?.writeText) {
        throw new Error('Share and clipboard APIs are unavailable.');
      }
      await navigator.clipboard.writeText(shareData.text);
      setTestShareModal(null);
      showToast('Ulashish matni nusxalandi!');
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Could not share the created test:', error);
      showToast("Ulashib bo'lmadi. Yana bir bor urinib ko'ring.", 'error');
    }
  };

  const handleCopyTestInvite = async () => {
    if (!testShareModal) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable.');
      }
      await navigator.clipboard.writeText(getTestShareMessage(testShareModal));
      showToast('Test taklif matni nusxalandi!');
      setTestShareModal(null);
    } catch (error) {
      console.error('Could not copy the test invite:', error);
      showToast("Taklifni nusxalab bo'lmadi. Brauzer ruxsatlarini tekshiring.", 'error');
    }
  };

  const applyAccountAction = async (userId, action, duration) => {
    const targetUser = users.find(user => user.id === userId);
    if (!targetUser) {
      showToast("Foydalanuvchi topilmadi. Sahifani yangilang.", 'error');
      return;
    }

    const actionType = action === 'subscription' && duration?.permanent
      ? 'subscription_permanent'
      : action;
    const actionUntil = actionType === 'unban' || actionType === 'subscription_permanent'
      ? null
      : actionType === 'subscription'
        ? new Date(addCalendarDuration(Math.max(Number(targetUser.subscriptionUntil) || Date.now(), Date.now()), duration)).toISOString()
        : new Date(addCalendarDuration(Date.now(), duration)).toISOString();
    const { error } = await supabase.rpc('admin_set_account_status', {
      p_user_id: userId,
      p_action: actionType,
      p_until: actionUntil
    });
    if (error) {
      console.error('Could not update account status:', error);
      showToast(error.message.includes('Admin role required')
        ? "Bu amal uchun Supabase admin roli talab qilinadi."
        : "Hisob holatini yangilab bo'lmadi.", 'error');
      return;
    }

    const auditMessage = action === 'subscription'
      ? `${targetUser.name} ga PRO obuna ${duration.permanent ? 'doimiy' : `${duration.label} muddatga`} berildi`
      : action === 'ban'
        ? `${targetUser.name} ${duration.label} muddatga BAN qilindi`
        : `${targetUser.name} BANdan ochildi`;
    setAuditLogs(previousLogs => [{
      id: `L-${Date.now()}`,
      admin: 'Admin',
      action: auditMessage,
      time: 'Hozirgina'
    }, ...previousLogs]);
    setAccountActionModal(null);
    showToast(
      action === 'subscription'
        ? `${targetUser.name} ga ${duration.permanent ? 'doimiy PRO' : `${duration.label} obuna`} berildi!`
        : action === 'ban'
          ? `${targetUser.name} ${duration.label} muddatga bloklandi.`
          : `${targetUser.name} blokdan chiqarildi.`,
      action === 'ban' ? 'error' : 'success'
    );
  };

  const setLeaderboardVisibility = async targetUser => {
    const hidden = !targetUser.leaderboardHidden;
    const { error } = await supabase.rpc('admin_set_leaderboard_visibility', {
      p_user_id: targetUser.id,
      p_hidden: hidden
    });
    if (error) {
      console.error('Could not update leaderboard visibility:', error);
      showToast(error.message.includes('Admin role required')
        ? "Bu amal uchun Supabase admin roli talab qilinadi."
        : "Reytingdagi ko'rinishni yangilab bo'lmadi.", 'error');
      return;
    }

    setUsers(previousUsers => previousUsers.map(user => user.id === targetUser.id
      ? { ...user, leaderboardHidden: hidden }
      : user));
    setRegisteredProfile(previousProfile => previousProfile?.id === targetUser.id
      ? { ...previousProfile, leaderboardHidden: hidden }
      : previousProfile);
    setAuditLogs(previousLogs => [{
      id: `L-${Date.now()}`,
      admin: 'Admin',
      action: `${targetUser.name} reytingdan ${hidden ? 'yashirildi' : 'qayta ko‘rsatildi'}`,
      time: 'Hozirgina'
    }, ...previousLogs]);
    showToast(`${targetUser.name} ${hidden ? 'reytingdan yashirildi' : 'reytingda qayta ko‘rsatiladi'}.`);
  };



  // --- Platform Settings (Admin configurable) ---

  const [settings, setSettings] = useState({

    xpTestCreate: 10,

    coinTestCreate: 5,

    xpChallenge: 15,

    coinChallenge: 8,

    xpPerSolver: 2,

    coinPerSolver: 2,

    proPriceUSD: 2.50,

    aiSystemPrompt: "Sen ANONI platformasining rasmiy AI yordamchisisiz. Foydalanuvchilarga xushmuomala va aniq tushuntirish ber. ANONI bu do'stlar bilimini sinash uchun testlar, reyting va kundalik challenge o'yinlar platformasi. PRO obuna narxi $2.50/oy, u 30 tagacha savol tuzish va profilni bezash imkonini beradi. 9-darajaga o'tish uchun 3 oy uzluksiz PRO kerak. Barcha javoblarni faqat o'zbek tilida qisqa va tushunarli yoz.",

  });



  // --- Users State ---

  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let active = true;
    let requestVersion = 0;

    const syncSession = async session => {
      const version = ++requestVersion;
      if (!session?.user) {
        setAuthUser(null);
        setRegisteredProfile(null);
        setCurrentUserId(null);
        setUsers([]);
        setIsAdminMode(false);
        setAuthLoading(false);
        return;
      }

      setAuthUser(session.user);
      setCurrentUserId(session.user.id);
      const isAdmin = session.user.app_metadata?.role === 'admin';
      setIsAdminMode(isAdmin);

      try {
        const profiles = await fetchProfiles();
        if (!active || version !== requestVersion) return;
        const profile = profiles.find(user => user.id === session.user.id);
        if (!profile) throw new Error('Authenticated account has no profile row.');
        setUsers(profiles);
        setRegisteredProfile(profile);
        setDailyTestCreationProgress({
          date: profile.testsCreatedDate || getUTCDateKey(),
          count: profile.testsCreatedToday || 0
        });
        setAuthLoading(false);
      } catch (error) {
        console.error('Could not load Supabase profiles:', error);
        if (!active || version !== requestVersion) return;
        setRegistrationError("Profil ma'lumotlarini yuklab bo'lmadi. Supabase migratsiyasi va RLS sozlamalarini tekshiring.");
        setAuthLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => { void syncSession(session); });
    });

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error('Could not restore the Supabase session:', error);
        setRegistrationError("Hisob sessiyasini tiklab bo'lmadi. Qayta kiring.");
        setAuthLoading(false);
        return;
      }
      if (!data.session) {
        void syncSession(null);
        return;
      }

      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
      if (!active) return;
      if (refreshError) {
        console.error('Could not refresh the Supabase session:', refreshError);
        setRegistrationError("Hisob sessiyasini yangilab bo'lmadi. Sahifani qayta yuklang va hisobdan chiqmang.");
        setAuthLoading(false);
        return;
      }
      void syncSession(refreshedData.session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const realtimeUserId = authUser?.id;
  useEffect(() => {
    if (!realtimeUserId) return undefined;

    const refreshProfiles = async () => {
      try {
        const profiles = await fetchProfiles();
        setUsers(profiles);
        const ownProfile = profiles.find(user => user.id === realtimeUserId);
        if (ownProfile) {
          setRegisteredProfile(ownProfile);
          setDailyTestCreationProgress({
            date: ownProfile.testsCreatedDate || getUTCDateKey(),
            count: ownProfile.testsCreatedToday || 0
          });
        }
      } catch (error) {
        console.error('Could not refresh Supabase profiles:', error);
        showToast("Reyting va profillarni yangilab bo'lmadi.", 'error');
      }
    };

    const channel = supabase
      .channel(`profiles:${realtimeUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        void refreshProfiles();
      })
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          showToast("Reytingning real vaqt ulanishi uzildi.", 'error');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [realtimeUserId]);

  const activeProfileId = registeredProfile?.id;
  useEffect(() => {
    if (!activeProfileId) return undefined;
    let active = true;

    supabase.rpc('claim_daily_login_reward').then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error('Could not claim daily login reward:', error);
        showToast("Kundalik bonusni olish muvaffaqiyatsiz tugadi.", 'error');
        return;
      }
      if (data.coins_awarded > 0) {
        setDailyRewardModal({ coins: data.coins_awarded, streakDay: data.streak_day });
      }
    });

    return () => { active = false; };
  }, [activeProfileId]);

  const storedCurrentUser = users.find(u => u.id === currentUserId) || {
    id: currentUserId,
    name: registeredProfile?.name || 'Foydalanuvchi',
    xp: 0,
    coins: 0,
    isPro: false,
    proMonths: 0,
    subscriptionUntil: registeredProfile?.subscriptionUntil ?? null,
    bannedUntil: registeredProfile?.bannedUntil ?? null,
    avatar: avatarDataUrl,
    ban: null,
    ownedItems: [],
    equipped: { nameColor: 'text-white', font: 'font-sans', frame: 'border-violet-400', anim: '' },
    aiFreeUsedThisWeek: false,
    testsCreatedToday: 0
  };
  const currentUser = {
    ...storedCurrentUser,
    id: currentUserId,
    publicId: registeredProfile?.publicId || storedCurrentUser.publicId,
    name: registeredProfile?.name || storedCurrentUser.name,
    age: registeredProfile?.age || storedCurrentUser.age || null,
    subscriptionUntil: registeredProfile?.subscriptionUntil ?? storedCurrentUser.subscriptionUntil ?? null,
    bannedUntil: registeredProfile?.bannedUntil ?? storedCurrentUser.bannedUntil ?? null,
    ban: registeredProfile?.ban ?? storedCurrentUser.ban ?? null,
    isPro: registeredProfile?.subscriptionUntil
      ? registeredProfile.subscriptionUntil > Date.now()
      : storedCurrentUser.subscriptionUntil
        ? storedCurrentUser.subscriptionUntil > Date.now()
        : Boolean(storedCurrentUser.isPro),
    username: '',
    avatar: avatarDataUrl
  };
  const isCurrentlyBanned = currentUser.bannedUntil
    ? Number(currentUser.bannedUntil) > Date.now()
    : Boolean(currentUser.ban);
  const leaderboardUsers = [
    ...users.filter(user => !user.leaderboardHidden && user.id !== currentUser.id),
    ...(currentUser.leaderboardHidden ? [] : [currentUser])
  ].sort((a, b) => b.xp - a.xp).concat(ADMIN_PROFILE);

  const userLevel = getUserLevelInfo(currentUser.xp, currentUser.proMonths);


  // --- Transactions & Audit Logs ---

  const [transactions, setTransactions] = useState([
  ]);

  const [auditLogs, setAuditLogs] = useState([

    { id: 'LOG-1', admin: 'SuperAdmin', action: 'Tizim ishga tushirildi va boshlang\'ich balanslar o\'rnatildi', time: 'Bugun, 09:00' }

  ]);



  const updateUserBalance = async (userId, xpDelta, coinDelta, reason, isAdminAction = false, activityReference = '') => {
    let error;
    if (isAdminAction) {
      ({ error } = await supabase.rpc('admin_adjust_balance', {
        p_user_id: userId,
        p_xp_delta: xpDelta,
        p_coin_delta: coinDelta
      }));
    } else if (userId !== currentUserId) {
      error = new Error('Client cannot adjust another user profile.');
    } else if (reason.startsWith('Yangi test yaratildi')) {
      const result = await supabase.rpc('claim_test_creation_reward');
      error = result.error;
      if (!error) {
        setDailyTestCreationProgress(previous => ({
          date: getUTCDateKey(),
          count: (previous.date === getUTCDateKey() ? previous.count : 0) + 1
        }));
      }
    } else if (reason === 'Kunlik Challenge bajarildi') {
      const result = await supabase.rpc('claim_challenge_reward', { p_challenge_id: activityReference });
      error = result.error;
    } else {
      error = new Error('This balance change is not backed by a permitted server action.');
    }

    if (error) {
      console.error('Could not apply cloud balance change:', error);
      showToast(error.message.includes('Admin role required')
        ? "Bu amal uchun Supabase admin roli talab qilinadi."
        : error.message.includes('limit')
          ? "Kunlik test yaratish limitiga yetdingiz (2/2). Ertagacha kuting!"
          : "Balansni yangilab bo'lmadi. Amal serverda rad etildi.", 'error');
      return false;
    }

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newTx = [];
    if (xpDelta !== 0) {
      newTx.push({ id: `TX-${Date.now()}-X`, userId, type: 'XP', amount: xpDelta, reason: isAdminAction ? `[Admin] ${reason}` : reason, date: `Bugun, ${now}` });
    }
    if (coinDelta !== 0) {
      newTx.push({ id: `TX-${Date.now()}-C`, userId, type: 'COIN', amount: coinDelta, reason: isAdminAction ? `[Admin] ${reason}` : reason, date: `Bugun, ${now}` });
    }
    setTransactions(previous => [...newTx, ...previous]);
    return true;
  };

  const purchaseShopItem = async item => {
    const { error } = await supabase.rpc('purchase_profile_item', { p_item_id: item.id });
    if (error) {
      console.error('Could not purchase profile item:', error);
      showToast(error.message.includes('Insufficient coins')
        ? 'Coin yetarli emas.'
        : error.message.includes('already owned')
          ? 'Bu mahsulot sizda bor.'
          : "Mahsulotni xarid qilib bo'lmadi.", 'error');
      return;
    }

    setUsers(previousUsers => previousUsers.map(user => user.id === currentUserId
      ? {
        ...user,
        coins: user.coins - item.price,
        ownedItems: [...user.ownedItems, item.id],
        equipped: { ...user.equipped, status: item.id }
      }
      : user));
    showToast(`${item.name} xarid qilindi va o'rnatildi!`);
  };

  const equipShopItem = async item => {
    const { error } = await supabase.rpc('equip_profile_item', { p_item_id: item.id });
    if (error) {
      console.error('Could not equip profile item:', error);
      showToast("Mahsulotni profilga o'rnatib bo'lmadi.", 'error');
      return;
    }
    setUsers(previousUsers => previousUsers.map(user => user.id === currentUserId
      ? { ...user, equipped: { ...user.equipped, status: item.id } }
      : user));
    showToast(`${item.name} profilga o'rnatildi!`);
  };



  // --- Tests State ---

  const [tests, setTests] = useState([]);



  // --- Create Test Form State ---

  const [newTestTitle, setNewTestTitle] = useState('');

  const [newTestAnon, setNewTestAnon] = useState(false);

  const [newTestQuestions, setNewTestQuestions] = useState([

    { q: "Mening eng sevimli rangim qaysi?", options: ["Qora", "Binafsha", "Ko'k", "Oq"], correct: 1 }

  ]);

  const [aiTopic, setAiTopic] = useState('');

  const [aiLoading, setAiLoading] = useState(false);



  // --- Solve Test State ---

  const [activeTestToSolve, setActiveTestToSolve] = useState(null);

  const [currentQIndex, setCurrentQIndex] = useState(0);

  const [selectedAnswers, setSelectedAnswers] = useState([]);

  const [testResult, setTestResult] = useState(null);

  const [selectedTestDetails, setSelectedTestDetails] = useState(null);

  const [testStartedAt, setTestStartedAt] = useState(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (subView !== 'solve_test' || !activeTestToSolve || testResult || !testStartedAt) return;

    const timerId = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - testStartedAt) / 1000));
    }, 250);

    return () => clearInterval(timerId);
  }, [subView, activeTestToSolve, testResult, testStartedAt]);



  // --- Challenge State ---

  const [challenges, setChallenges] = useState([

    {

      id: 'CH-1',

      type: 'Har kunlik tanlov',

      question: "Ko'rinmas bo'lish qobiliyatimi YOKI Fikrlarni o'qish qobiliyati?",

      optionA: "Ko'rinmas bo'lish 👻",

      optionB: "Fikrlarni o'qish 🧠",

      votesA: 142,

      votesB: 218,

      completedBy: []

    },

    {

      id: 'CH-2',

      type: 'Moslik sinovi',

      question: "Kechki payt dam olish uchun qaysi birini tanlaysiz?",

      optionA: "Do'stlar bilan shovqinli kafe ☕",

      optionB: "Uyda tinchgina kino ko'rish 🎬",

      votesA: 89,

      votesB: 195,

      completedBy: []

    }

  ]);

  const [aiChallengePrompt, setAiChallengePrompt] = useState('');

  const [aiChallengeLoading, setAiChallengeLoading] = useState(false);



  // --- Shop Items ---

  const SHOP_ITEMS = [
    { id: 'status_heart', name: 'Yurakcha Animatsiyasi', description: 'Ismingiz atrofida pulsatsiya qiluvchi yurak', category: 'status', value: 'status_heart', price: 350, icon: Heart, iconClass: 'text-rose-400', glowClass: 'bg-rose-500/15 ring-1 ring-rose-400/30', effectClass: 'animate-pulse' },
    { id: 'status_eagle', name: 'Burgut Statusi', description: 'Kuch va ulug‘vorlik belgisi', category: 'status', value: 'status_eagle', price: 500, icon: Bird, iconClass: 'text-sky-300', glowClass: 'bg-sky-500/15 ring-1 ring-sky-300/30', effectClass: 'animate-bounce' },
    { id: 'status_fire', name: 'Olovli Ism', description: 'Ismingiz ustida yonayotgan olov effekti', category: 'status', value: 'status_fire', price: 700, icon: Flame, iconClass: 'text-orange-400', glowClass: 'bg-orange-500/15 ring-1 ring-orange-400/30', effectClass: 'animate-pulse' },
    { id: 'status_crown', name: 'Qirollik Toji', description: 'Ismingiz ustidagi oltin toj belgisi', category: 'status', value: 'status_crown', price: 950, icon: Crown, iconClass: 'text-amber-300', glowClass: 'bg-amber-500/15 ring-1 ring-amber-300/30', effectClass: 'animate-bounce' },
    { id: 'status_lightning', name: 'Neon Chaqmoq', description: 'Tezkorlik va energiya animatsiyasi', category: 'status', value: 'status_lightning', price: 1200, icon: Zap, iconClass: 'text-violet-300', glowClass: 'bg-violet-500/15 ring-1 ring-violet-300/30', effectClass: 'animate-pulse' },
    { id: 'status_star', name: 'Yulduzcha Statusi', description: 'Premium foydalanuvchi belgisi', category: 'status', value: 'status_star', price: 1500, icon: Star, iconClass: 'text-yellow-300', glowClass: 'bg-yellow-500/15 ring-1 ring-yellow-300/30', effectClass: 'animate-pulse' },
    { id: 'status_vip_check', name: 'VIP Oq Galichka', description: 'Tasdiqlangan maxsus profil', category: 'status', value: 'status_vip_check', price: 2000, icon: BadgeCheck, iconClass: 'text-white', glowClass: 'bg-slate-400/15 ring-1 ring-white/30', effectClass: 'animate-pulse' },
    { id: 'status_gold_check', name: 'Oltin Galichka', description: 'Eng nufuzli va qimmat status', category: 'status', value: 'status_gold_check', price: 4000, icon: BadgeCheck, secondaryIcon: Crown, iconClass: 'text-amber-300', glowClass: 'bg-amber-500/15 ring-1 ring-amber-300/40', effectClass: 'animate-pulse' }
  ];

  const equippedStatus = SHOP_ITEMS.find(item => item.id === currentUser.equipped.status);



  // --- Click Payment Modal State ---

  const [paymentModal, setPaymentModal] = useState(null); // { title, amountUSD, type: 'PRO' | 'COINS', coinsAmount }

  const [coinPurchaseCoins, setCoinPurchaseCoins] = useState(null);
  const coinPurchaseMessage = coinPurchaseCoins
    ? `Salom! Men ANONI tizimidan ${currentUser.name} bo'laman. Menga ${coinPurchaseCoins} Coin kerak. To'lov qilish uchun yordam bering.`
    : '';

  // --- Support & AI Chat State ---

  const [tickets, setTickets] = useState([

    {

      id: 'TIC-1',

      userId: 'AN-1001',

      userName: 'Foydalanuvchi',

      status: 'open',

      messages: [

        { sender: 'ai', text: 'Assalomu alaykum! ANONI AI Support xizmatiga xush kelibsiz. Sizga qanday yordam bera olaman?', time: '10:00' }

      ]

    }

  ]);

  const [supportInput, setSupportInput] = useState('');

  const [aiSupportTyping, setAiSupportTyping] = useState(false);



  // --- Advertisements State (9:16 Popup with 3s countdown) ---

  const [ads, setAds] = useState([

    {

      id: 'AD-1',

      title: 'ANONI PRO — Cheklovsiz Imkoniyatlar!',

      imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',

      active: false,

      views: 1240,

      startDate: '2025-05-01',

      endDate: '2025-06-01'

    }

  ]);

  const [activeAdPopup, setActiveAdPopup] = useState(null);

  const [adTimer, setAdTimer] = useState(3);

  const [newAdTitle, setNewAdTitle] = useState('');
  const [newAdPrompt, setNewAdPrompt] = useState('');
  const [newAdPreviewImage, setNewAdPreviewImage] = useState('');
  const [newAdPreviewTitle, setNewAdPreviewTitle] = useState('');
  const [isGeneratingAdImage, setIsGeneratingAdImage] = useState(false);



  useEffect(() => {

    let interval = null;

    if (activeAdPopup && adTimer > 0) {

      interval = setInterval(() => {

        setAdTimer(prev => prev - 1);

      }, 1000);

    }

    return () => clearInterval(interval);

  }, [activeAdPopup, adTimer]);



  const triggerAdPopup = (ad) => {

    setActiveAdPopup(ad);

    setAdTimer(3);

    setAds(prev => prev.map(a => a.id === ad.id ? { ...a, views: a.views + 1 } : a));
  };

  const handleGenerateAd = async () => {
    const title = newAdTitle.trim();
    const prompt = newAdPrompt.trim();
    if (!title || !prompt || isGeneratingAdImage) return;

    setIsGeneratingAdImage(true);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=600&height=1067&nologo=true&seed=${Date.now()}`;

    try {
      await new Promise((resolve, reject) => {
        const image = new Image();
        const timeoutId = setTimeout(() => {
          image.src = '';
          reject(new Error('AI rasm yaratish vaqti tugadi.'));
        }, 90000);
        image.onload = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        image.onerror = () => {
          clearTimeout(timeoutId);
          reject(new Error('AI rasm xizmatidan tasvir olib bo‘lmadi.'));
        };
        image.src = imageUrl;
      });

      const newAd = {
        id: `AD-${Date.now()}`,
        title,
        imageUrl,
        active: true,
        views: 0,
        startDate: 'Bugun',
        endDate: '30 kundan so‘ng'
      };
      setNewAdPreviewTitle(title);
      setNewAdPreviewImage(imageUrl);
      setAds(previousAds => [newAd, ...previousAds]);
      setNewAdTitle('');
      setNewAdPrompt('');
      showToast("AI rasmli reklama muvaffaqiyatli qo'shildi!");
    } catch (error) {
      console.error('Could not generate the advertisement image:', error);
      showToast(error.message || "AI rasm yaratishda xatolik yuz berdi. Qayta urinib ko'ring.", 'error');
    } finally {
      setIsGeneratingAdImage(false);
    }
  };



  // --- Handlers: Test Creation & AI ---

  const maxQuestionsLimit = currentUser.isPro ? 30 : 15;



  const handleAddQuestion = () => {

    if (newTestQuestions.length >= maxQuestionsLimit) {

      showToast(`Sizning tarifingizda maksimal ${maxQuestionsLimit} ta savol mumkin!`, 'error');

      return;

    }

    setNewTestQuestions(prev => [

      ...prev,

      { q: '', options: ['', '', '', ''], correct: 0 }

    ]);

  };



  const handleGenerateAIQuestions = async () => {

    if (!aiTopic.trim()) {

      showToast("Iltimos, AI savol tuzishi uchun mavzu yozing!", "error");

      return;

    }

    if (!currentUser.isPro && currentUser.aiFreeUsedThisWeek) {

      showToast("Bepul tarifda haftada 1 marta AI ishlatish mumkin. PRO obunaga o'ting!", "error");

      return;

    }



    setAiLoading(true);

    const countToGen = currentUser.isPro ? 5 : 3;

    const schema = {

      type: "ARRAY",

      items: {

        type: "OBJECT",

        properties: {

          q: { type: "STRING" },

          options: { type: "ARRAY", items: { type: "STRING" } },

          correct: { type: "INTEGER" }

        },

        propertyOrdering: ["q", "options", "correct"]

      }

    };



    const prompt = `"${aiTopic}" mavzusida do'stlar bir-birini qanchalik bilishini sinaydigan ${countToGen} ta qiziqarli test savolini o'zbek tilida tuz. Har bir savolda aniq 4 ta javob varianti bo'lsin va 'correct' maydonida 0 dan 3 gacha bo'lgan taxminiy to'g'ri javob indeksi bo'lsin.`;



    const resText = await callGeminiAPI(prompt, "Sen qiziqarli psixologik va do'stlik testlari tuzuvchi mutaxassissan.", schema);

    setAiLoading(false);



    if (resText) {

      try {

        const parsed = JSON.parse(resText);

        if (Array.isArray(parsed) && parsed.length > 0) {

          const validQuestions = parsed.map(item => ({

            q: item.q || "Savol",

            options: Array.isArray(item.options) && item.options.length === 4 ? item.options : ["Variant 1", "Variant 2", "Variant 3", "Variant 4"],

            correct: typeof item.correct === 'number' && item.correct >= 0 && item.correct <= 3 ? item.correct : 0

          }));

          setNewTestQuestions(prev => [...prev, ...validQuestions].slice(0, maxQuestionsLimit));

          if (!currentUser.isPro) {

            setUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, aiFreeUsedThisWeek: true } : u));

          }

          showToast(`AI yordamida ${validQuestions.length} ta savol qo'shildi! Ularni tekshirib tasdiqlang.`);

          setAiTopic('');

          return;

        }

      } catch (e) {}

    }



    // Fallback if offline or error

    const fallbackQ = [

      { q: `${aiTopic} bo'yicha mening eng yoqtirgan jihatim nima?`, options: ["Sifat va uslub", "Tezkorlik", "Qulaylik", "Barchasi"], correct: 0 },

      { q: `Men ${aiTopic} tanlaganda nimaga e'tibor beraman?`, options: ["Do'stlar fikriga", "O'z didimga", "Trendga", "Narxiga"], correct: 1 }

    ];

    setNewTestQuestions(prev => [...prev, ...fallbackQ].slice(0, maxQuestionsLimit));

    showToast("AI savollar yaratdi! Tekshirib ko'ring.");

  };



  const handlePublishTest = async () => {
    if (dailyTestCreationCount >= 2) {
      showToast("Kunlik test yaratish limitiga yetdingiz (2/2). Ertagacha kuting!", "error");
      return;
    }

    if (!newTestTitle.trim()) {
      showToast("Test nomini kiriting!", "error");
      return;

    }

    if (newTestQuestions.length < 1) {

      showToast("Kamida 1 ta savol bo'lishi shart!", "error");

      return;

    }

    for (let i = 0; i < newTestQuestions.length; i++) {

      if (!newTestQuestions[i].q.trim()) {

        showToast(`${i + 1}-savol matni bo'sh!`, "error");

        return;

      }

    }



    const newTest = {

      id: `TEST-${Math.floor(100 + Math.random() * 900)}`,

      creatorId: currentUser.id,

      creatorName: currentUser.name,

      title: newTestTitle,

      isAnonymous: newTestAnon,

      createdAt: Date.now(),

      expiresAt: Date.now() + 30 * 3600 * 1000, // 30 soat
      status: 'active',
      questions: newTestQuestions,
      attempts: [],
      popularRewardGranted: false
    };

    const rewarded = await updateUserBalance(currentUser.id, 50, 0, `Yangi test yaratildi (${newTest.id})`);
    if (!rewarded) return;
    setTests(prev => [newTest, ...prev]);
    setTestShareModal({ title: newTest.title });
    showToast("+50 XP: Yangi test muvaffaqiyatli yaratildi!");



    setNewTestTitle('');

    setNewTestQuestions([{ q: '', options: ['', '', '', ''], correct: 0 }]);

    setSubView(null);

    setActiveTab('testlar');

  };



  // --- Handlers: Solving Test ---

  const startSolvingTest = (test) => {

    if (test.status !== 'active' || Date.now() > test.expiresAt) {

      showToast("Bu testning 30 soatlik faol vaqti tugagan!", "error");

      return;

    }

    const alreadySolved = test.attempts.some(a => a.userId === currentUser.id);

    if (alreadySolved) {

      showToast("Siz bu testga allaqachon javob bergansiz (Faqat 1 marta mumkin)!", "error");

      return;

    }

    setActiveTestToSolve(test);

    setCurrentQIndex(0);

    setSelectedAnswers([]);

    setTestResult(null);

    const startedAt = Date.now();
    setTestStartedAt(startedAt);
    setElapsedSeconds(0);

    setSubView('solve_test');

  };



  const handleSelectAnswer = (optionIndex) => {

    const updated = [...selectedAnswers, optionIndex];

    setSelectedAnswers(updated);



    if (currentQIndex + 1 < activeTestToSolve.questions.length) {

      setCurrentQIndex(currentQIndex + 1);

    } else {

      // Finish test

      let correctCount = 0;

      activeTestToSolve.questions.forEach((q, idx) => {

        if (updated[idx] === q.correct) correctCount++;

      });

      const percent = Math.round((correctCount / activeTestToSolve.questions.length) * 100);
      const elapsedTestSeconds = testStartedAt
        ? Math.floor((Date.now() - testStartedAt) / 1000)
        : 0;
      const isSpam = elapsedTestSeconds < 10;
      const attemptObj = {

        userId: currentUser.id,

        userName: activeTestToSolve.isAnonymous ? "Yashirin Ishtirokchi 🕵️" : currentUser.name,

        score: correctCount,

        total: activeTestToSolve.questions.length,

        percent,
        date: 'Hozirgina',
        elapsedSeconds: elapsedTestSeconds,
        isSpam,
        rewardXp: 0,
        rewardCoins: 0

      };


      setTests(prev => prev.map(t => t.id === activeTestToSolve.id
        ? {
          ...t,
          attempts: [...t.attempts, attemptObj],
          popularRewardGranted: t.popularRewardGranted
        }
        : t));

      if (!isSpam && currentUser.id !== activeTestToSolve.creatorId) {
        showToast("Test urinishlari hozircha faqat ushbu brauzerda saqlanadi; muallif mukofoti cloud testlar yoqilgach beriladi.", 'error');
      }

      setTestResult(attemptObj);
      showToast(isSpam
        ? 'Test juda tez yechildi. Natija qayd etildi, ammo mukofot berilmadi.'
        : 'Natijangiz qayd etildi. Cloud mukofotlari testlar bazaga ko‘chirilgach faollashadi.');

    }

  };



  // --- Handlers: Support AI Chat ---

  const handleSendSupportMessage = async () => {

    if (!supportInput.trim()) return;

    const userMsg = supportInput.trim();

    setSupportInput('');



    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setTickets(prev => prev.map(t => {

      if (t.userId !== currentUser.id) return t;

      return { ...t, messages: [...t.messages, { sender: 'user', text: userMsg, time: now }] };

    }));



    setAiSupportTyping(true);

    const aiReply = await callGeminiAPI(

      `Foydalanuvchi (${currentUser.name}, Daraja: ${userLevel.level}, Coin: ${currentUser.coins}, PRO: ${currentUser.isPro ? 'Bor' : 'Yo\'q'}) savoli: "${userMsg}"`,

      settings.aiSystemPrompt

    );

    setAiSupportTyping(false);



    const finalReply = aiReply || "Murojaatingiz qabul qilindi! Tez orada ANONI moderatorlari yoki tizim sizga batafsil ma'lumot beradi.";

    setTickets(prev => prev.map(t => {

      if (t.userId !== currentUser.id) return t;

      return { ...t, messages: [...t.messages, { sender: 'ai', text: finalReply, time: now }] };

    }));

  };



  // --- Handlers: Click Payment Process ---

  const handleRegistrationSubmit = async event => {
    event.preventDefault();

    if (authBusy) return;
    if (!registrationTermsAccepted) {
      setRegistrationError("Davom etish uchun foydalanish shartlariga rozilik bildiring.");
      return;
    }

    const name = registrationName.trim();
    const age = Number(registrationAge);
    if (!name) {
      setRegistrationError("Nick kiriting.");
      return;
    }
    if (!Number.isInteger(age) || age < 1 || age > 120) {
      setRegistrationError("Yosh 1 dan 120 gacha bo'lgan butun son bo'lishi kerak.");
      return;
    }

    setAuthBusy(true);
    setRegistrationError('');
    try {
      const { error } = await supabase.auth.signInAnonymously({
        options: { data: { display_name: name, age } }
      });
      if (error) throw error;
    } catch (error) {
      console.error('Anonymous Supabase registration failed:', error);
      setRegistrationError(
        error.message?.toLowerCase().includes('anonymous')
          ? "Supabase'da Anonymous Sign-Ins yoqilmagan. Authentication → Sign In / Providers → Anonymous Sign-Ins bo'limida yoqing."
          : error.message || "Hisob yaratib bo'lmadi. Qayta urinib ko'ring."
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const saveAvatarFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast("Faqat rasm faylini yuklash mumkin.", 'error');
      return;
    }
    if (file.size > 1500000) {
      showToast("Rasm hajmi 1.5 MB dan oshmasligi kerak.", 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/')) {
        showToast("Tanlangan rasmni o'qib bo'lmadi.", 'error');
        return;
      }

      try {
        localStorage.setItem('anoni_avatar', reader.result);
        setAvatarDataUrl(reader.result);
        showToast("Profil rasmi saqlandi!");
      } catch (error) {
        console.error('Could not save the avatar to local storage:', error);
        showToast("Rasmni saqlab bo'lmadi. Boshqa kichikroq rasm tanlang.", 'error');
      }
    };
    reader.onerror = () => {
      console.error('Could not read the selected avatar file:', reader.error);
      showToast("Rasm faylini o'qib bo'lmadi.", 'error');
    };
    reader.readAsDataURL(file);
  };



  // ============================================================================
  // BAN OVERLAY (Agar foydalanuvchi BAN olgan bo'lsa va Admin rejimida bo'lmasa)
  // ============================================================================

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0912] text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-violet-300/15 bg-[#15111F] px-5 py-4 text-sm text-slate-200">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-300/25 border-t-violet-300" />
          Supabase hisobingiz yuklanmoqda...
        </div>
      </main>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0912] px-5 py-8 text-white">
        <section className="w-full max-w-lg rounded-3xl border border-amber-300/20 bg-gradient-to-br from-[#211832] via-[#15111F] to-[#100D18] p-6 shadow-[0_0_60px_rgba(200,166,106,0.12)] sm:p-8">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10 text-2xl text-amber-200 ring-1 ring-amber-300/20">
            !
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-200">ANONI sozlamasi kerak</p>
          <h1 className="mt-2 text-2xl font-extrabold">Sayt hozircha ulanmagan</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#D1CADC]">
            Vercel deploy uchun Supabase muhit o‘zgaruvchilari topilmadi. Vercel loyihangizda quyidagi ikkita qiymatni qo‘shing:
          </p>
          <ul className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm">
            <li><code className="text-amber-200">VITE_SUPABASE_URL</code></li>
            <li><code className="text-amber-200">VITE_SUPABASE_PUBLISHABLE_KEY</code></li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            Vercel → Project Settings → Environment Variables bo‘limida Production va Preview uchun kiriting, saqlang, so‘ng yangi deployment qiling.
          </p>
        </section>
      </main>
    );
  }

  if (!registeredProfile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0912] px-5 py-8 text-white">
        <form
          onSubmit={handleRegistrationSubmit}
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-violet-300/20 bg-gradient-to-br from-[#211832] via-[#15111F] to-[#100D18] p-6 shadow-[0_0_60px_rgba(139,92,246,0.2)] sm:p-8"
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />
          <div className="relative">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-xl font-black tracking-widest text-violet-200 ring-1 ring-violet-300/25">
              A
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-violet-300">ANONI</p>
            <h1 className="mt-2 text-2xl font-extrabold">ANONI’ga kirish</h1>
            <p className="mt-2 text-sm leading-relaxed text-[#A7A0B5]">
              Faqat nick va yoshingizni kiriting. Email va parol kerak emas.
            </p>

            <label htmlFor="registration-name" className="mt-6 block text-xs font-semibold text-slate-300">Nick</label>
            <input
              id="registration-name"
              autoComplete="nickname"
              maxLength={50}
              required
              value={registrationName}
              onChange={event => setRegistrationName(event.target.value)}
              placeholder="Saytdagi ismingiz"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400"
            />

            <label htmlFor="registration-age" className="mt-4 block text-xs font-semibold text-slate-300">Yosh</label>
            <input
              id="registration-age"
              type="number"
              inputMode="numeric"
              min="1"
              max="120"
              step="1"
              required
              value={registrationAge}
              onChange={event => setRegistrationAge(event.target.value)}
              placeholder="Yoshingiz"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400"
            />

            <label htmlFor="registration-terms" className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3">
              <input
                id="registration-terms"
                type="checkbox"
                required
                checked={registrationTermsAccepted}
                onChange={event => {
                  setRegistrationTermsAccepted(event.target.checked);
                  if (event.target.checked) setRegistrationError('');
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400 focus:ring-2 focus:ring-amber-300"
              />
              <span className="text-sm leading-relaxed text-yellow-500">
                Qoidalarga roziman. Profilim shu brauzer va qurilmada saqlanishini, boshqa qurilmada nickni yozish avvalgi profilimni tiklamasligini tushunaman.
              </span>
            </label>

            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Eslatma: boshqa telefonda kirsangiz, u yerda alohida profil yaratiladi.
            </p>

            {registrationError && (
              <p role="alert" className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {registrationError}
              </p>
            )}

            <button
              type="submit"
              disabled={authBusy || !registrationTermsAccepted}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 text-sm font-extrabold text-white shadow-[0_0_24px_rgba(139,92,246,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {authBusy ? '⏳ Kutilmoqda...' : '🚀 Boshlash'}
            </button>
          </div>
        </form>
      </main>
    );
  }

  if (isCurrentlyBanned && !isAdminMode) {

    return (

      <div className="min-h-screen bg-[#0B0912] text-[#F8FAFC] flex items-center justify-center p-5 font-sans">

        <div className="max-w-md w-full bg-[#1D1729] border-2 border-[#EF4444] rounded-3xl p-8 text-center shadow-[0_0_40px_rgba(239,68,68,0.25)] flex flex-col items-center gap-4">

          <div className="w-20 h-20 rounded-full bg-[#EF4444]/20 text-[#EF4444] flex items-center justify-center animate-bounce">

            <Ban size={42} />

          </div>

          <h1 className="text-3xl font-extrabold text-[#EF4444]">Profil vaqtincha bloklangan</h1>
          <p className="text-sm leading-relaxed text-[#A7A0B5]">
            Sizning profilingiz qoidabuzarlik sababli{' '}
            {currentUser.bannedUntil
              ? `${formatLocalDateTime(Number(currentUser.bannedUntil))} gacha`
              : `${currentUser.ban?.duration || 'blokdan chiqarilguncha'} muddatga`} bloklangan.
          </p>
        </div>

      </div>

    );

  }



  // ============================================================================

  // ADMIN PANEL VIEW

  // ============================================================================

  if (isAdminMode) {

    return (

      <div className="min-h-screen bg-[#0B0912] text-[#F8FAFC] flex flex-col md:flex-row font-sans">

        {/* Toast Notification */}

        {toast && (

          <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl font-medium shadow-2xl border flex items-center gap-2 animate-in fade-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-950/90 border-red-500 text-red-200' : 'bg-[#1D1729]/95 border-[#8B5CF6] text-white'}`}>

            <Sparkles size={18} className="text-[#8B5CF6]" />

            <span>{toast.message}</span>

          </div>

        )}



        {/* Sidebar Navigation */}

        <aside className="w-full md:w-64 bg-[#15111F] border-b md:border-b-0 md:border-r border-white/10 p-5 flex flex-col justify-between">

          <div>

            <div className="flex items-center justify-between mb-8">

              <div className="flex items-center gap-2">

                <Shield className="text-[#8B5CF6]" size={26} />

                <span className="text-xl font-extrabold tracking-wider text-white">ANONI <span className="text-xs bg-[#8B5CF6] px-2 py-0.5 rounded-md">ADMIN</span></span>

              </div>

              <button 

                onClick={() => setIsAdminMode(false)}

                className="md:hidden text-xs bg-white/10 px-3 py-1.5 rounded-lg">

                Ilovaga qaytish

              </button>

            </div>



            <nav className="flex md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0">

              {[

                { id: 'dashboard', label: 'Statistika', icon: Sliders },

                { id: 'users', label: 'Foydalanuvchilar', icon: Users },

                { id: 'tests', label: 'Testlar nazorati', icon: FileText },

                { id: 'challenges', label: 'AI Challenge', icon: Zap },

                { id: 'ads', label: 'Reklama (9:16)', icon: ImageIcon },

                { id: 'ai_support', label: 'AI & Support', icon: MessageSquare },

                { id: 'settings', label: 'Iqtisod & Sovg\'a', icon: Settings },

              ].map(item => {

                const Icon = item.icon;

                return (

                  <button

                    key={item.id}

                    onClick={() => setAdminTab(item.id)}

                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${adminTab === item.id ? 'bg-[#8B5CF6] text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]' : 'text-[#A7A0B5] hover:bg-white/5 hover:text-white'}`}>

                    <Icon size={18} />

                    <span>{item.label}</span>

                  </button>

                );

              })}

            </nav>

          </div>



          <button 

            onClick={() => setIsAdminMode(false)}

            className="hidden md:flex items-center justify-center gap-2 w-full bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl text-sm font-semibold transition-all mt-8">

            <ArrowLeft size={16} />

            <span>Mobil Ilovaga Qaytish</span>

          </button>

        </aside>



        {/* Admin Main Area */}

        <main className="flex-1 p-5 md:p-8 overflow-y-auto max-h-screen">

          {adminTab === 'dashboard' && (

            <div className="space-y-6">

              <h2 className="text-2xl font-bold">Platforma Umumiy Ko'rsatkichlari</h2>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

                <div className="bg-[#1D1729] p-5 rounded-2xl border border-white/10">

                  <div className="text-[#A7A0B5] text-xs">Jami Foydalanuvchilar</div>

                  <div className="text-3xl font-extrabold mt-1">{users.length}</div>

                  <div className="text-xs text-green-400 mt-1">+2 bugun</div>

                </div>

                <div className="bg-[#1D1729] p-5 rounded-2xl border border-white/10">

                  <div className="text-[#A7A0B5] text-xs">Faol Testlar (30 soat)</div>

                  <div className="text-3xl font-extrabold mt-1 text-[#8B5CF6]">{tests.filter(t => t.status === 'active').length}</div>

                  <div className="text-xs text-[#A7A0B5] mt-1">Jami {tests.reduce((acc, t) => acc + t.attempts.length, 0)} ta yechilgan</div>

                </div>

                <div className="bg-[#1D1729] p-5 rounded-2xl border border-white/10">

                  <div className="text-[#A7A0B5] text-xs">PRO Obunachilar ($2.50)</div>

                  <div className="text-3xl font-extrabold mt-1 text-[#FBBF24]">{users.filter(u => u.subscriptionUntil ? Number(u.subscriptionUntil) > Date.now() : u.isPro).length}</div>

                  <div className="text-xs text-amber-300 mt-1">To'lov provayderi ulanmagan</div>

                </div>

                <div className="bg-[#1D1729] p-5 rounded-2xl border border-white/10">

                  <div className="text-[#A7A0B5] text-xs">BAN Olganlar</div>

                  <div className="text-3xl font-extrabold mt-1 text-[#EF4444]">{users.filter(u => u.bannedUntil ? Number(u.bannedUntil) > Date.now() : u.ban).length}</div>

                  <div className="text-xs text-[#A7A0B5] mt-1">Avto-nazorat yoqilgan</div>

                </div>

              </div>



              {/* Audit Logs */}

              <div className="bg-[#1D1729] p-6 rounded-2xl border border-white/10">

                <h3 className="font-bold mb-4 flex items-center gap-2">

                  <Shield size={18} className="text-[#8B5CF6]" />

                  Admin Audit Jurnali (Xavfsizlik Tarixi)

                </h3>

                <div className="space-y-2 max-h-60 overflow-y-auto">

                  {auditLogs.map(log => (

                    <div key={log.id} className="text-xs bg-black/30 p-3 rounded-xl border border-white/5 flex justify-between">

                      <span><strong className="text-[#C4B5FD]">{log.admin}:</strong> {log.action}</span>

                      <span className="text-[#A7A0B5]">{log.time}</span>

                    </div>

                  ))}

                </div>

              </div>

            </div>

          )}



          {adminTab === 'users' && (

            <div className="space-y-6">

              <div className="flex justify-between items-center">

                <h2 className="text-2xl font-bold">Foydalanuvchilar, Coin, XP va BAN Boshqaruvi</h2>

              </div>

              <div className="grid gap-4">

                {users.map(u => {

                  const lvl = getUserLevelInfo(u.xp, u.proMonths);
                  const subscriptionActive = u.subscriptionPermanent || (u.subscriptionUntil
                    ? Number(u.subscriptionUntil) > Date.now()
                    : Boolean(u.isPro));
                  const banActive = u.bannedUntil
                    ? Number(u.bannedUntil) > Date.now()
                    : Boolean(u.ban);

                  return (

                    <div key={u.id} className="bg-[#1D1729] p-5 rounded-2xl border border-white/10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">

                      <div className="flex items-center gap-4">

                        <img src={u.avatar} alt={u.name} className="w-12 h-12 rounded-full bg-black/40 border border-white/20" />

                        <div>

                          <div className="font-bold flex items-center gap-2">

                            <span>{u.name}</span>

                            <span className="text-xs text-[#A7A0B5]">({u.id})</span>

                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${lvl.color === 'red' ? 'bg-red-500/20 text-red-400' : lvl.color === 'green' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>

                              {lvl.level}-LVL

                            </span>

                            {subscriptionActive && <span className="text-[10px] bg-[#C8A66A]/15 text-[#C8A66A] px-2 py-0.5 rounded">PRO OBUNA</span>}
                            {u.leaderboardHidden && <span className="text-[10px] bg-violet-500/15 text-violet-200 px-2 py-0.5 rounded">REYTINGDAN YASHIRILGAN</span>}
                            {banActive && <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded">BAN</span>}

                          </div>

                          <div className="text-xs text-[#A7A0B5] mt-1">

                            XP: <strong className="text-white">{u.xp}</strong> | ANONI COIN: <strong className="text-[#FBBF24]">{u.coins}</strong>

                          </div>

                        </div>

                      </div>



                      <div className="flex flex-wrap gap-2">

                        <button 

                          onClick={async () => {
                            const updated = await updateUserBalance(u.id, 0, 50, "Admin tomonidan bonus", true);
                            if (!updated) return;
                            setAuditLogs(prev => [{ id: `L-${Date.now()}`, admin: 'Admin', action: `${u.name} ga +50 Coin qo'shildi`, time: 'Hozirgina' }, ...prev]);
                            showToast(`${u.name} ga +50 Coin berildi!`);

                          }}

                          className="text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 px-3 py-2 rounded-lg font-medium">

                          +50 Coin

                        </button>

                        <button 

                          onClick={async () => {
                            const updated = await updateUserBalance(u.id, 100, 0, "Admin XP mukofoti", true);
                            if (!updated) return;
                            setAuditLogs(prev => [{ id: `L-${Date.now()}`, admin: 'Admin', action: `${u.name} ga +100 XP qo'shildi`, time: 'Hozirgina' }, ...prev]);
                            showToast(`${u.name} ga +100 XP berildi!`);

                          }}

                          className="text-xs bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 text-[#C4B5FD] px-3 py-2 rounded-lg font-medium">

                          +100 XP

                        </button>

                        <button
                          type="button"
                          onClick={() => setAccountActionModal({ userId: u.id, userName: u.name, type: 'subscription' })}
                          className="text-xs rounded-lg border border-[#C8A66A]/30 bg-[#C8A66A]/10 px-3 py-2 font-medium text-[#C8A66A] transition hover:bg-[#C8A66A]/20">
                          Obuna berish
                        </button>
                        <button
                          type="button"
                          onClick={() => setLeaderboardVisibility(u)}
                          className={`text-xs rounded-lg border px-3 py-2 font-medium transition ${
                            u.leaderboardHidden
                              ? 'border-violet-300/30 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20'
                              : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          {u.leaderboardHidden ? 'Reytingga qaytarish' : 'Reytingdan yashirish'}
                        </button>

                        <button
                          type="button"
                          onClick={() => setAccountActionModal({ userId: u.id, userName: u.name, type: 'ban' })}
                          className="text-xs rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 font-medium text-red-300 transition hover:bg-red-500/20">
                          Ban qilish
                        </button>
                        {banActive && (
                          <button
                            type="button"
                            onClick={() => applyAccountAction(u.id, 'unban')}
                            className="text-xs rounded-lg bg-emerald-500/10 px-3 py-2 font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                          >
                            Ban ni bekor qilish
                          </button>
                        )}
                        {subscriptionActive && u.subscriptionPermanent && (
                          <span className="self-center text-[10px] text-[#C8A66A]">Doimiy PRO</span>
                        )}
                        {subscriptionActive && !u.subscriptionPermanent && u.subscriptionUntil && (
                          <span className="self-center text-[10px] text-[#C8A66A]">
                            {formatLocalDateTime(u.subscriptionUntil)} gacha
                          </span>
                        )}
                        {banActive && u.bannedUntil && (
                          <span className="self-center text-[10px] text-red-300">
                            {formatLocalDateTime(u.bannedUntil)} gacha
                          </span>
                        )}

                      </div>

                    </div>

                  );

                })}

              </div>

            </div>

          )}



          {adminTab === 'tests' && (

            <div className="space-y-6">

              <h2 className="text-2xl font-bold">Barcha Testlar va Shikoyatlar Nazorati</h2>

              <div className="grid gap-4">

                {tests.map(t => (

                  <div key={t.id} className="bg-[#1D1729] p-5 rounded-2xl border border-white/10 flex justify-between items-center">

                    <div>

                      <div className="font-bold flex items-center gap-2">

                        <span>{t.title}</span>

                        <span className="text-xs text-[#A7A0B5]">({t.id})</span>

                        <span className={`text-xs px-2 py-0.5 rounded ${t.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>

                          {t.status === 'active' ? 'Faol (30s)' : 'Bloklangan'}

                        </span>

                      </div>

                      <div className="text-xs text-[#A7A0B5] mt-1">

                        Muallif: {t.creatorName} | Savollar: {t.questions.length} ta | Ishtirokchilar: {t.attempts.length} ta

                      </div>

                    </div>

                    <div className="flex gap-2">

                      <button 

                        onClick={() => {

                          setTests(prev => prev.map(item => item.id === t.id ? { ...item, status: item.status === 'active' ? 'blocked' : 'active' } : item));

                          showToast(`Test holati o'zgartirildi!`);

                        }}

                        className="text-xs bg-red-500/20 text-red-400 px-3 py-2 rounded-lg font-medium">

                        {t.status === 'active' ? 'Testni Bloklash' : 'Faollashtirish'}

                      </button>

                    </div>

                  </div>

                ))}

              </div>

            </div>

          )}



          {adminTab === 'challenges' && (

            <div className="space-y-6">

              <h2 className="text-2xl font-bold">Gemini AI Yordamida Kunlik Challenge Yaratish</h2>

              <div className="bg-[#1D1729] p-6 rounded-2xl border border-white/10 space-y-4">

                <p className="text-sm text-[#A7A0B5]">

                  Siz aytganingizdek, Admin mavzu yoki ko'rsatma beradi, Gemini AI esa foydalanuvchilar uchun yangi kunlik Challenge tuzib beradi.

                </p>

                <div className="flex gap-3">

                  <input 

                    type="text"

                    value={aiChallengePrompt}

                    onChange={(e) => setAiChallengePrompt(e.target.value)}

                    placeholder="Masalan: Texnologiya va kelajak haqida qiyin tanlov savoli..."

                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#8B5CF6]"

                  />

                  <button 

                    onClick={async () => {

                      if (!aiChallengePrompt.trim()) return;

                      setAiChallengeLoading(true);

                      const schema = {

                        type: "OBJECT",

                        properties: {

                          question: { type: "STRING" },

                          optionA: { type: "STRING" },

                          optionB: { type: "STRING" }

                        },

                        propertyOrdering: ["question", "optionA", "optionB"]

                      };

                      const res = await callGeminiAPI(

                        `"${aiChallengePrompt}" mavzusida "Buni tanlaysanmi yoki bunimi?" uslubida qiziqarli challenge savol va ikkita javob varianti (emoji bilan) o'zbek tilida tuz.`,

                        "Sen yoshlar uchun qiziqarli interaktiv o'yinlar tuzuvchisan.",

                        schema

                      );

                      setAiChallengeLoading(false);

                      if (res) {

                        try {

                          const parsed = JSON.parse(res);

                          setChallenges(prev => [{

                            id: `CH-${Date.now()}`,

                            type: 'AI Maxsus Challenge',

                            question: parsed.question,

                            optionA: parsed.optionA,

                            optionB: parsed.optionB,

                            votesA: 1,

                            votesB: 1,

                            completedBy: []

                          }, ...prev]);

                          setAiChallengePrompt('');

                          showToast("Yangi AI Challenge muvaffaqiyatli qo'shildi!");

                          return;

                        } catch (e) {}

                      }

                      showToast("Challenge qo'shildi!");

                    }}

                    disabled={aiChallengeLoading}

                    className="bg-[#8B5CF6] hover:bg-[#7C3AED] px-6 py-3 rounded-xl font-semibold text-sm flex items-center gap-2">

                    <Sparkles size={16} />

                    <span>{aiChallengeLoading ? 'AI O\'ylamoqda...' : 'AI Bilan Yaratish'}</span>

                  </button>

                </div>

              </div>



              <div className="space-y-3">

                {challenges.map(ch => (

                  <div key={ch.id} className="bg-[#1D1729] p-4 rounded-xl border border-white/10 flex justify-between items-center">

                    <div>

                      <span className="text-xs text-[#8B5CF6] font-semibold">{ch.type}</span>

                      <div className="font-bold">{ch.question}</div>

                      <div className="text-xs text-[#A7A0B5] mt-1">{ch.optionA} ({ch.votesA}) vs {ch.optionB} ({ch.votesB})</div>

                    </div>

                    <button 

                      onClick={() => setChallenges(prev => prev.filter(c => c.id !== ch.id))}

                      className="text-red-400 hover:bg-red-500/10 p-2 rounded-lg">

                      <Trash2 size={18} />

                    </button>

                  </div>

                ))}

              </div>

            </div>

          )}



          {adminTab === 'ads' && (

            <div className="space-y-6">

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-violet-300">AI Creative Studio</p>
                <h2 className="mt-2 text-2xl font-bold">9:16 Reklama Bannerlari</h2>
                <p className="mt-1 text-sm text-[#A7A0B5]">Prompt yozing, AI orqali rasm yarating va bannerda sinab ko'ring.</p>
              </div>

              <div className="overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-br from-[#211832] via-[#171323] to-[#101018] p-5 shadow-[0_0_40px_rgba(139,92,246,0.1)] sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200">
                    <Sparkles size={19} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">AI Banner Generator</h3>
                    <p className="text-xs text-slate-400">Pollinations AI • 9:16 vertikal format</p>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-4">
                    <label className="block space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Reklama sarlavhasi</span>
                      <input
                        type="text"
                        value={newAdTitle}
                        onChange={event => setNewAdTitle(event.target.value)}
                        placeholder="Masalan: ANONI PRO — yangi imkoniyatlar"
                        maxLength={100}
                        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/15"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">AI rasm uchun prompt</span>
                      <textarea
                        rows={5}
                        value={newAdPrompt}
                        onChange={event => setNewAdPrompt(event.target.value)}
                        placeholder="Rasm qanday ko'rinishda bo'lishini batafsil yozing. Masalan: qora fonda binafsha neon yorug'lik, futuristik mobil ilova, premium kiber estetika, vertikal reklama banneri..."
                        maxLength={500}
                        className="w-full resize-y rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-relaxed text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/15"
                      />
                      <span className="block text-right text-[10px] text-slate-500">{newAdPrompt.length}/500</span>
                    </label>

                    <button
                      type="button"
                      onClick={handleGenerateAd}
                      disabled={isGeneratingAdImage || !newAdTitle.trim() || !newAdPrompt.trim()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 px-5 py-3.5 text-sm font-extrabold text-white shadow-[0_0_25px_rgba(139,92,246,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                      {isGeneratingAdImage ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          AI rasm yaratmoqda... ⏳
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          AI orqali Rasm va Reklamani Qo'shish
                        </>
                      )}
                    </button>
                  </div>

                  <div className="mx-auto w-full max-w-[220px]">
                    <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/80">9:16 Live Preview</p>
                    <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-cyan-300/20 bg-black/50 shadow-[0_0_30px_rgba(34,211,238,0.1)]">
                      {newAdPreviewImage ? (
                        <>
                          <img src={newAdPreviewImage} alt="AI yaratgan reklama banneri" className="absolute inset-0 h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent" />
                          <div className="absolute inset-x-3 bottom-4 text-center text-sm font-extrabold text-white drop-shadow-lg">
                            {newAdPreviewTitle || 'AI reklama banneringiz'}
                          </div>
                        </>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-400/10 text-violet-200">
                            {isGeneratingAdImage ? <span className="h-6 w-6 animate-spin rounded-full border-2 border-violet-200/30 border-t-violet-200" /> : <Sparkles size={21} />}
                          </div>
                          <p className="text-xs leading-relaxed text-slate-400">
                            {isGeneratingAdImage ? 'AI tasvir ustida ishlamoqda...' : 'Yaratilgan banner shu yerda ko‘rinadi'}
                          </p>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={!newAdPreviewImage || isGeneratingAdImage}
                      onClick={() => {
                        const previewAd = ads.find(ad => ad.imageUrl === newAdPreviewImage);
                        if (previewAd) {
                          setIsAdminMode(false);
                          triggerAdPopup(previewAd);
                        }
                      }}
                      className="mt-3 w-full rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2.5 text-xs font-bold text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Hozir Ekranda Sinash (3s)
                    </button>
                  </div>
                </div>
              </div>

              <h3 className="text-lg font-bold">Reklama ro'yxati va namoyish</h3>
              <div className="grid gap-4 md:grid-cols-2">

                {ads.map(ad => (

                  <div key={ad.id} className="bg-[#1D1729] p-4 rounded-2xl border border-white/10 flex gap-4 items-center">

                    <img src={ad.imageUrl} alt={ad.title} className="w-20 h-32 object-cover rounded-xl border border-white/10" />

                    <div className="flex-1 space-y-2">

                      <div className="font-bold">{ad.title}</div>

                      <div className="text-xs text-[#A7A0B5]">Ko'rishlar: {ad.views} marta</div>

                      <div className="flex gap-2 pt-2">

                        <button 

                          onClick={() => {

                            setIsAdminMode(false);

                            triggerAdPopup(ad);

                          }}

                          className="text-xs bg-[#8B5CF6] text-white px-3 py-1.5 rounded-lg">

                          Hozir Ekranda Sinash (3s)

                        </button>

                      </div>

                    </div>

                  </div>

                ))}

              </div>

            </div>

          )}



          {adminTab === 'ai_support' && (

            <div className="space-y-6">

              <h2 className="text-2xl font-bold">AI Support Ko'rsatmalarini Boshqarish</h2>

              <div className="bg-[#1D1729] p-6 rounded-2xl border border-white/10 space-y-4">

                <label className="text-xs text-[#A7A0B5] uppercase font-bold">Gemini AI Support uchun asosiy tizim ko'rsatmasi (System Prompt):</label>

                <textarea 

                  rows={4}

                  value={settings.aiSystemPrompt}

                  onChange={(e) => setSettings({ ...settings, aiSystemPrompt: e.target.value })}

                  className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-[#8B5CF6]"

                />

                <button

                  onClick={() => showToast("AI Support ko'rsatmalari yangilandi!")}

                  className="bg-[#22C55E] text-black font-bold px-6 py-2.5 rounded-xl text-sm">

                  Saqlash

                </button>

              </div>

            </div>

          )}



          {adminTab === 'settings' && (

            <div className="space-y-6">

              <h2 className="text-2xl font-bold">Iqtisodiy sozlamalar</h2>

              <div className="rounded-2xl border border-white/10 bg-[#1D1729] p-6 text-sm text-[#A7A0B5]">
                Hozircha boshqarish uchun qo'shimcha sozlamalar mavjud emas.
              </div>

            </div>

          )}

          {accountActionModal && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="account-action-title"
                className="w-full max-w-sm rounded-3xl border border-[#C8A66A]/25 bg-gradient-to-br from-[#211832] via-[#171323] to-[#100D18] p-6 shadow-[0_0_50px_rgba(200,166,106,0.12)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#C8A66A]">Hisob boshqaruvi</p>
                    <h2 id="account-action-title" className="mt-2 text-xl font-extrabold">
                      {accountActionModal.type === 'subscription' ? 'Obuna muddatini tanlang' : 'Blok muddatini tanlang'}
                    </h2>
                    <p className="mt-1 text-sm text-[#A7A0B5]">{accountActionModal.userName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAccountActionModal(null)}
                    aria-label="Oynani yopish"
                    className="rounded-xl border border-white/10 p-2 text-slate-300 transition hover:bg-white/10"
                  >
                    <X size={17} />
                  </button>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-2">
                  {(accountActionModal.type === 'subscription' ? SUBSCRIPTION_DURATIONS : BAN_DURATIONS).map(duration => (
                    <button
                      key={duration.label}
                      type="button"
                      onClick={() => applyAccountAction(accountActionModal.userId, accountActionModal.type, duration)}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                        accountActionModal.type === 'subscription'
                          ? 'border-[#C8A66A]/20 bg-[#C8A66A]/5 text-[#E5CF9B] hover:border-[#C8A66A]/50 hover:bg-[#C8A66A]/10'
                          : 'border-red-400/15 bg-red-500/5 text-red-200 hover:border-red-400/40 hover:bg-red-500/10'
                      }`}
                    >
                      <span>{duration.label}</span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                  {accountActionModal.type === 'ban' && users.find(user => user.id === accountActionModal.userId)?.ban && (
                    <button
                      type="button"
                      onClick={() => applyAccountAction(accountActionModal.userId, 'unban')}
                      className="mt-1 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-500/15"
                    >
                      Ban ni bekor qilish
                    </button>
                  )}
                </div>
              </section>
            </div>
          )}

        </main>

      </div>

    );

  }



  // ============================================================================

  // USER MOBILE APPLICATION VIEW
  // ============================================================================

  return (

    <div className="min-h-screen bg-[#0B0912] text-[#F8FAFC] font-sans selection:bg-[#8B5CF6] selection:text-white pb-24">

      {/* Toast Notification */}

      {toast && (

        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm px-4 py-3 rounded-2xl font-medium shadow-2xl border flex items-center gap-2.5 animate-in fade-in slide-in-from-top-5 ${toast.type === 'error' ? 'bg-red-950/95 border-red-500 text-red-200' : 'bg-[#1D1729]/95 border-[#8B5CF6] text-white'}`}>

          <Sparkles size={18} className={toast.type === 'error' ? 'text-red-400' : 'text-[#8B5CF6]'} />

          <span className="text-xs leading-snug">{toast.message}</span>

        </div>

      )}
      {dailyRewardModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-reward-title"
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-amber-300/30 bg-gradient-to-br from-[#2B2115] via-[#1D1729] to-[#100D18] p-7 text-center shadow-[0_0_60px_rgba(251,191,36,0.2)]"
          >
            <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-amber-400/15 blur-3xl" />
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-400/10 text-4xl shadow-[0_0_25px_rgba(251,191,36,0.15)]">
              🎁
            </div>
            <h2 id="daily-reward-title" className="relative mt-5 text-xl font-extrabold text-amber-100">
              Tabriklaymiz!
            </h2>
            <p className="relative mt-2 text-sm leading-relaxed text-white">
              Bugungi bonusingiz: <span className="font-extrabold text-amber-300">+{dailyRewardModal.coins} Coin</span>
            </p>
            <p className="relative mt-1 text-xs text-amber-100/70">
              {dailyRewardModal.streakDay}-kunlik kirish bonusi
            </p>
            {dailyRewardModal.streakDay === 1 && (
              <p className="relative mt-4 rounded-xl border border-amber-300/15 bg-black/20 p-3 text-xs leading-relaxed text-amber-100/90">
                Ajoyib boshlanish! Har kuni kirib ko'proq Coin yig'ing va peshqadam bo'ling!
              </p>
            )}
            <button
              type="button"
              onClick={() => setDailyRewardModal(null)}
              className="relative mt-6 w-full rounded-xl bg-gradient-to-r from-amber-300 to-yellow-500 py-3 text-sm font-extrabold text-[#21170B] shadow-lg shadow-amber-500/20 transition hover:brightness-110"
            >
              Bonusni qabul qilish
            </button>
          </section>
        </div>
      )}


      {/* 9:16 Fullscreen Ad Modal with 3s Timer */}

      {activeAdPopup && (

        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">

          <div className="relative w-full max-w-xs aspect-[9/16] rounded-3xl overflow-hidden border-2 border-[#8B5CF6] shadow-[0_0_50px_rgba(139,92,246,0.5)] bg-[#15111F] flex flex-col justify-end">

            <img src={activeAdPopup.imageUrl} alt="Ad" className="absolute inset-0 w-full h-full object-cover" />

            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>

            

            {/* Top Right 3s Timer or Close Button */}

            <div className="absolute top-4 right-4 z-10">

              {adTimer > 0 ? (

                <div className="bg-black/70 text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/20">

                  {adTimer} s...

                </div>

              ) : (

                <button 

                  onClick={() => setActiveAdPopup(null)}

                  className="w-9 h-9 rounded-full bg-black/80 hover:bg-red-600 text-white flex items-center justify-center border border-white/30 transition-all">

                  <X size={18} />

                </button>

              )}

            </div>



            <div className="relative z-10 p-6 text-center space-y-3">

              <span className="text-[10px] uppercase tracking-widest bg-[#8B5CF6] px-2.5 py-1 rounded-full font-bold">Reklama</span>

              <h3 className="text-xl font-extrabold text-white">{activeAdPopup.title}</h3>

              <button 

                onClick={() => {

                  setActiveAdPopup(null);

                  setSubView('pro');

                }}

                className="w-full bg-white text-black font-bold py-3 rounded-xl text-sm">

                Batafsil ko'rish

              </button>

            </div>

          </div>

        </div>

      )}


      {coinPurchaseCoins !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setCoinPurchaseCoins(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="coin-purchase-title"
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-violet-300/20 bg-gradient-to-br from-[#211832] via-[#15111F] to-[#100D18] p-5 shadow-[0_0_60px_rgba(139,92,246,0.22)] animate-in zoom-in-95 duration-200 sm:p-6"
            onClick={event => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />
            <div className="relative">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-300/25">
                    <MessageSquare size={21} />
                  </div>
                  <div>
                    <h2 id="coin-purchase-title" className="text-lg font-extrabold text-white">
                      Adminga yozish uchun shablon
                    </h2>
                    <p className="mt-0.5 text-xs text-[#A7A0B5]">Tanlangan paket: {coinPurchaseCoins} Coin</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Oynani yopish"
                  onClick={() => setCoinPurchaseCoins(null)}
                  className="rounded-xl p-2 text-[#A7A0B5] transition hover:bg-white/10 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-sm leading-relaxed text-slate-200">{coinPurchaseMessage}</p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (!navigator.clipboard?.writeText) {
                        throw new Error('Clipboard API is unavailable in this browser context.');
                      }
                      await navigator.clipboard.writeText(coinPurchaseMessage);
                      showToast('Nusxa olindi!');
                    } catch (error) {
                      console.error('Could not copy the coin purchase message:', error);
                      showToast("Nusxa olib bo'lmadi. Brauzer ruxsatlarini tekshiring.", 'error');
                    }
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-violet-300/25 bg-violet-400/10 px-3 py-2 text-xs font-bold text-violet-200 transition hover:bg-violet-400/20"
                >
                  <Copy size={14} />
                  Nusxa olish
                </button>
              </div>

              <a
                href="https://t.me/SHAHBOZBE0770"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-blue-950/30 transition hover:brightness-110"
              >
                <Send size={17} />
                Telegram orqali adminga yozish
              </a>
              <button
                type="button"
                onClick={() => setCoinPurchaseCoins(null)}
                className="mt-2 w-full rounded-xl px-4 py-2.5 text-xs font-semibold text-[#A7A0B5] transition hover:bg-white/5 hover:text-white"
              >
                Yopish
              </button>
            </div>
          </section>
        </div>
      )}


      {testShareModal && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="test-share-title"
            className="w-full max-w-sm rounded-3xl border border-violet-300/20 bg-gradient-to-br from-[#211832] via-[#171323] to-[#100D18] p-6 shadow-[0_0_50px_rgba(139,92,246,0.2)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300">Test tayyor</p>
                <h2 id="test-share-title" className="mt-2 text-xl font-extrabold">Do‘stlarga yuboring</h2>
                <p className="mt-2 text-sm text-slate-300">{testShareModal.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setTestShareModal(null)}
                aria-label="Oynani yopish"
                className="rounded-xl border border-white/10 p-2 text-slate-300 transition hover:bg-white/10"
              >
                <X size={17} />
              </button>
            </div>
            <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-100">
              Eslatma: hozircha testning o‘zi faqat shu qurilmada ko‘rinadi. Ulashish ANONI saytiga taklif yuboradi; testni boshqa qurilmada ochish uchun testlarni bulutga saqlash funksiyasi kerak.
            </p>
            <button
              type="button"
              onClick={handleShareCreatedTest}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-violet-950/30 transition hover:brightness-110"
            >
              <Share2 size={17} />
              Natijani yuborish
            </button>
            <button
              type="button"
              onClick={handleCopyTestInvite}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/10"
            >
              <Copy size={15} />
              Taklif matnini nusxalash
            </button>
          </section>
        </div>
      )}

      {/* Click and Payme Payment Modal */}

      {paymentModal && (

        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">

          <div className="bg-[#1D1729] border border-white/15 rounded-3xl max-w-sm w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">

            <div className="flex justify-between items-center border-b border-white/10 pb-3">

                <div className="flex items-center gap-2">
                  <CreditCard className="text-amber-300" size={20} />
                  <span className="font-bold text-sm">To'lov xizmati</span>
                </div>

              <button onClick={() => setPaymentModal(null)} className="text-[#A7A0B5] hover:text-white">

                <X size={20} />

              </button>

            </div>



            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4">
              <p className="text-sm font-bold text-amber-200">Haqiqiy to'lov provayderi ulanmagan</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Karta ma'lumotlarini bu ilovaga kiritmang. {paymentModal.title} xaridi hozircha o'chirilgan; to'lov integratsiyasi tasdiqlangach bu oynadan foydalanish mumkin bo'ladi.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPaymentModal(null)}
              className="w-full rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Yopish
            </button>

          </div>

        </div>

      )}

      {/* Mobile Container */}

      <div className="max-w-md mx-auto relative min-h-screen shadow-2xl bg-[#0B0912] sm:border-x sm:border-white/10 overflow-hidden">

        {/* Top Ambient Neon Glow */}

        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-36 bg-[#8B5CF6]/20 blur-[90px] pointer-events-none"></div>



        {/* Header */}

        <header className="px-5 py-4 flex justify-between items-center relative z-10 border-b border-white/5 bg-[#0B0912]/80 backdrop-blur-md sticky top-0">

          <div 

            onClick={() => { setSubView(null); setActiveTab('bosh_sahifa'); }}

            className="flex items-center gap-2 cursor-pointer">

            <h1 className="text-2xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#C4B5FD] to-[#8B5CF6] drop-shadow-[0_0_12px_rgba(139,92,246,0.5)]">

              ANONI

            </h1>

            {currentUser.isPro && (

              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-gradient-to-r from-[#8B5CF6] to-pink-500 text-white">

                PRO

              </span>

            )}

          </div>



          <div className="flex items-center gap-2">

            <button
              onClick={() => { setSubView(null); setActiveTab('profil'); }}
              className="flex max-w-[125px] items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-2 text-left transition hover:bg-white/10"
              aria-label="Profilni ochish"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-200">{currentUserInitials}</span>
              <span className="truncate text-[10px] font-semibold text-slate-200">{currentUser.name}</span>
            </button>

            <button

              onClick={() => setSubView('shop')}

              className="flex items-center gap-1.5 bg-[#1D1729] hover:bg-[#261E36] px-3 py-1.5 rounded-full border border-[#FBBF24]/30 transition-all">

              <span className="w-4 h-4 rounded-full bg-[#FBBF24] text-black font-extrabold text-[10px] flex items-center justify-center">C</span>

              <span className="font-bold text-xs text-[#FBBF24]">{currentUser.coins}</span>

            </button>

            {authUser?.app_metadata?.role === 'admin' && (
              <button
                onClick={() => setIsAdminMode(true)}
                title="Admin Panelga O'tish"
                className="flex items-center gap-1 bg-[#8B5CF6]/15 hover:bg-[#8B5CF6]/30 text-[#C4B5FD] border border-[#8B5CF6]/40 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all"
              >
                <Shield size={14} />
                <span>Admin</span>
              </button>
            )}

          </div>

        </header>



        {/* Main Content Body */}

        <main className="px-5 py-6 relative z-10">

          {/* =================================================================

              SUBVIEWS (Test yaratish, Test yechish, Do'kon, PRO, Support)

          ================================================================= */}

          {subView === 'create_test' && (

            <div className="space-y-5 animate-in fade-in duration-300">

              <div className="flex items-center justify-between">

                <button onClick={() => setSubView(null)} className="flex items-center gap-1 text-sm text-[#A7A0B5] hover:text-white">

                  <ArrowLeft size={18} /> Orqaga

                </button>

                <span className="text-xs text-[#C4B5FD] font-semibold">

                  Savollar: {newTestQuestions.length} / {maxQuestionsLimit}

                </span>

              </div>



              <h2 className="text-xl font-bold">Yangi Test Yaratish</h2>

              {reachedDailyTestCreationLimit ? (
                <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-200">
                  Kunlik test yaratish limitiga yetdingiz (2/2). Ertagacha kuting!
                </div>
              ) : (
                <p className="text-xs text-[#A7A0B5]">
                  Bugungi test yaratish: {dailyTestCreationCount}/2
                </p>
              )}



              <div className="space-y-3 bg-[#1D1729] p-4 rounded-2xl border border-white/10">

                <label className="text-xs text-[#A7A0B5]">Test sarlavhasi</label>

                <input 

                  type="text"

                  value={newTestTitle}

                  onChange={(e) => setNewTestTitle(e.target.value)}

                  placeholder="Masalan: Meni qanchalik yaxshi bilasan?"

                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#8B5CF6]"

                />



                <div className="flex items-center justify-between pt-2">

                  <div>

                    <div className="text-sm font-medium">Anonim javoblar</div>

                    <div className="text-[11px] text-[#A7A0B5]">Yoqilsa, ishtirokchilar ismi yashirin bo'ladi</div>

                  </div>

                  <button 

                    onClick={() => setNewTestAnon(!newTestAnon)}

                    className={`w-12 h-6 rounded-full transition-colors p-1 ${newTestAnon ? 'bg-[#8B5CF6]' : 'bg-white/10'}`}>

                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${newTestAnon ? 'translate-x-6' : ''}`} />

                  </button>

                </div>

              </div>



              {/* AI Question Generator Box */}

              <div className="bg-gradient-to-br from-[#8B5CF6]/20 to-[#1D1729] p-4 rounded-2xl border border-[#8B5CF6]/40 space-y-3">

                <div className="flex justify-between items-center">

                  <div className="flex items-center gap-2 font-bold text-sm text-[#C4B5FD]">

                    <Sparkles size={16} />

                    <span>Gemini AI Yordamchi</span>

                  </div>

                  <span className="text-[10px] bg-black/40 px-2 py-0.5 rounded text-[#A7A0B5]">

                    {currentUser.isPro ? 'PRO: Haftasiga 20 ta' : currentUser.aiFreeUsedThisWeek ? 'Limit tugagan (1/1)' : 'Bepul: Haftada 1 marta'}

                  </span>

                </div>

                <div className="flex gap-2">

                  <input 

                    type="text"

                    value={aiTopic}

                    onChange={(e) => setAiTopic(e.target.value)}

                    placeholder="Mavzu yozing (masalan: Qiziqishlarim, Kino)..."

                    className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#8B5CF6]"

                  />

                  <button 

                    onClick={handleGenerateAIQuestions}

                    disabled={aiLoading}

                    className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap">

                    {aiLoading ? 'Tuzilmoqda...' : 'AI Savol Tuzsin'}

                  </button>

                </div>

              </div>



              {/* Questions List */}

              <div className="space-y-4">

                {newTestQuestions.map((qItem, qIdx) => (

                  <div key={qIdx} className="bg-[#1D1729] p-4 rounded-2xl border border-white/10 space-y-3">

                    <div className="flex justify-between items-center">

                      <span className="text-xs font-bold text-[#8B5CF6]">{qIdx + 1}-SAVOL</span>

                      {newTestQuestions.length > 1 && (

                        <button 

                          onClick={() => setNewTestQuestions(prev => prev.filter((_, i) => i !== qIdx))}

                          className="text-red-400 hover:text-red-300">

                          <Trash2 size={16} />

                        </button>

                      )}

                    </div>

                    <input 

                      type="text"

                      value={qItem.q}

                      onChange={(e) => {

                        const updated = [...newTestQuestions];

                        updated[qIdx].q = e.target.value;

                        setNewTestQuestions(updated);

                      }}

                      placeholder="Savol matnini yozing..."

                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm"

                    />

                    <div className="space-y-2">

                      <div className="text-[11px] text-[#A7A0B5]">To'g'ri javob ustiga bosing (Yashil bo'ladi):</div>

                      {qItem.options.map((opt, oIdx) => (

                        <div key={oIdx} className="flex items-center gap-2">

                          <button

                            type="button"

                            onClick={() => {

                              const updated = [...newTestQuestions];

                              updated[qIdx].correct = oIdx;

                              setNewTestQuestions(updated);

                            }}

                            className={`w-7 h-7 rounded-lg flex items-center justify-center border text-xs font-bold transition-all ${qItem.correct === oIdx ? 'bg-[#22C55E] border-[#22C55E] text-black' : 'bg-black/40 border-white/15 text-[#A7A0B5]'}`}>

                            {qItem.correct === oIdx ? <Check size={14} /> : oIdx + 1}

                          </button>

                          <input 

                            type="text"

                            value={opt}

                            onChange={(e) => {

                              const updated = [...newTestQuestions];

                              updated[qIdx].options[oIdx] = e.target.value;

                              setNewTestQuestions(updated);

                            }}

                            placeholder={`${oIdx + 1}-variant`}

                            className={`flex-1 bg-black/30 border rounded-xl px-3 py-2 text-xs ${qItem.correct === oIdx ? 'border-[#22C55E]/60 text-white' : 'border-white/10 text-[#A7A0B5]'}`}

                          />

                        </div>

                      ))}

                    </div>

                  </div>

                ))}

              </div>



              <div className="flex flex-col gap-3">

                <button 

                  onClick={handleAddQuestion}

                  className="w-full py-3 rounded-xl border border-dashed border-[#8B5CF6]/50 text-[#C4B5FD] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#8B5CF6]/10">

                  <Plus size={18} /> Yangi savol qo'shish

                </button>

                <button 

                  onClick={handlePublishTest}
                  disabled={reachedDailyTestCreationLimit}

                  className="w-full py-4 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] text-white font-bold shadow-[0_0_20px_rgba(139,92,246,0.5)] disabled:cursor-not-allowed disabled:opacity-50">

                  Testni Faollashtirish (30 soat)

                </button>

              </div>

            </div>

          )}



          {subView === 'solve_test' && activeTestToSolve && (

            <div className="space-y-6 animate-in fade-in duration-300">

              <button onClick={() => { setSubView(null); setTestStartedAt(null); }} className="flex items-center gap-1 text-sm text-[#A7A0B5] hover:text-white">

                <ArrowLeft size={18} /> Testdan chiqish

              </button>



              {!testResult ? (

                <div className="bg-[#1D1729] p-6 rounded-3xl border border-white/10 space-y-6">

                  <div className="flex justify-between items-center text-xs text-[#A7A0B5]">

                    <span>Muallif: <strong className="text-white">{activeTestToSolve.creatorId === currentUser.id ? currentUser.name : activeTestToSolve.creatorName}</strong></span>

                    <span className="bg-[#8B5CF6]/20 text-[#C4B5FD] px-2.5 py-1 rounded-full font-bold">
                      {currentQIndex + 1} / {activeTestToSolve.questions.length}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 font-mono text-white/80">
                      <Clock size={12} /> {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
                    </span>

                  </div>



                  <h3 className="text-xl font-bold leading-snug">

                    {activeTestToSolve.questions[currentQIndex].q}

                  </h3>



                  <div className="space-y-3">

                    {activeTestToSolve.questions[currentQIndex].options.map((opt, idx) => (

                      <button

                        key={idx}

                        onClick={() => handleSelectAnswer(idx)}

                        className="w-full text-left p-4 rounded-2xl bg-black/40 hover:bg-[#8B5CF6]/20 border border-white/10 hover:border-[#8B5CF6] transition-all font-medium text-sm flex justify-between items-center group">

                        <span>{opt}</span>

                        <ChevronRight size={16} className="text-[#A7A0B5] group-hover:text-[#8B5CF6]" />

                      </button>

                    ))}

                  </div>

                </div>

              ) : (

                <div role="status" aria-live="polite" className="mx-auto w-full max-w-lg bg-gradient-to-b from-[#8B5CF6]/20 to-[#1D1729] p-6 rounded-3xl border border-[#8B5CF6]/40 text-center space-y-5">

                  <div className="w-20 h-20 rounded-full bg-[#8B5CF6]/20 border-2 border-[#8B5CF6] mx-auto flex items-center justify-center text-2xl font-extrabold text-white shadow-[0_0_25px_rgba(139,92,246,0.5)]">

                    {testResult.percent}%

                  </div>

                  <div>

                    <h3 className="text-2xl font-extrabold">Natijangiz tayyor!</h3>

                    <p className="text-sm text-[#A7A0B5] mt-1">

                      Siz {testResult.total} ta savoldan {testResult.score} tasiga to'g'ri javob berdingiz.

                    </p>

                  </div>

                  {testResult.isSpam ? (
                    <div role="alert" className="rounded-2xl border border-red-400/40 bg-red-500/15 p-4 text-sm font-bold leading-relaxed text-red-300">
                      Siz savollarni o'qimasdan juda tez belgiladingiz. Jarima: -30 Coin va -30 XP!
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300">
                      Mukofot: +{testResult.rewardXp} XP va +{testResult.rewardCoins} Coin
                    </div>
                  )}

                  <div className="flex gap-3">

                    <button 

                      onClick={() => showToast("Natija kartasi nusxalandi! Do'stlaringizga yuboring.")}

                      className="flex-1 bg-[#8B5CF6] py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">

                      <Share2 size={16} /> Ulashish

                    </button>

                    <button 

                      onClick={() => { setSubView(null); setActiveTab('testlar'); }}

                      className="flex-1 bg-white/10 py-3 rounded-xl font-semibold text-sm">

                      Yopish

                    </button>

                  </div>

                </div>

              )}

            </div>

          )}

          {subView === 'solve_test' && !activeTestToSolve && (
            <section role="alert" className="mx-auto max-w-lg rounded-3xl border border-amber-400/25 bg-[#1D1729] p-6 text-center shadow-[0_0_30px_rgba(251,191,36,0.08)]">
              <h2 className="text-xl font-extrabold">Test natijasi ko'rsatilmayapti</h2>
              <p className="mt-2 text-sm text-[#A7A0B5]">
                Test ma'lumotlari topilmadi. Testlar ro'yxatiga qaytib, qayta urinib ko'ring.
              </p>
              <button
                onClick={() => { setSubView(null); setActiveTab('testlar'); }}
                className="mt-5 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-500"
              >
                Testlarga qaytish
              </button>
            </section>
          )}


          {subView === 'test_details' && selectedTestDetails && (

            <div className="space-y-5 animate-in fade-in duration-300">

              <button onClick={() => setSubView(null)} className="flex items-center gap-1 text-sm text-[#A7A0B5]">

                <ArrowLeft size={18} /> Orqaga

              </button>

              <div className="bg-[#1D1729] p-5 rounded-2xl border border-white/10 space-y-3">

                <div className="flex justify-between items-start">

                  <h2 className="text-lg font-bold">{selectedTestDetails.title}</h2>

                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">30 soat faol</span>

                </div>

                <div className="text-xs text-[#A7A0B5]">

                  Havola: <span className="text-[#C4B5FD] underline">anoni.uz/t/{selectedTestDetails.id}</span>

                </div>

                <button 

                  onClick={() => showToast(`anoni.uz/t/${selectedTestDetails.id} havolasi nusxalandi!`)}

                  className="w-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/50 text-[#C4B5FD] py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2">

                  <Share2 size={14} /> Havolani Do'stlarga Ulashish

                </button>

              </div>



              <h3 className="font-bold text-sm text-[#A7A0B5] uppercase">Ishtirokchilar Natijalari ({selectedTestDetails.attempts.length})</h3>

              {selectedTestDetails.attempts.length === 0 ? (

                <div className="bg-[#1D1729] p-6 rounded-2xl border border-white/5 text-center text-sm text-[#A7A0B5]">

                  Hali hech kim javob bermadi. Havolani do'stlaringizga yuboring!

                </div>

              ) : (

                <div className="space-y-2.5">

                  {selectedTestDetails.attempts.map((att, i) => (

                    <div key={i} className="bg-[#1D1729] p-4 rounded-xl border border-white/10 flex justify-between items-center">

                      <div>

                        <div className="font-bold text-sm">{selectedTestDetails.isAnonymous ? "Anonim Ishtirokchi 🕵️" : att.userName}</div>

                        <div className="text-xs text-[#A7A0B5]">{att.date}</div>

                      </div>

                      <div className="text-right">

                        <div className="font-extrabold text-[#22C55E]">{att.percent}%</div>

                        <div className="text-[11px] text-[#A7A0B5]">{att.score}/{att.total} to'g'ri</div>

                      </div>

                    </div>

                  ))}

                </div>

              )}

            </div>

          )}



          {subView === 'shop' && (

            <div className="space-y-6 animate-in fade-in duration-300">

              <div className="flex items-center justify-between">

                <button onClick={() => setSubView(null)} className="flex items-center gap-1 text-sm text-[#A7A0B5]">

                  <ArrowLeft size={18} /> Orqaga

                </button>

                <span className="text-xs font-bold text-[#FBBF24]">Balans: {currentUser.coins} Coin</span>

              </div>



              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300/25 to-violet-500/20 text-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.16)]">
                  <ShoppingBag size={21} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold">ANONI COIN Do'koni</h2>
                  <p className="text-xs text-[#A7A0B5]">Maxsus statuslar — profilingizga o'zgacha jilo bering</p>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-[#FBBF24]/40 bg-gradient-to-br from-amber-500/15 via-[#1D1729] to-violet-500/10 p-4 shadow-[0_0_28px_rgba(251,191,36,0.08)]">
                <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-amber-300/10 blur-2xl" />
                <div className="relative space-y-3">
                  <div className="flex items-center gap-2">
                    <CreditCard size={17} className="text-amber-300" />
                    <span className="font-extrabold text-sm text-[#FBBF24]">Click & Payme orqali Coin Xarid Qilish</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { coins: 100, amountUZS: 15000 },
                      { coins: 300, amountUZS: 40000 },
                      { coins: 700, amountUZS: 80000 }
                    ].map(pack => (
                      <button
                        key={pack.coins}
                        onClick={() => setCoinPurchaseCoins(pack.coins)}
                        className="rounded-xl border border-amber-300/25 bg-black/35 p-2.5 text-center transition-all hover:-translate-y-0.5 hover:border-amber-300/60 hover:bg-amber-400/10 hover:shadow-[0_0_18px_rgba(251,191,36,0.12)]">
                        <div className="font-extrabold text-sm text-[#FBBF24]">+{pack.coins} Coin</div>
                        <div className="mt-1 text-[10px] font-semibold text-white">{pack.amountUZS.toLocaleString('uz-UZ')} so'm</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {SHOP_ITEMS.map(item => {
                  const owned = currentUser.ownedItems.includes(item.id);
                  const equipped = currentUser.equipped.status === item.id;
                  const Icon = item.icon;
                  const SecondaryIcon = item.secondaryIcon;

                  return (
                    <div key={item.id} className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-r from-[#1D1729] via-[#1D1729] to-[#15111F] p-3.5 transition-all hover:-translate-y-0.5 hover:border-white/20 ${equipped ? 'border-amber-300/40 shadow-[0_0_20px_rgba(251,191,36,0.08)]' : 'border-white/10'}`}>
                      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/[0.03] blur-2xl transition-all group-hover:bg-violet-400/[0.08]" />
                      <div className="relative flex items-center gap-3">
                        <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${item.glowClass} shadow-[0_0_20px_rgba(255,255,255,0.04)]`}>
                          <Icon size={23} className={`${item.iconClass} ${item.effectClass}`} />
                          {SecondaryIcon && <SecondaryIcon size={12} className="absolute -right-1 -top-1 text-amber-200 drop-shadow-[0_0_7px_rgba(251,191,36,0.9)] animate-pulse" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-sm text-white">{item.name}</span>
                            {(item.id === 'status_vip_check' || item.id === 'status_gold_check') && (
                              <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide ${item.id === 'status_gold_check' ? 'bg-amber-300/15 text-amber-200' : 'bg-white/10 text-slate-100'}`}>
                                {item.id === 'status_gold_check' ? 'ELITE' : 'VIP'}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-[#A7A0B5]">{item.description}</p>
                          <div className="mt-1 text-[10px] font-extrabold text-amber-300">{item.price.toLocaleString('uz-UZ')} Coin</div>
                        </div>
                        <button
                          disabled={equipped}
                          onClick={() => {
                            if (owned) {
                              void equipShopItem(item);
                              return;
                            }

                            if (currentUser.coins < item.price) {
                              showToast("Coin yetarli emas! Challenge bajaring yoki Click & Payme orqali xarid qiling.", "error");
                              return;
                            }

                            void purchaseShopItem(item);
                          }}
                          className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-extrabold transition-all ${equipped ? 'cursor-default bg-amber-300/15 text-amber-200' : owned ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25' : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_4px_16px_rgba(139,92,246,0.2)] hover:brightness-110'}`}>
                          {equipped ? 'Faol' : owned ? "O'rnatish" : 'Sotib olish'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

          )}



          {subView === 'pro' && (

            <div className="space-y-6 animate-in fade-in duration-300">

              <button onClick={() => setSubView(null)} className="flex items-center gap-1 text-sm text-[#A7A0B5]">

                <ArrowLeft size={18} /> Orqaga

              </button>



              <div className="bg-gradient-to-b from-[#8B5CF6]/30 to-[#1D1729] p-6 rounded-3xl border border-[#8B5CF6] text-center space-y-4 shadow-[0_0_30px_rgba(139,92,246,0.25)]">

                <span className="px-3 py-1 rounded-full bg-[#8B5CF6] text-white text-xs font-extrabold uppercase">ANONI PRO</span>

                <h2 className="text-3xl font-extrabold">$2.50 <span className="text-sm font-normal text-[#A7A0B5]">/ oyiga</span></h2>

                <p className="text-xs text-[#A7A0B5]">Yillik obuna yo'q, faqat shaffof oylik obuna.</p>



                <div className="text-left space-y-2.5 bg-black/30 p-4 rounded-2xl border border-white/10 text-sm">

                  <div className="flex items-center gap-2"><Check size={16} className="text-[#22C55E]" /> Bitta testda 30 tagacha savol tuzish</div>

                  <div className="flex items-center gap-2"><Check size={16} className="text-[#22C55E]" /> AI Yordamchidan haftasiga 20 marta foydalanish</div>

                  <div className="flex items-center gap-2"><Check size={16} className="text-[#22C55E]" /> Profilni cheklovsiz bezatish va VIP ramka</div>

                  <div className="flex items-center gap-2"><Check size={16} className="text-[#22C55E]" /> 9-darajaga (Qizil) o'tish talabini bajarish</div>

                </div>



                <button 

                  onClick={() => setPaymentModal({ title: 'ANONI PRO — 1 Oylik Obuna', amountUSD: settings.proPriceUSD, type: 'PRO' })}

                  className="w-full bg-gradient-to-r from-[#8B5CF6] to-pink-500 py-4 rounded-xl font-extrabold text-sm shadow-lg">

                  Click Orqali Xarid Qilish ($2.50)

                </button>

              </div>

            </div>

          )}



          {subView === 'support' && (

            <div className="space-y-4 animate-in fade-in duration-300">

              <div className="flex items-center justify-between">

                <button onClick={() => setSubView(null)} className="flex items-center gap-1 text-sm text-[#A7A0B5]">

                  <ArrowLeft size={18} /> Orqaga

                </button>

                <span className="text-xs bg-[#22C55E]/20 text-[#22C55E] px-2.5 py-0.5 rounded-full font-semibold">AI Support Online</span>

              </div>



              <div className="bg-[#1D1729] rounded-3xl border border-white/10 h-[420px] flex flex-col justify-between p-4">

                <div className="space-y-3 overflow-y-auto pr-1">

                  {(tickets.find(t => t.userId === currentUser.id)?.messages || []).map((m, idx) => (

                    <div key={idx} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>

                      <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${m.sender === 'user' ? 'bg-[#8B5CF6] text-white rounded-br-none' : 'bg-black/50 border border-white/10 text-[#F8FAFC] rounded-bl-none'}`}>

                        {m.text}

                      </div>

                      <span className="text-[10px] text-[#A7A0B5] mt-1">{m.time}</span>

                    </div>

                  ))}

                  {aiSupportTyping && (

                    <div className="text-xs text-[#C4B5FD] animate-pulse">ANONI AI yozmoqda...</div>

                  )}

                </div>



                <div className="flex gap-2 pt-3 border-t border-white/10">

                  <input 

                    type="text"

                    value={supportInput}

                    onChange={(e) => setSupportInput(e.target.value)}

                    onKeyDown={(e) => e.key === 'Enter' && handleSendSupportMessage()}

                    placeholder="Savolingizni yozing..."

                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-[#8B5CF6]"

                  />

                  <button 

                    onClick={handleSendSupportMessage}

                    className="bg-[#8B5CF6] px-4 rounded-xl flex items-center justify-center">

                    <Send size={16} />

                  </button>

                </div>

              </div>

            </div>

          )}



          {/* =================================================================

              MAIN 5 TABS (When subView === null)

          ================================================================= */}

          {!subView && activeTab === 'bosh_sahifa' && (

            <div className="flex flex-col gap-5 animate-in fade-in duration-300">

              <section className="bg-[#1D1729] rounded-3xl p-5 border border-white/10 flex flex-col gap-4">

                  <div className="flex items-center justify-between">

                    <div className="flex items-center gap-3">

                      {currentUser.avatar ? (
                        <img src={currentUser.avatar} alt={`${currentUser.name} avatari`} className={`w-12 h-12 rounded-full border-2 object-cover ${currentUser.equipped.frame}`} />
                      ) : (
                        <div className={`flex h-12 w-12 items-center justify-center rounded-full border-2 bg-violet-500/15 text-sm font-bold text-violet-200 ${currentUser.equipped.frame}`}>{currentUserInitials}</div>
                      )}

                      <div>

                        <div className={`font-bold text-base ${currentUser.equipped.nameColor} ${currentUser.equipped.font}`}>

                          {currentUser.name}

                        </div>
                        {currentUser.isPro && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#C8A66A]/30 bg-[#C8A66A]/10 px-2 py-0.5 text-[9px] font-extrabold tracking-wider text-[#C8A66A]">
                            <Crown size={10} /> PRO OBUNA
                          </div>
                        )}

                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#A7A0B5]">
                          <span>ID: {registeredProfile.publicId}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyPublicId(registeredProfile.publicId)}
                            aria-label="Foydalanuvchi ID sini nusxalash"
                            className="rounded p-0.5 text-violet-300 transition hover:bg-white/10 hover:text-white"
                          >
                            <Copy size={12} />
                          </button>
                        </div>

                      </div>

                    </div>

                    <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full ${userLevel.color === 'red' ? 'bg-red-500/20 text-red-400' : userLevel.color === 'green' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>

                      {userLevel.level}-DARAJA

                    </span>

                  </div>



                  {/* XP Progress Bar */}

                  <div className="space-y-1">

                    <div className="flex justify-between text-[11px] text-[#A7A0B5]">

                      <span>Joriy XP: <strong className="text-white">{currentUser.xp}</strong></span>

                      <span>Keyingi daraja: {userLevel.nextXp} XP</span>

                    </div>

                    <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden">

                      <div 

                        className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#C4B5FD] transition-all duration-500"

                        style={{ width: `${Math.min(100, Math.round((currentUser.xp / userLevel.nextXp) * 100))}%` }}

                      />

                    </div>

                  </div>

              </section>



              {/* Main 3 Feature Cards */}

              <div className="space-y-3">

                <div 

                  onClick={() => setActiveTab('testlar')}

                  className="group bg-[#1D1729] border border-white/10 rounded-2xl p-5 flex items-center justify-between cursor-pointer hover:-translate-y-0.5 hover:border-[#8B5CF6] transition-all">

                  <div className="space-y-1">

                    <h3 className="font-bold text-white flex items-center gap-2">

                      <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6] shadow-[0_0_8px_#8B5CF6]"></span>

                      TESTLAR ({tests.length})

                    </h3>

                    <p className="text-xs text-[#A7A0B5]">O'z testingizni yarating yoki do'stlarnikini yeching</p>

                  </div>

                  <ChevronRight className="text-[#A7A0B5] group-hover:text-[#8B5CF6]" />

                </div>



                <div 

                  onClick={() => setActiveTab('reyting')}

                  className="group bg-[#1D1729] border border-white/10 rounded-2xl p-5 flex items-center justify-between cursor-pointer hover:-translate-y-0.5 hover:border-[#FBBF24] transition-all">

                  <div className="space-y-1">

                    <h3 className="font-bold text-white flex items-center gap-2">

                      <span className="w-2.5 h-2.5 rounded-full bg-[#FBBF24] shadow-[0_0_8px_#FBBF24]"></span>

                      REYTING & 11-LVL SOVG'A

                    </h3>

                    <p className="text-xs text-[#A7A0B5]">Eng yuqori XP to'plaganlar va maxsus sovrin</p>

                  </div>

                  <ChevronRight className="text-[#A7A0B5] group-hover:text-[#FBBF24]" />

                </div>



                <div 

                  onClick={() => setActiveTab('challenge')}

                  className="group bg-[#1D1729] border border-white/10 rounded-2xl p-5 flex items-center justify-between cursor-pointer hover:-translate-y-0.5 hover:border-[#22C55E] transition-all">

                  <div className="space-y-1">

                    <h3 className="font-bold text-white flex items-center gap-2">

                      <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E] shadow-[0_0_8px_#22C55E]"></span>

                      KUNLIK CHALLENGE

                    </h3>

                    <p className="text-xs text-[#A7A0B5]">Har kuni +15 XP va +8 ANONI COIN yutib oling</p>

                  </div>

                  <ChevronRight className="text-[#A7A0B5] group-hover:text-[#22C55E]" />

                </div>

              </div>



              {/* Quick Actions: Shop, PRO, Support */}

              <div className="grid grid-cols-3 gap-2.5">

                <button 

                  onClick={() => setSubView('shop')}

                  className="bg-[#1D1729] hover:bg-white/5 border border-white/10 p-3.5 rounded-2xl flex flex-col items-center gap-1.5">

                  <ShoppingBag size={20} className="text-[#FBBF24]" />

                  <span className="text-xs font-semibold">Coin Do'kon</span>

                </button>

                <button 

                  onClick={() => setSubView('pro')}

                  className="bg-[#1D1729] hover:bg-white/5 border border-[#8B5CF6]/30 p-3.5 rounded-2xl flex flex-col items-center gap-1.5">

                  <Sparkles size={20} className="text-[#C4B5FD]" />

                  <span className="text-xs font-semibold">ANONI PRO</span>

                </button>

                <button 

                  onClick={() => setSubView('support')}

                  className="bg-[#1D1729] hover:bg-white/5 border border-white/10 p-3.5 rounded-2xl flex flex-col items-center gap-1.5">

                  <MessageSquare size={20} className="text-[#22C55E]" />

                  <span className="text-xs font-semibold">AI Support</span>

                </button>

              </div>

            </div>

          )}



          {/* TAB 2: TESTLAR */}

          {!subView && activeTab === 'testlar' && (

            <div className="space-y-5 animate-in fade-in duration-300">

              <div className="flex justify-between items-center">

                <div>
                  <h2 className="text-xl font-bold">Testlar Bo'limi</h2>
                  <p className="mt-1 text-[10px] text-[#A7A0B5]">
                    Testlar hozircha shu qurilmada saqlanadi; balansga bog'langan mukofotlar testlar bulutga ko'chirilgach yoqiladi.
                  </p>
                </div>

                <button 

                  onClick={() => {
                    if (reachedDailyTestCreationLimit) {
                      showToast("Kunlik test yaratish limitiga yetdingiz (2/2). Ertagacha kuting!", "error");
                      return;
                    }
                    setSubView('create_test');
                  }}
                  disabled={reachedDailyTestCreationLimit}
                  className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(139,92,246,0.4)]">

                  <Plus size={16} /> Test Yaratish

                </button>

              </div>

              {reachedDailyTestCreationLimit && (
                <div role="alert" className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-200">
                  Kunlik test yaratish limitiga yetdingiz (2/2). Ertagacha kuting!
                </div>
              )}

              {!reachedDailyTestCreationLimit && (
                <p className="text-[10px] text-[#A7A0B5]">
                  Bugungi test yaratish: {dailyTestCreationCount}/2
                </p>
              )}


              <div className="space-y-3">

                {tests.map(test => {

                  const isMine = test.creatorId === currentUser.id;

                  const solved = test.attempts.some(a => a.userId === currentUser.id);

                  return (

                    <div key={test.id} className="bg-[#1D1729] p-5 rounded-2xl border border-white/10 space-y-3">

                      <div className="flex justify-between items-start">

                        <div>

                          <span className="text-[10px] text-[#C4B5FD] uppercase font-bold">

                            {isMine ? 'Sizning testingiz' : `Muallif: ${test.creatorId === currentUser.id ? currentUser.name : test.creatorName}`}

                          </span>

                          <h3 className="font-bold text-base mt-0.5">{test.title}</h3>
                          {test.popularRewardGranted && (
                            <span className="mt-1 inline-flex rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-200">
                              🏆 Ommabop test
                            </span>
                          )}
                        </div>

                        <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded flex items-center gap-1">

                          <Clock size={11} /> 30s faol

                        </span>

                      </div>



                      <div className="flex justify-between items-center text-xs text-[#A7A0B5]">

                        <span>{test.questions.length} ta savol</span>

                        <span>{test.attempts.length} ta ishtirokchi</span>

                        <span>{test.isAnonymous ? '🕵️ Anonim' : '👤 Ochiq ism'}</span>

                      </div>



                      <div className="flex gap-2 pt-1">

                        <button 

                          onClick={() => startSolvingTest(test)}

                          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${solved ? 'bg-white/5 text-[#A7A0B5]' : 'bg-[#8B5CF6] text-white'}`}>

                          {solved ? 'Yechilgan ✓' : 'Testni Yechish'}

                        </button>

                        {isMine && (

                          <button 

                            onClick={() => { setSelectedTestDetails(test); setSubView('test_details'); }}

                            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold">

                            Natijalar ({test.attempts.length})

                          </button>

                        )}

                      </div>

                    </div>

                  );

                })}

                {tests.length === 0 && (
                  <div className="rounded-2xl border border-white/10 bg-[#1D1729] p-5 text-center text-sm text-[#A7A0B5]">
                    Hozircha testlar yo'q. Birinchi testni o'zingiz yarating!
                  </div>
                )}

              </div>

            </div>

          )}



          {/* TAB 3: REYTING */}

          {!subView && activeTab === 'reyting' && (

            <div className="space-y-5 animate-in fade-in duration-300">

              <h2 className="text-xl font-bold">Global XP Reyting</h2>
              <p className="text-xs text-[#A7A0B5]">Supabase profillari real vaqtda sinxronlanadi.</p>



              {/* Leaderboard List */}

              <div className="space-y-3">

                {leaderboardUsers.map((u, idx) => {
                  const isAdminProfile = u.id === ADMIN_PROFILE.id;
                  const isCurrentUser = u.id === currentUser.id;
                  const lvl = getUserLevelInfo(u.xp, u.proMonths, idx === 0);

                  return (

                    <div
                      key={u.id}
                      className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${isAdminProfile ? 'bg-[#C8A66A]/10 border-[#C8A66A] shadow-[0_0_24px_rgba(200,166,106,0.15)]' : isCurrentUser ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]' : 'bg-[#1D1729] border-white/10'}`}>

                      <div className="flex items-center gap-3">

                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-extrabold text-xs ${idx === 0 ? 'bg-[#FBBF24] text-black' : 'bg-white/10 text-white'}`}>

                          {idx + 1}

                        </div>

                        {isAdminProfile ? (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#C8A66A] bg-[#C8A66A]/15 text-xl text-[#C8A66A] shadow-[0_0_14px_rgba(200,166,106,0.25)]">
                            👑
                          </div>
                        ) : u.avatar ? (
                          <img src={u.avatar} alt={`${u.name} avatari`} className={`w-10 h-10 rounded-full border-2 object-cover ${u.equipped.frame}`} />
                        ) : (
                          <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 bg-violet-500/15 text-xs font-bold text-violet-200 ${u.equipped.frame}`}>
                            {isCurrentUser ? currentUserInitials : u.name.split(/\s+/).map(namePart => namePart[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                        )}

                        <div>

                          <div className="font-bold text-sm flex items-center gap-1.5">
                            <span className={`${u.equipped.nameColor} ${isAdminProfile ? 'tracking-[0.12em]' : ''}`}>{u.name}</span>
                            {isAdminProfile && <BadgeCheck size={14} className="text-[#C8A66A]" aria-label="Tasdiqlangan admin" />}

                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${lvl.color === 'red' ? 'bg-red-500/20 text-red-400' : lvl.color === 'green' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>

                              {lvl.level} LVL

                            </span>

                          </div>

                          <div className="text-xs text-[#A7A0B5]">{u.xp} XP</div>
                          <div className={`mt-1 flex items-center gap-1 text-[10px] ${isAdminProfile ? 'text-[#C8A66A]' : 'text-[#A7A0B5]'}`}>
                            <span>ID: {isAdminProfile ? ADMIN_PUBLIC_ID : u.publicId || (isCurrentUser ? registeredProfile.publicId : '—')}</span>
                            {(isAdminProfile || isCurrentUser) && (
                              <button
                                type="button"
                                onClick={() => handleCopyPublicId(isAdminProfile ? ADMIN_PUBLIC_ID : registeredProfile.publicId)}
                                aria-label={`${u.name} ID sini nusxalash`}
                                className="rounded p-0.5 transition hover:bg-white/10 hover:text-white"
                              >
                                <Copy size={11} />
                              </button>
                            )}
                          </div>

                        </div>

                      </div>

                      <div className={`text-xs ${isAdminProfile ? 'font-bold text-[#C8A66A]' : 'text-[#A7A0B5]'}`}>

                        {isAdminProfile ? 'ADMIN' : isCurrentUser ? 'Siz' : 'Foydalanuvchi'}

                      </div>

                    </div>

                  );

                })}

              </div>

            </div>

          )}



          {/* TAB 4: CHALLENGE */}

          {!subView && activeTab === 'challenge' && (

            <div className="space-y-5 animate-in fade-in duration-300">

              <div className="flex justify-between items-center">

                <h2 className="text-xl font-bold">Kunlik Challenge</h2>

                <span className="text-xs text-[#22C55E] font-semibold">+{settings.xpChallenge} XP | +{settings.coinChallenge} Coin</span>

              </div>



              <div className="space-y-4">

                {challenges.map(ch => {

                  const done = ch.completedBy.includes(currentUser.id);

                  const totalVotes = ch.votesA + ch.votesB;

                  const pctA = Math.round((ch.votesA / totalVotes) * 100);

                  const pctB = 100 - pctA;



                  return (

                    <div key={ch.id} className="bg-[#1D1729] p-5 rounded-3xl border border-white/10 space-y-4">

                      <span className="text-[10px] bg-[#8B5CF6]/20 text-[#C4B5FD] px-2.5 py-1 rounded-full font-bold uppercase">

                        {ch.type}

                      </span>

                      <h3 className="text-lg font-bold leading-snug">{ch.question}</h3>



                      <div className="space-y-2.5">

                        <button

                          disabled={done}

                          onClick={async () => {
                            const rewarded = await updateUserBalance(currentUser.id, settings.xpChallenge, settings.coinChallenge, `Kunlik Challenge bajarildi`, false, ch.id);
                            if (!rewarded) return;
                            setChallenges(prev => prev.map(item => item.id === ch.id ? { ...item, votesA: item.votesA + 1, completedBy: [...item.completedBy, currentUser.id] } : item));
                            showToast('Tanlovingiz qabul qilindi! +15 XP va +8 Coin!');

                          }}

                          className={`w-full p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${done ? 'border-[#8B5CF6] bg-black/40' : 'border-white/10 bg-black/30 hover:border-[#8B5CF6]'}`}>

                          <div className="flex justify-between items-center relative z-10 text-sm font-semibold">

                            <span>{ch.optionA}</span>

                            {done && <span className="text-[#C4B5FD]">{pctA}%</span>}

                          </div>

                        </button>



                        <button

                          disabled={done}

                          onClick={async () => {
                            const rewarded = await updateUserBalance(currentUser.id, settings.xpChallenge, settings.coinChallenge, `Kunlik Challenge bajarildi`, false, ch.id);
                            if (!rewarded) return;
                            setChallenges(prev => prev.map(item => item.id === ch.id ? { ...item, votesB: item.votesB + 1, completedBy: [...item.completedBy, currentUser.id] } : item));
                            showToast('Tanlovingiz qabul qilindi! +15 XP va +8 Coin!');

                          }}

                          className={`w-full p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${done ? 'border-[#22C55E] bg-black/40' : 'border-white/10 bg-black/30 hover:border-[#22C55E]'}`}>

                          <div className="flex justify-between items-center relative z-10 text-sm font-semibold">

                            <span>{ch.optionB}</span>

                            {done && <span className="text-[#22C55E]">{pctB}%</span>}

                          </div>

                        </button>

                      </div>

                    </div>

                  );

                })}

              </div>

            </div>

          )}



          {/* TAB 5: PROFIL */}

          {!subView && activeTab === 'profil' && (

            <div className="space-y-5 animate-in fade-in duration-300">

              <div className="bg-[#1D1729] p-6 rounded-3xl border border-white/10 text-center relative overflow-hidden">

                <div className="relative w-24 h-24 mx-auto mb-3">
                  {currentUser.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt={`${currentUser.name} avatari`}
                      className={`h-full w-full rounded-full border-4 object-cover ${currentUser.equipped.frame} ${currentUser.equipped.anim}`}
                    />
                  ) : (
                    <div className={`flex h-full w-full items-center justify-center rounded-full border-4 bg-violet-500/15 text-2xl font-bold text-violet-200 ${currentUser.equipped.frame} ${currentUser.equipped.anim}`}>
                      {currentUserInitials}
                    </div>
                  )}
                </div>

                <div
                  onDragOver={event => {
                    event.preventDefault();
                    setIsAvatarDragOver(true);
                  }}
                  onDragLeave={event => {
                    event.preventDefault();
                    setIsAvatarDragOver(false);
                  }}
                  onDrop={event => {
                    event.preventDefault();
                    setIsAvatarDragOver(false);
                    saveAvatarFile(event.dataTransfer.files?.[0]);
                  }}
                  className={`mx-auto mb-5 max-w-sm rounded-2xl border border-dashed p-4 transition ${isAvatarDragOver ? 'border-amber-300 bg-amber-400/10' : 'border-amber-300/30 bg-black/20'}`}
                >
                  <p className="text-xs text-amber-100/90">Profil rasmi uchun rasmni shu yerga tashlang</p>
                  <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-400/20">
                    <ImageIcon size={15} />
                    Rasm tanlash
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={event => {
                        saveAvatarFile(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  <p className="mt-2 text-[10px] text-[#A7A0B5]">Rasm 1.5 MB gacha. Faqat shu brauzerda saqlanadi.</p>
                </div>



                <div className="flex items-center justify-center gap-2">
                  {equippedStatus && (() => {
                    const StatusIcon = equippedStatus.icon;
                    const SecondaryStatusIcon = equippedStatus.secondaryIcon;
                    return (
                      <span className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full ${equippedStatus.glowClass}`}>
                        <StatusIcon size={16} className={`${equippedStatus.iconClass} ${equippedStatus.effectClass}`} />
                        {SecondaryStatusIcon && <SecondaryStatusIcon size={9} className="absolute -right-0.5 -top-0.5 text-amber-200 drop-shadow-[0_0_5px_rgba(251,191,36,0.9)]" />}
                      </span>
                    );
                  })()}
                  <h2 className={`text-2xl font-bold ${currentUser.equipped.nameColor} ${currentUser.equipped.font}`}>
                    {currentUser.name}
                  </h2>
                  {currentUser.isPro && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#C8A66A]/30 bg-[#C8A66A]/10 px-2 py-1 text-[9px] font-extrabold tracking-wider text-[#C8A66A]">
                      <Crown size={11} /> PRO
                    </span>
                  )}
                </div>
                {currentUser.isPro && currentUser.subscriptionPermanent && (
                  <p className="mt-1 text-[10px] text-[#C8A66A]">Doimiy PRO obuna</p>
                )}
                {currentUser.isPro && !currentUser.subscriptionPermanent && currentUser.subscriptionUntil && (
                  <p className="mt-1 text-[10px] text-[#C8A66A]">
                    {formatLocalDateTime(Number(currentUser.subscriptionUntil))} gacha
                  </p>
                )}

                <p className="text-xs text-[#A7A0B5] mt-0.5">{currentUser.age} yosh</p>
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-[#A7A0B5]">
                  <span>ID: {registeredProfile.publicId}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyPublicId(registeredProfile.publicId)}
                    aria-label="Foydalanuvchi ID sini nusxalash"
                    className="rounded p-1 text-violet-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <Copy size={13} />
                  </button>
                </div>



                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold">

                  <span>{userLevel.level}-DARAJA ({userLevel.color === 'red' ? 'Qizil' : userLevel.color === 'green' ? 'Yashil' : 'Sariq'})</span>

                </div>



                {/* 8-Level Completion Notice for 9-Level Red */}

                {(userLevel.level === 8 || userLevel.blockedByPro) && (

                  <div className="mt-4 bg-red-500/15 border border-red-500/40 rounded-2xl p-3 text-xs text-red-200 text-left">

                    <strong>9-Darajaga (Qizil) o'tish sharti:</strong> Siz 8-darajani yakunladingiz! 9-darajaga o'tish uchun kamida 3 oy uzluksiz ANONI PRO obunasi yoki Global Reytingda 1-o'rinda bo'lish talab etiladi. (Hozir sizda: {currentUser.proMonths}/3 oy).

                  </div>

                )}



                <div className="grid grid-cols-2 gap-3 mt-5">

                  <div className="bg-black/30 p-3.5 rounded-2xl border border-white/5">

                    <div className="text-xs text-[#A7A0B5]">XP Balans</div>

                    <div className="text-xl font-extrabold text-[#8B5CF6] mt-0.5">{currentUser.xp}</div>

                  </div>

                  <div onClick={() => setSubView('shop')} className="bg-black/30 p-3.5 rounded-2xl border border-white/5 cursor-pointer hover:border-[#FBBF24]/50">

                    <div className="text-xs text-[#A7A0B5]">ANONI COIN</div>

                    <div className="text-xl font-extrabold text-[#FBBF24] mt-0.5">{currentUser.coins}</div>

                  </div>

                </div>

              </div>



              {/* Transactions History */}

              <div className="bg-[#1D1729] p-5 rounded-2xl border border-white/10 space-y-3">

                <h3 className="text-sm font-bold text-[#A7A0B5] uppercase">Balans Tarixi (Tranzaksiyalar)</h3>

                <div className="space-y-2 max-h-48 overflow-y-auto">

                  {transactions.filter(tx => tx.userId === currentUser.id).map(tx => (

                    <div key={tx.id} className="bg-black/30 p-3 rounded-xl flex justify-between items-center text-xs">

                      <div>

                        <div className="font-semibold">{tx.reason}</div>

                        <div className="text-[10px] text-[#A7A0B5]">{tx.date}</div>

                      </div>

                      <span className={`font-extrabold ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>

                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount} {tx.type}

                      </span>

                    </div>

                  ))}

                </div>

              </div>

            </div>

          )}

        </main>



        {/* Bottom Navigation Bar */}

        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#15111F]/95 backdrop-blur-md border-t border-white/10 z-40">

          <div className="flex justify-around items-center h-16">

            {[

              { id: 'bosh_sahifa', label: 'Asosiy', icon: Home },

              { id: 'testlar', label: 'Testlar', icon: FileText },

              { id: 'reyting', label: 'Reyting', icon: Trophy },

              { id: 'challenge', label: 'Challenge', icon: Zap },

              { id: 'profil', label: 'Profil', icon: User },

            ].map(tab => {

              const Icon = tab.icon;

              const active = !subView && activeTab === tab.id;

              return (

                <button

                  key={tab.id}

                  onClick={() => { setSubView(null); setActiveTab(tab.id); }}

                  className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${active ? 'text-[#8B5CF6]' : 'text-[#A7A0B5] hover:text-white'}`}>

                  <Icon size={20} />

                  <span className="text-[10px] font-medium">{tab.label}</span>

                </button>

              );

            })}

          </div>

        </nav>

      </div>

    </div>

  );

}
