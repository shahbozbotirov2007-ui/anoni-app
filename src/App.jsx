import React, { useState, useEffect } from 'react';

import { 

  Home, FileText, Trophy, Zap, User, Shield, Plus, Trash2, Check, 

  X, Sparkles, Lock, AlertTriangle, MessageSquare, ShoppingBag, 

  CreditCard, Settings, Users, Ban, Gift, Search, Eye, Share2, 

  ChevronRight, ArrowLeft, Send, Image as ImageIcon, RefreshCw, 

  Award, Clock, CheckCircle2, HelpCircle, LogOut, Sliders

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

  // --- Global Navigation & Mode ---

  const [activeTab, setActiveTab] = useState('bosh_sahifa');

  const [subView, setSubView] = useState(null); // 'create_test', 'solve_test', 'test_details', 'shop', 'pro', 'support'

  const [isAdminMode, setIsAdminMode] = useState(false);

  const [adminTab, setAdminTab] = useState('dashboard');

  const [toast, setToast] = useState(null);



  const showToast = (message, type = 'success') => {

    setToast({ message, type });

    setTimeout(() => setToast(null), 3500);

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

    level11GiftTitle: "Maxsus ANONI Merch Box + iPhone 16 Pro o'yinida ishtirok",

    level11GiftPhoto: "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=600&auto=format&fit=crop&q=80"

  });



  // --- Users State ---

  const [isLoggedIn, setIsLoggedIn] = useState(true);

  const [currentUserId, setCurrentUserId] = useState('AN-1001');

  const [users, setUsers] = useState([

    {

      id: 'AN-1001',

      name: 'Asadbek',

      username: 'asadbek_dev',

      xp: 245,

      coins: 180,

      isPro: false,

      proMonths: 1,

      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Asadbek&backgroundColor=b6e3f4',

      ban: null, // { reason, until, count }

      ownedItems: ['default'],

      equipped: { nameColor: 'text-white', font: 'font-sans', frame: 'border-yellow-400', anim: '' },

      aiFreeUsedThisWeek: false,

      testsCreatedToday: 1

    },

    {

      id: 'AN-1002',

      name: 'Shohruh',

      username: 'shohruh_king',

      xp: 3650,

      coins: 940,

      isPro: true,

      proMonths: 4,

      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Shohruh&backgroundColor=ffdfbf',

      ban: null,

      ownedItems: ['color_neon', 'frame_fire'],

      equipped: { nameColor: 'text-[#C4B5FD]', font: 'font-serif', frame: 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]', anim: 'animate-pulse' },

      aiFreeUsedThisWeek: false,

      testsCreatedToday: 0

    },

    {

      id: 'AN-1003',

      name: 'Anora',

      username: 'anora_star',

      xp: 1420,

      coins: 310,

      isPro: true,

      proMonths: 2,

      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anora&backgroundColor=c0aede',

      ban: null,

      ownedItems: [],

      equipped: { nameColor: 'text-green-400', font: 'font-sans', frame: 'border-green-400', anim: '' },

      aiFreeUsedThisWeek: false,

      testsCreatedToday: 2

    },

    {

      id: 'AN-1004',

      name: 'Jasur',

      username: 'jasur_07',

      xp: 8200,

      coins: 1500,

      isPro: true,

      proMonths: 6,

      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jasur&backgroundColor=d1d4f9',

      ban: null,

      ownedItems: [],

      equipped: { nameColor: 'text-red-400', font: 'font-mono', frame: 'border-red-500', anim: '' },

      aiFreeUsedThisWeek: false,

      testsCreatedToday: 0

    }

  ]);



  const currentUser = users.find(u => u.id === currentUserId) || users[0];

  const sortedUsersByXP = [...users].sort((a, b) => b.xp - a.xp);

  const isCurrentUserTop = sortedUsersByXP[0]?.id === currentUser.id;

  const userLevel = getUserLevelInfo(currentUser.xp, currentUser.proMonths, isCurrentUserTop);



  // --- Transactions & Audit Logs ---

  const [transactions, setTransactions] = useState([

    { id: 'TX-1', userId: 'AN-1001', type: 'COIN', amount: +50, reason: 'Boshlang\'ich bonus', date: 'Bugun, 10:00' },

    { id: 'TX-2', userId: 'AN-1001', type: 'XP', amount: +100, reason: '2-darajaga o\'tish', date: 'Bugun, 11:30' }

  ]);

  const [auditLogs, setAuditLogs] = useState([

    { id: 'LOG-1', admin: 'SuperAdmin', action: 'Tizim ishga tushirildi va boshlang\'ich balanslar o\'rnatildi', time: 'Bugun, 09:00' }

  ]);



  const updateUserBalance = (userId, xpDelta, coinDelta, reason, isAdminAction = false) => {

    setUsers(prev => prev.map(u => {

      if (u.id !== userId) return u;

      return {

        ...u,

        xp: Math.max(0, u.xp + xpDelta),

        coins: Math.max(0, u.coins + coinDelta)

      };

    }));



    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newTx = [];

    if (xpDelta !== 0) {

      newTx.push({ id: `TX-${Date.now()}-X`, userId, type: 'XP', amount: xpDelta, reason: isAdminAction ? `[Admin] ${reason}` : reason, date: `Bugun, ${now}` });

    }

    if (coinDelta !== 0) {

      newTx.push({ id: `TX-${Date.now()}-C`, userId, type: 'COIN', amount: coinDelta, reason: isAdminAction ? `[Admin] ${reason}` : reason, date: `Bugun, ${now}` });

    }

    setTransactions(prev => [...newTx, ...prev]);

  };



  // --- Tests State ---

  const [tests, setTests] = useState([

    {

      id: 'TEST-101',

      creatorId: 'AN-1001',

      creatorName: 'Asadbek',

      title: 'Meni qanchalik yaxshi bilasan?',

      isAnonymous: false,

      createdAt: Date.now() - 3600 * 1000 * 5, // 5 hours ago

      expiresAt: Date.now() + 3600 * 1000 * 25, // 25 hours left

      status: 'active',

      questions: [

        { q: "Mening eng sevimli faslim qaysi?", options: ["Bahor", "Yoz", "Kuz", "Qish"], correct: 2 },

        { q: "Bo'sh vaqtimda nima qilishni yoqtiraman?", options: ["Kod yozish va o'yin", "Kitob o'qish", "Futbol ko'rish", "Uxlash"], correct: 0 },

        { q: "Qaysi taomni eng ko'p yaxshi ko'raman?", options: ["Osh", "Shashlik", "Pizza", "Lavash"], correct: 0 }

      ],

      attempts: [

        { userId: 'AN-1002', userName: 'Shohruh', score: 3, total: 3, percent: 100, date: '2 soat oldin' },

        { userId: 'AN-1003', userName: 'Anora', score: 2, total: 3, percent: 67, date: '1 soat oldin' }

      ]

    },

    {

      id: 'TEST-102',

      creatorId: 'AN-1002',

      creatorName: 'Shohruh',

      title: 'Shohruhning sirli dunyosi 🔥',

      isAnonymous: true,

      createdAt: Date.now() - 3600 * 1000 * 2,

      expiresAt: Date.now() + 3600 * 1000 * 28,

      status: 'active',

      questions: [

        { q: "Shohruh qaysi mashinani orzu qiladi?", options: ["BMW M5", "Mercedes G63", "Porsche 911", "Tesla Cybertruck"], correct: 0 },

        { q: "Qaysi davlatga sayohat qilishni xohlaydi?", options: ["Yaponiya", "Shveysariya", "AQSH", "Turkiya"], correct: 1 },

        { q: "Uning eng katta qo'rquvi nima?", options: ["Balandlik", "Qorong'ulik", "Yolg'izlik", "Ilonlar"], correct: 0 }

      ],

      attempts: []

    }

  ]);



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

    { id: 'color_neon', name: 'Neon Binafsha Ism', category: 'nameColor', value: 'text-[#C4B5FD] drop-shadow-[0_0_8px_rgba(139,92,246,0.8)]', price: 50, preview: 'Neon Ism' },

    { id: 'color_gold', name: 'Oltin Qirol Ismi', category: 'nameColor', value: 'text-[#FBBF24] drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]', price: 50, preview: 'Oltin Ism' },

    { id: 'font_mono', name: 'Kiberxavfsizlik Shrifti', category: 'font', value: 'font-mono tracking-wider', price: 100, preview: 'MONOSPACE' },

    { id: 'frame_emerald', name: 'Zumrad Ramka', category: 'frame', value: 'border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)]', price: 150, preview: 'Zumrad' },

    { id: 'frame_fire', name: 'Olovi Qirol Ramkasi', category: 'frame', value: 'border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.8)]', price: 300, preview: 'Olovli' },

    { id: 'anim_pulse', name: 'Yurak Urishi Animatsiyasi', category: 'anim', value: 'animate-pulse', price: 500, preview: 'Animatsiya' }

  ];



  // --- Click Payment Modal State ---

  const [paymentModal, setPaymentModal] = useState(null); // { title, amountUSD, type: 'PRO' | 'COINS', coinsAmount }

  const [cardNumber, setCardNumber] = useState('8600 ');

  const [cardExpiry, setCardExpiry] = useState('');

  const [smsCode, setSmsCode] = useState('');

  const [paymentStep, setPaymentStep] = useState(1);



  // --- Support & AI Chat State ---

  const [tickets, setTickets] = useState([

    {

      id: 'TIC-1',

      userId: 'AN-1001',

      userName: 'Asadbek',

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

  const [newAdImage, setNewAdImage] = useState('');



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



  const handlePublishTest = () => {

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

      attempts: []

    };



    setTests(prev => [newTest, ...prev]);



    // Kuniga 3 tagacha test yaratish uchun mukofot

    if (currentUser.testsCreatedToday < 3) {

      updateUserBalance(currentUser.id, settings.xpTestCreate, settings.coinTestCreate, `Yangi test yaratildi (${newTest.id})`);

      setUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, testsCreatedToday: u.testsCreatedToday + 1 } : u));

      showToast(`Test faollashtirildi! +${settings.xpTestCreate} XP va +${settings.coinTestCreate} Coin berildi!`);

    } else {

      showToast("Test faollashtirildi! (Kunlik mukofot limiti 3/3 to'lgan)");

    }



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

      const attemptObj = {

        userId: currentUser.id,

        userName: activeTestToSolve.isAnonymous ? "Yashirin Ishtirokchi 🕵️" : currentUser.name,

        score: correctCount,

        total: activeTestToSolve.questions.length,

        percent,

        date: 'Hozirgina'

      };



      // Update test attempts & reward creator according to formula:

      // XP = min(2 * solvers, 20), Coin = min(2 * solvers, 50)

      setTests(prev => prev.map(t => {

        if (t.id !== activeTestToSolve.id) return t;

        const newAttempts = [...t.attempts, attemptObj];

        const solverCount = newAttempts.length;

        const giveXp = solverCount <= 10 ? settings.xpPerSolver : 0; // max 20 XP (10 solvers * 2)

        const giveCoin = solverCount <= 25 ? settings.coinPerSolver : 0; // max 50 Coin (25 solvers * 2)

        if (giveXp > 0 || giveCoin > 0) {

          updateUserBalance(t.creatorId, giveXp, giveCoin, `Test ishtirokchisi uchun mukofot (${t.id})`);

        }

        return { ...t, attempts: newAttempts };

      }));



      setTestResult(attemptObj);

      showToast("Natijangiz hisoblandi!");

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

  const handleConfirmClickPayment = () => {

    if (paymentStep === 1) {

      if (cardNumber.replace(/\s/g, '').length < 16) {

        showToast("16 xonali karta raqamini to'liq kiriting!", "error");

        return;

      }

      setPaymentStep(2);

      return;

    }



    if (smsCode.length < 4) {

      showToast("SMS kodni kiriting (masalan: 1234)", "error");

      return;

    }



    if (paymentModal.type === 'PRO') {

      setUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, isPro: true, proMonths: u.proMonths + 1 } : u));

      showToast("Tabriklaymiz! ANONI PRO obunasi 1 oyga faollashtirildi! ✨");

    } else if (paymentModal.type === 'COINS') {

      updateUserBalance(currentUser.id, 0, paymentModal.coinsAmount, `Click orqali ${paymentModal.coinsAmount} Coin xarid qilindi`);

      showToast(`Balansingizga +${paymentModal.coinsAmount} ANONI COIN qo'shildi! 🪙`);

    }



    setPaymentModal(null);

    setPaymentStep(1);

    setSmsCode('');

  };



  // ============================================================================

  // BAN OVERLAY (Agar foydalanuvchi BAN olgan bo'lsa va Admin rejimida bo'lmasa)

  // ============================================================================

  if (currentUser.ban && !isAdminMode) {

    return (

      <div className="min-h-screen bg-[#0B0912] text-[#F8FAFC] flex items-center justify-center p-5 font-sans">

        <div className="max-w-md w-full bg-[#1D1729] border-2 border-[#EF4444] rounded-3xl p-8 text-center shadow-[0_0_40px_rgba(239,68,68,0.25)] flex flex-col items-center gap-4">

          <div className="w-20 h-20 rounded-full bg-[#EF4444]/20 text-[#EF4444] flex items-center justify-center animate-bounce">

            <Ban size={42} />

          </div>

          <h1 className="text-3xl font-extrabold text-[#EF4444]">Siz BAN olgansiz</h1>

          <p className="text-sm text-[#A7A0B5]">

            Platforma xavfsizlik qoidalarini buzganingiz sababli hisobingiz vaqtinchalik cheklandi.

          </p>

          <div className="w-full bg-black/40 rounded-2xl p-4 border border-white/10 text-left text-sm space-y-2">

            <div className="flex justify-between">

              <span className="text-[#A7A0B5]">Sabab:</span>

              <span className="font-semibold text-white">{currentUser.ban.reason}</span>

            </div>

            <div className="flex justify-between">

              <span className="text-[#A7A0B5]">Muddat:</span>

              <span className="font-semibold text-[#FBBF24]">{currentUser.ban.duration}</span>

            </div>

            <div className="flex justify-between">

              <span className="text-[#A7A0B5]">Holat:</span>

              <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Tekshiruv 24 soatgacha</span>

            </div>

          </div>



          <button 

            onClick={() => {

              setUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, ban: null } : u));

              showToast("Apellyatsiya yuborildi va demo rejimda BAN olib tashlandi.");

            }}

            className="w-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white py-3.5 rounded-xl font-semibold transition-all">

            Support xizmatiga apellyatsiya yozish

          </button>

          <button 

            onClick={() => setIsAdminMode(true)}

            className="text-xs text-[#A7A0B5] underline mt-2">

            Admin Panelga o'tib BANni ochish

          </button>

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

                  <div className="text-3xl font-extrabold mt-1 text-[#FBBF24]">{users.filter(u => u.isPro).length}</div>

                  <div className="text-xs text-green-400 mt-1">Click integratsiya faol</div>

                </div>

                <div className="bg-[#1D1729] p-5 rounded-2xl border border-white/10">

                  <div className="text-[#A7A0B5] text-xs">BAN Olganlar</div>

                  <div className="text-3xl font-extrabold mt-1 text-[#EF4444]">{users.filter(u => u.ban).length}</div>

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

                            {u.isPro && <span className="text-[10px] bg-[#8B5CF6]/20 text-[#C4B5FD] px-2 py-0.5 rounded">PRO ({u.proMonths} oy)</span>}

                            {u.ban && <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded">BAN</span>}

                          </div>

                          <div className="text-xs text-[#A7A0B5] mt-1">

                            XP: <strong className="text-white">{u.xp}</strong> | ANONI COIN: <strong className="text-[#FBBF24]">{u.coins}</strong>

                          </div>

                        </div>

                      </div>



                      <div className="flex flex-wrap gap-2">

                        <button 

                          onClick={() => {

                            updateUserBalance(u.id, 0, 50, "Admin tomonidan bonus", true);

                            setAuditLogs(prev => [{ id: `L-${Date.now()}`, admin: 'Admin', action: `${u.name} ga +50 Coin qo'shildi`, time: 'Hozirgina' }, ...prev]);

                            showToast(`${u.name} ga +50 Coin berildi!`);

                          }}

                          className="text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 px-3 py-2 rounded-lg font-medium">

                          +50 Coin

                        </button>

                        <button 

                          onClick={() => {

                            updateUserBalance(u.id, 100, 0, "Admin XP mukofoti", true);

                            setAuditLogs(prev => [{ id: `L-${Date.now()}`, admin: 'Admin', action: `${u.name} ga +100 XP qo'shildi`, time: 'Hozirgina' }, ...prev]);

                            showToast(`${u.name} ga +100 XP berildi!`);

                          }}

                          className="text-xs bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 text-[#C4B5FD] px-3 py-2 rounded-lg font-medium">

                          +100 XP

                        </button>

                        <button 

                          onClick={() => {

                            setUsers(prev => prev.map(item => item.id === u.id ? { ...item, isPro: !item.isPro, proMonths: !item.isPro ? 3 : 0 } : item));

                            showToast(`${u.name} PRO holati o'zgartirildi!`);

                          }}

                          className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-3 py-2 rounded-lg font-medium">

                          {u.isPro ? 'PRO Olib tashlash' : 'PRO + 3 oy Berish'}

                        </button>

                        <button 

                          onClick={() => {

                            if (u.ban) {

                              setUsers(prev => prev.map(item => item.id === u.id ? { ...item, ban: null } : item));

                              setAuditLogs(prev => [{ id: `L-${Date.now()}`, admin: 'Admin', action: `${u.name} BANdan ochildi`, time: 'Hozirgina' }, ...prev]);

                              showToast(`${u.name} BANdan ochildi!`);

                            } else {

                              setUsers(prev => prev.map(item => item.id === u.id ? { ...item, ban: { reason: "Qoidabuzarlik va g'irromlik", duration: "1 kunlik (Birinchi ogohlantirish)" } } : item));

                              setAuditLogs(prev => [{ id: `L-${Date.now()}`, admin: 'Admin', action: `${u.name} 1 kunga BAN qilindi`, time: 'Hozirgina' }, ...prev]);

                              showToast(`${u.name} BAN qilindi!`, 'error');

                            }

                          }}

                          className={`text-xs px-3 py-2 rounded-lg font-medium ${u.ban ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>

                          {u.ban ? 'BANni Ochish' : '1 Kunga BAN Qilish'}

                        </button>

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

              <h2 className="text-2xl font-bold">9:16 Reklama Bannerlari (3 soniya taymer bilan)</h2>

              <div className="bg-[#1D1729] p-6 rounded-2xl border border-white/10 space-y-4">

                <div className="grid md:grid-cols-2 gap-4">

                  <input 

                    type="text"

                    value={newAdTitle}

                    onChange={(e) => setNewAdTitle(e.target.value)}

                    placeholder="Reklama sarlavhasi..."

                    className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm"

                  />

                  <input 

                    type="text"

                    value={newAdImage}

                    onChange={(e) => setNewAdImage(e.target.value)}

                    placeholder="Rasm URL manzili (9:16 tavsiya etiladi)..."

                    className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm"

                  />

                </div>

                <button 

                  onClick={() => {

                    if (!newAdTitle.trim()) return;

                    const newAd = {

                      id: `AD-${Date.now()}`,

                      title: newAdTitle,

                      imageUrl: newAdImage || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',

                      active: true,

                      views: 0,

                      startDate: 'Bugun',

                      endDate: '30 kundan so\'ng'

                    };

                    setAds(prev => [newAd, ...prev]);

                    setNewAdTitle('');

                    setNewAdImage('');

                    showToast("Reklama qo'shildi!");

                  }}

                  className="bg-[#8B5CF6] px-6 py-3 rounded-xl font-semibold text-sm">

                  Reklamani Qo'shish

                </button>

              </div>



              <div className="grid md:grid-cols-2 gap-4">

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

              <h2 className="text-2xl font-bold">Iqtisodiy Formulalar va 11-Daraja Sovg'asi</h2>

              <div className="bg-[#1D1729] p-6 rounded-2xl border border-white/10 space-y-4">

                <h3 className="font-bold text-[#FBBF24]">11-Daraja Maxsus Sovg'asi (Rasm va Sarlavha)</h3>

                <div className="grid md:grid-cols-2 gap-4">

                  <div>

                    <label className="text-xs text-[#A7A0B5]">Sovg'a Nomi / Sarlavhasi</label>

                    <input 

                      type="text"

                      value={settings.level11GiftTitle}

                      onChange={(e) => setSettings({ ...settings, level11GiftTitle: e.target.value })}

                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm mt-1"

                    />

                  </div>

                  <div>

                    <label className="text-xs text-[#A7A0B5]">Sovg'a Rasmi (URL)</label>

                    <input 

                      type="text"

                      value={settings.level11GiftPhoto}

                      onChange={(e) => setSettings({ ...settings, level11GiftPhoto: e.target.value })}

                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm mt-1"

                    />

                  </div>

                </div>

                <button 

                  onClick={() => showToast("Sovg'a va iqtisodiy sozlamalar saqlandi!")}

                  className="bg-[#8B5CF6] px-6 py-2.5 rounded-xl font-semibold text-sm">

                  O'zgarishlarni Saqlash

                </button>

              </div>

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



      {/* Click Payment Modal */}

      {paymentModal && (

        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">

          <div className="bg-[#1D1729] border border-white/15 rounded-3xl max-w-sm w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">

            <div className="flex justify-between items-center border-b border-white/10 pb-3">

              <div className="flex items-center gap-2">

                <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center font-extrabold text-white text-xs">

                  CLICK

                </div>

                <span className="font-bold text-sm">Xavfsiz To'lov Tizimi</span>

              </div>

              <button onClick={() => setPaymentModal(null)} className="text-[#A7A0B5] hover:text-white">

                <X size={20} />

              </button>

            </div>



            <div className="bg-black/30 p-4 rounded-2xl border border-white/5 text-center">

              <div className="text-xs text-[#A7A0B5]">{paymentModal.title}</div>

              <div className="text-2xl font-extrabold text-[#FBBF24] mt-1">${paymentModal.amountUSD.toFixed(2)}</div>

              <div className="text-[11px] text-[#A7A0B5] mt-0.5">≈ {(paymentModal.amountUSD * 12800).toLocaleString()} UZS</div>

            </div>



            {paymentStep === 1 ? (

              <div className="space-y-3">

                <div>

                  <label className="text-xs text-[#A7A0B5]">Karta raqami (Uzcard / Humo)</label>

                  <input 

                    type="text"

                    maxLength={19}

                    value={cardNumber}

                    onChange={(e) => setCardNumber(e.target.value)}

                    placeholder="8600 0000 0000 0000"

                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm mt-1 focus:outline-none focus:border-blue-400"

                  />

                </div>

                <div>

                  <label className="text-xs text-[#A7A0B5]">Amal qilish muddati</label>

                  <input 

                    type="text"

                    maxLength={5}

                    value={cardExpiry}

                    onChange={(e) => setCardExpiry(e.target.value)}

                    placeholder="08/28"

                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm mt-1 focus:outline-none focus:border-blue-400"

                  />

                </div>

              </div>

            ) : (

              <div className="space-y-3">

                <div className="text-xs text-center text-green-400">

                  Telefon raqamingizga tasdiqlash kodi yuborildi (Demo: istalgan 4 ta raqam yozing)

                </div>

                <input 

                  type="text"

                  maxLength={6}

                  value={smsCode}

                  onChange={(e) => setSmsCode(e.target.value)}

                  placeholder="SMS Kod (masalan: 7777)"

                  className="w-full bg-black/40 border border-blue-400 rounded-xl px-4 py-3 text-center tracking-widest font-bold text-lg"

                />

              </div>

            )}



            <button 

              onClick={handleConfirmClickPayment}

              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-3.5 rounded-xl text-sm shadow-lg transition-all">

              {paymentStep === 1 ? 'Davom etish' : 'To\'lovni Tasdiqlash'}

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

            {isLoggedIn && (

              <button 

                onClick={() => setSubView('shop')}

                className="flex items-center gap-1.5 bg-[#1D1729] hover:bg-[#261E36] px-3 py-1.5 rounded-full border border-[#FBBF24]/30 transition-all">

                <span className="w-4 h-4 rounded-full bg-[#FBBF24] text-black font-extrabold text-[10px] flex items-center justify-center">C</span>

                <span className="font-bold text-xs text-[#FBBF24]">{currentUser.coins}</span>

              </button>

            )}

            <button 

              onClick={() => setIsAdminMode(true)}

              title="Admin Panelga O'tish"

              className="flex items-center gap-1 bg-[#8B5CF6]/15 hover:bg-[#8B5CF6]/30 text-[#C4B5FD] border border-[#8B5CF6]/40 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all">

              <Shield size={14} />

              <span>Admin</span>

            </button>

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

                  className="w-full py-4 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] text-white font-bold shadow-[0_0_20px_rgba(139,92,246,0.5)]">

                  Testni Faollashtirish (30 soat)

                </button>

              </div>

            </div>

          )}



          {subView === 'solve_test' && activeTestToSolve && (

            <div className="space-y-6 animate-in fade-in duration-300">

              <button onClick={() => setSubView(null)} className="flex items-center gap-1 text-sm text-[#A7A0B5] hover:text-white">

                <ArrowLeft size={18} /> Testdan chiqish

              </button>



              {!testResult ? (

                <div className="bg-[#1D1729] p-6 rounded-3xl border border-white/10 space-y-6">

                  <div className="flex justify-between items-center text-xs text-[#A7A0B5]">

                    <span>Muallif: <strong className="text-white">{activeTestToSolve.creatorName}</strong></span>

                    <span className="bg-[#8B5CF6]/20 text-[#C4B5FD] px-2.5 py-1 rounded-full font-bold">

                      {currentQIndex + 1} / {activeTestToSolve.questions.length}

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

                <div className="bg-gradient-to-b from-[#8B5CF6]/20 to-[#1D1729] p-6 rounded-3xl border border-[#8B5CF6]/40 text-center space-y-5">

                  <div className="w-20 h-20 rounded-full bg-[#8B5CF6]/20 border-2 border-[#8B5CF6] mx-auto flex items-center justify-center text-2xl font-extrabold text-white shadow-[0_0_25px_rgba(139,92,246,0.5)]">

                    {testResult.percent}%

                  </div>

                  <div>

                    <h3 className="text-2xl font-extrabold">Natijangiz tayyor!</h3>

                    <p className="text-sm text-[#A7A0B5] mt-1">

                      Siz {testResult.total} ta savoldan {testResult.score} tasiga to'g'ri javob berdingiz.

                    </p>

                  </div>

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



              <h2 className="text-xl font-bold">ANONI COIN Do'koni</h2>



              {/* Buy Coins via Click ($1 = 50 Coins, max 500) */}

              <div className="bg-gradient-to-r from-amber-500/20 to-[#1D1729] p-4 rounded-2xl border border-[#FBBF24]/40 space-y-3">

                <div className="flex justify-between items-center">

                  <span className="font-bold text-sm text-[#FBBF24]">Click orqali Coin Xarid Qilish</span>

                  <span className="text-xs text-[#A7A0B5]">$1 = 50 Coin</span>

                </div>

                <div className="grid grid-cols-3 gap-2">

                  {[

                    { coins: 50, usd: 1 },

                    { coins: 150, usd: 3 },

                    { coins: 500, usd: 10 }

                  ].map(pack => (

                    <button

                      key={pack.coins}

                      onClick={() => setPaymentModal({ title: `${pack.coins} ANONI COIN Xaridi`, amountUSD: pack.usd, type: 'COINS', coinsAmount: pack.coins })}

                      className="bg-black/40 hover:bg-[#FBBF24]/20 border border-[#FBBF24]/30 p-2.5 rounded-xl text-center transition-all">

                      <div className="font-extrabold text-sm text-[#FBBF24]">+{pack.coins}</div>

                      <div className="text-[11px] text-white mt-0.5">${pack.usd}</div>

                    </button>

                  ))}

                </div>

              </div>



              {/* Cosmetics List */}

              <div className="space-y-3">

                {SHOP_ITEMS.map(item => {

                  const owned = currentUser.ownedItems.includes(item.id);

                  return (

                    <div key={item.id} className="bg-[#1D1729] p-4 rounded-2xl border border-white/10 flex justify-between items-center">

                      <div>

                        <div className="font-bold text-sm">{item.name}</div>

                        <div className="text-xs text-[#A7A0B5] mt-0.5">Narxi: <strong className="text-[#FBBF24]">{item.price} Coin</strong></div>

                      </div>

                      <button

                        onClick={() => {

                          if (owned) {

                            setUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, equipped: { ...u.equipped, [item.category]: item.value } } : u));

                            showToast(`${item.name} profilga o'rnatildi!`);

                            return;

                          }

                          if (currentUser.coins < item.price) {

                            showToast("Coin yetarli emas! Challenge o'ynang yoki Click orqali xarid qiling.", "error");

                            return;

                          }

                          updateUserBalance(currentUser.id, 0, -item.price, `Do'kondan xarid: ${item.name}`);

                          setUsers(prev => prev.map(u => u.id === currentUser.id ? {

                            ...u,

                            ownedItems: [...u.ownedItems, item.id],

                            equipped: { ...u.equipped, [item.category]: item.value }

                          } : u));

                          showToast(`${item.name} xarid qilindi va o'rnatildi!`);

                        }}

                        className={`px-4 py-2 rounded-xl text-xs font-bold ${owned ? 'bg-green-500/20 text-green-400' : 'bg-[#8B5CF6] text-white'}`}>

                        {owned ? 'O\'rnatish' : `${item.price} Coin`}

                      </button>

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

              {!isLoggedIn ? (

                <section className="text-center py-6 flex flex-col gap-4 bg-[#1D1729] p-6 rounded-3xl border border-white/10">

                  <h2 className="text-2xl font-extrabold text-[#F8FAFC] leading-snug">

                    Do'stlaringiz sizni qanchalik biladi?

                  </h2>

                  <p className="text-[#A7A0B5] text-xs px-2">

                    Test yarating, ulashing va do'stlaringiz haqiqiy fikrini bilib oling. Barcha ishtirokchilar Telegram orqali tasdiqlanadi.

                  </p>

                  <button 

                    onClick={() => { setIsLoggedIn(true); showToast("Telegram orqali muvaffaqiyatli kirdingiz!"); }}

                    className="mt-2 w-full bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] text-white py-3.5 px-6 rounded-xl font-bold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(139,92,246,0.5)] active:scale-95 transition-all">

                    <Send size={18} />

                    <span>Telegram orqali kirish</span>

                  </button>

                </section>

              ) : (

                <section className="bg-[#1D1729] rounded-3xl p-5 border border-white/10 flex flex-col gap-4">

                  <div className="flex items-center justify-between">

                    <div className="flex items-center gap-3">

                      <img src={currentUser.avatar} alt="Avatar" className={`w-12 h-12 rounded-full border-2 ${currentUser.equipped.frame}`} />

                      <div>

                        <div className={`font-bold text-base ${currentUser.equipped.nameColor} ${currentUser.equipped.font}`}>

                          {currentUser.name}

                        </div>

                        <div className="text-xs text-[#A7A0B5]">ID: {currentUser.id}</div>

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

              )}



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

                <h2 className="text-xl font-bold">Testlar Bo'limi</h2>

                <button 

                  onClick={() => setSubView('create_test')}

                  className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(139,92,246,0.4)]">

                  <Plus size={16} /> Test Yaratish

                </button>

              </div>



              <div className="space-y-3">

                {tests.map(test => {

                  const isMine = test.creatorId === currentUser.id;

                  const solved = test.attempts.some(a => a.userId === currentUser.id);

                  return (

                    <div key={test.id} className="bg-[#1D1729] p-5 rounded-2xl border border-white/10 space-y-3">

                      <div className="flex justify-between items-start">

                        <div>

                          <span className="text-[10px] text-[#C4B5FD] uppercase font-bold">

                            {isMine ? 'Sizning testingiz' : `Muallif: ${test.creatorName}`}

                          </span>

                          <h3 className="font-bold text-base mt-0.5">{test.title}</h3>

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

              </div>

            </div>

          )}



          {/* TAB 3: REYTING */}

          {!subView && activeTab === 'reyting' && (

            <div className="space-y-5 animate-in fade-in duration-300">

              <h2 className="text-xl font-bold">Global XP Reyting</h2>



              {/* 11-Level Special Gift Banner */}

              <div className="bg-gradient-to-r from-red-500/20 via-[#8B5CF6]/20 to-[#1D1729] p-4 rounded-2xl border border-red-500/30 flex items-center gap-4">

                <img src={settings.level11GiftPhoto} alt="Gift" className="w-16 h-16 rounded-xl object-cover border border-white/20" />

                <div>

                  <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded font-extrabold uppercase">11-Daraja Sovrini</span>

                  <h3 className="font-bold text-sm mt-1">{settings.level11GiftTitle}</h3>

                  <p className="text-[11px] text-[#A7A0B5]">8 000 XP to'plab 11-darajani tugatganlarga beriladi!</p>

                </div>

              </div>



              {/* Leaderboard List */}

              <div className="space-y-3">

                {sortedUsersByXP.map((u, idx) => {

                  const lvl = getUserLevelInfo(u.xp, u.proMonths, idx === 0);

                  return (

                    <div 

                      key={u.id} 

                      onClick={() => {

                        setCurrentUserId(u.id);

                        showToast(`Demo: Hozir ${u.name} profiliga o'tdingiz!`);

                      }}

                      className={`p-4 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${u.id === currentUser.id ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]' : 'bg-[#1D1729] border-white/10 hover:border-white/30'}`}>

                      <div className="flex items-center gap-3">

                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-extrabold text-xs ${idx === 0 ? 'bg-[#FBBF24] text-black' : 'bg-white/10 text-white'}`}>

                          {idx + 1}

                        </div>

                        <img src={u.avatar} alt={u.name} className={`w-10 h-10 rounded-full border-2 ${u.equipped.frame}`} />

                        <div>

                          <div className="font-bold text-sm flex items-center gap-1.5">

                            <span className={u.equipped.nameColor}>{u.name}</span>

                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${lvl.color === 'red' ? 'bg-red-500/20 text-red-400' : lvl.color === 'green' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>

                              {lvl.level} LVL

                            </span>

                          </div>

                          <div className="text-xs text-[#A7A0B5]">{u.xp} XP</div>

                        </div>

                      </div>

                      <div className="text-xs text-[#A7A0B5]">

                        {u.id === currentUser.id ? 'Siz' : 'Profilni tanlash'}

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

                          onClick={() => {

                            setChallenges(prev => prev.map(item => item.id === ch.id ? { ...item, votesA: item.votesA + 1, completedBy: [...item.completedBy, currentUser.id] } : item));

                            updateUserBalance(currentUser.id, settings.xpChallenge, settings.coinChallenge, `Kunlik Challenge bajarildi`);

                            showToast(`Tanlovingiz qabul qilindi! +${settings.xpChallenge} XP va +${settings.coinChallenge} Coin!`);

                          }}

                          className={`w-full p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${done ? 'border-[#8B5CF6] bg-black/40' : 'border-white/10 bg-black/30 hover:border-[#8B5CF6]'}`}>

                          <div className="flex justify-between items-center relative z-10 text-sm font-semibold">

                            <span>{ch.optionA}</span>

                            {done && <span className="text-[#C4B5FD]">{pctA}%</span>}

                          </div>

                        </button>



                        <button

                          disabled={done}

                          onClick={() => {

                            setChallenges(prev => prev.map(item => item.id === ch.id ? { ...item, votesB: item.votesB + 1, completedBy: [...item.completedBy, currentUser.id] } : item));

                            updateUserBalance(currentUser.id, settings.xpChallenge, settings.coinChallenge, `Kunlik Challenge bajarildi`);

                            showToast(`Tanlovingiz qabul qilindi! +${settings.xpChallenge} XP va +${settings.coinChallenge} Coin!`);

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

                {/* Avatar (Unlocked at Level 2+) */}

                <div className="relative w-24 h-24 mx-auto mb-3">

                  {userLevel.level >= 2 ? (

                    <img 

                      src={currentUser.avatar} 

                      alt="avatar" 

                      className={`w-full h-full rounded-full object-cover border-4 ${currentUser.equipped.frame} ${currentUser.equipped.anim}`} 

                    />

                  ) : (

                    <div className="w-full h-full rounded-full bg-black/50 border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-xs text-[#A7A0B5]">

                      <Lock size={20} />

                      <span className="text-[9px] mt-1">2-LVLda ochiladi</span>

                    </div>

                  )}

                </div>



                <h2 className={`text-2xl font-bold ${currentUser.equipped.nameColor} ${currentUser.equipped.font}`}>

                  {currentUser.name}

                </h2>

                <p className="text-xs text-[#A7A0B5] mt-0.5">@{currentUser.username} • ID: {currentUser.id}</p>



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
