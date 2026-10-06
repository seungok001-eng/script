/* 보카핏 토익 — 화면 (바닐라 JS, 빌드 없음). 로직은 core.js, 데이터는 data.js */
(function () {
  "use strict";
  const D = window.VOCA_DATA;
  // 하프 모의고사 전용 Part 2 표현은 LC 표현 목록·퀴즈에서 뺀다 (모의고사에서 처음 보도록). 모의고사는 D.lcAll 에서 찾는다
  D.lcAll = D.lc || [];
  D.lc = D.lcAll.filter((p) => !p.mock);
  const C = window.Core;
  const BRAND = { name: "보카핏 토익", short: "보카핏", en: "VocaFit TOEIC" };
  // 유료화 스위치: enabled=true 로 바꾸면 freeDays 이후 Day는 프리미엄(인앱결제 연결 지점: purchasePremium)
  const CONFIG = { premium: { enabled: false, freeDays: 5, price: "₩9,900", priceNote: "평생 이용 · 1회 결제" } };
  const STORE_KEY = "vocafit.v1";

  const WORDS = D.words;
  const BY_ID = new Map(WORDS.map((w) => [w.id, w]));
  // 데이터가 들어온 Day 만 보여 준다 (계획이 작성보다 앞서 있어도 빈 Day 가 나오지 않게)
  const DAYS = D.days.filter((d) => d.count > 0);
  const DAY_BY = new Map(DAYS.map((d) => [d.day, d]));
  const NDAYS = DAYS.length ? DAYS[DAYS.length - 1].day : 0;
  const BASIC_DAYS = Math.min(30, NDAYS); // Day 1~30 기본 코스, 31~ 심화 코스
  const NWORDS = WORDS.length.toLocaleString();
  // 30일 단위 코스: 같은 30개 주제를 기본 → 심화 → 실전으로 세 번 넓혀 간다
  const COURSES = [
    { name: "기본 코스", from: 1, to: 30, desc: "주제별 필수 어휘" },
    { name: "심화 코스", from: 31, to: 60, desc: "같은 주제의 확장 어휘" },
    { name: "완성 코스", from: 61, to: 90, desc: "LC 표현 · 고득점 어휘" },
  ];
  const POS_KO = { n: "명사", v: "동사", adj: "형용사", adv: "부사", phr: "숙어", prep: "전치사", conj: "접속사" };
  const POS_SHORT = { n: "명", v: "동", adj: "형", adv: "부", phr: "숙", prep: "전", conj: "접" };
  const $app = document.getElementById("app");

  // ═════════════ 저장소 ═════════════
  const DEFAULT_STATE = () => ({
    v: 1,
    profile: null, // { target, examDate, daily, start }
    settings: { theme: "system", autoWord: true, autoEx: false, rate: 1, showKo: true, readKo: true, hideMeaning: false, sfx: true, remind: false, remindAt: "21:00", lcScript: false },
    words: {},
    log: {},
    tests: {},
    lc: {}, // LC 퀴즈 기록 { "lc-12": { ok, ng, last, wrong } }
    prac: {}, // 실전 세트 기록 { "p3-001": { ok, n, last } }
    gq: {}, // 문법 문제 기록 { "g03-07": { ok, ng, last, wrong } }
    qt: {}, // 문제 유형별 정답률 { "p7:추론": { ok, n } }
    pr: { lc: [], rc: [] }, // 최근 LC/RC 정오 (예상 점수)
    mock: {}, // 모의고사 { 1: { lc, rc, total, best, at } }
    premium: false,
  });
  let S = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch (e) { /* 저장소를 못 쓰면 새로 시작 */ }
    return DEFAULT_STATE();
  }
  // 숫자·날짜·설정을 정해진 형태로만 받아들인다 (손상된 저장값이나 조작된 백업 대비)
  function sanitize(src) {
    const d = DEFAULT_STATE();
    const num = (v, def, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def; };
    if (src && src.profile && typeof src.profile === "object") {
      const p = src.profile;
      d.profile = {
        target: C.SCORE_OPTIONS.includes(+p.target) ? +p.target : 800,
        examDate: C.parseYmd(p.examDate) != null ? p.examDate : null,
        daily: num(p.daily, 30, 5, 200),
        start: num(p.start, C.dayNum(), 0, 1e6),
      };
      if (Array.isArray(p.skip)) d.profile.skip = p.skip.filter((t) => t === 1 || t === 2);
      if (p.placed) d.profile.placed = true;
    }
    const ss = (src && src.settings) || {};
    for (const k of Object.keys(d.settings)) {
      if (typeof d.settings[k] === "boolean" && typeof ss[k] === "boolean") d.settings[k] = ss[k];
    }
    if (["system", "light", "dark"].includes(ss.theme)) d.settings.theme = ss.theme;
    if ([0.8, 1, 1.2].includes(+ss.rate)) d.settings.rate = +ss.rate;
    if (/^\d{2}:\d{2}$/.test(ss.remindAt || "")) d.settings.remindAt = ss.remindAt;
    const ws = (src && src.words) || {};
    for (const id of Object.keys(ws)) {
      if (!BY_ID.has(id) || !ws[id] || typeof ws[id] !== "object") continue;
      const w = ws[id];
      const o = { b: num(w.b, 0, 0, C.INTERVALS.length - 1), due: num(w.due, 0, 0, 1e6), n: num(w.n, 0, 0, 1e6), ok: num(w.ok, 0, 0, 1e6), ng: num(w.ng, 0, 0, 1e6), last: num(w.last, 0, 0, 1e6) };
      if (w.first != null) o.first = num(w.first, 0, 0, 1e6);
      if (w.star) o.star = true;
      if (w.wrong) o.wrong = true;
      d.words[id] = o;
    }
    const lg = (src && src.log) || {};
    for (const k of Object.keys(lg)) {
      if (!/^\d+$/.test(k) || !lg[k]) continue;
      const l = lg[k];
      d.log[k] = { new: num(l.new, 0, 0, 1e5), rev: num(l.rev, 0, 0, 1e5), q: num(l.q, 0, 0, 1e5), ok: num(l.ok, 0, 0, 1e5), sec: num(l.sec, 0, 0, 1e6) };
      if (l.done) d.log[k].done = true;
      if (l.prac) d.log[k].prac = true;
    }
    const ts = (src && src.tests) || {};
    for (const k of Object.keys(ts)) {
      const dn = +k;
      if (!(dn >= 1 && dn <= D.days.length) || !ts[k]) continue;
      d.tests[dn] = { best: num(ts[k].best, 0, 0, 100), last: num(ts[k].last, 0, 0, 100), at: num(ts[k].at, 0, 0, 1e6) };
    }
    const lcIds = new Set((D.lc || []).map((p) => p.id));
    const ls = (src && src.lc) || {};
    for (const id of Object.keys(ls)) {
      if (!lcIds.has(id) || !ls[id] || typeof ls[id] !== "object") continue;
      d.lc[id] = { ok: num(ls[id].ok, 0, 0, 1e6), ng: num(ls[id].ng, 0, 0, 1e6), last: num(ls[id].last, 0, 0, 1e6) };
      if (ls[id].wrong) d.lc[id].wrong = true;
    }
    const idOk = (k) => typeof k === "string" && /^[a-z0-9:·\- \u3131-\uD79D]{1,60}$/i.test(k);
    const pc = (src && src.prac) || {};
    for (const k of Object.keys(pc)) if (idOk(k) && pc[k] && typeof pc[k] === "object") d.prac[k] = { ok: num(pc[k].ok, 0, 0, 20), n: num(pc[k].n, 1, 1, 20), last: num(pc[k].last, 0, 0, 1e6) };
    const gq = (src && src.gq) || {};
    for (const k of Object.keys(gq)) if (idOk(k) && gq[k] && typeof gq[k] === "object") { d.gq[k] = { ok: num(gq[k].ok, 0, 0, 1e6), ng: num(gq[k].ng, 0, 0, 1e6), last: num(gq[k].last, 0, 0, 1e6) }; if (gq[k].wrong) d.gq[k].wrong = true; }
    const qt = (src && src.qt) || {};
    const qtOk = (k) => typeof k === "string" && k.length <= 90 && /^p\d{1,2}:/.test(k) && !/[<>"'&]/.test(k);
    for (const k of Object.keys(qt)) if (qtOk(k) && qt[k] && typeof qt[k] === "object") { const n = num(qt[k].n, 0, 0, 1e6); if (n) d.qt[k] = { ok: Math.min(n, num(qt[k].ok, 0, 0, 1e6)), n }; }
    const pr = (src && src.pr) || {};
    for (const sec of ["lc", "rc"]) if (Array.isArray(pr[sec])) d.pr[sec] = pr[sec].slice(-120).map((x) => (x ? 1 : 0));
    const mk = (src && src.mock) || {};
    for (const k of Object.keys(mk)) if (/^\d{1,2}$/.test(k) && mk[k]) { const total = num(mk[k].total, 10, 10, 990); d.mock[k] = { lc: num(mk[k].lc, 5, 5, 495), rc: num(mk[k].rc, 5, 5, 495), total, best: num(mk[k].best, 10, 10, 990), at: num(mk[k].at, 0, 0, 1e6), n: num(mk[k].n, 1, 1, 999), first: num(mk[k].first, total, 10, 990) }; }
    const mr = src && src.mockRun;
    if (mr && /^\d{1,2}$/.test(String(mr.n)) && Array.isArray(mr.picks)) {
      d.mockRun = { n: +mr.n, i: num(mr.i, 0, 0, 500), picks: mr.picks.slice(0, 500).map((a) => (Array.isArray(a) ? a.slice(0, 10).map((x) => (Number.isInteger(x) && x >= 0 && x <= 3 ? x : null)) : [])), rcUsed: mr.rcUsed == null ? null : num(mr.rcUsed, 0, 0, 1e8), at: num(mr.at, 0, 0, 1e6) };
    }
    d.premium = !!(src && src.premium);
    return d;
  }
  let saveTimer = 0;
  function save(now) {
    clearTimeout(saveTimer);
    const run = () => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast("저장 공간이 부족해 기록을 저장하지 못했어요"); }
    };
    if (now) run();
    else saveTimer = setTimeout(run, 250);
  }
  window.addEventListener("pagehide", () => save(true));
  document.addEventListener("visibilitychange", () => { if (document.hidden) save(true); });

  const today = () => C.dayNum();
  function logToday() {
    const t = today();
    if (!S.log[t]) S.log[t] = { new: 0, rev: 0, q: 0, ok: 0, sec: 0 };
    return S.log[t];
  }
  function markDone() {
    const l = logToday();
    if (!l.done) {
      l.done = true;
      save();
    }
  }
  function st(id) { return S.words[id]; }
  function setSt(id, s) { S.words[id] = s; }

  // ═════════════ 범위 ═════════════
  function target() { return (S.profile && S.profile.target) || 800; }
  // 목표 범위의 단어를 학습 순서대로: 기본 → 핵심 → 고득점, 같은 단계 안에서는 Day 순서
  const ORDERED = WORDS.slice().sort((a, b) => a.tier - b.tier || a.d - b.d || (a.id < b.id ? -1 : 1));
  // 어휘 진단으로 '이미 아는 난이도'를 건너뛸 수 있다 (profile.skip). 목표 범위가 비지 않게 한다
  function myTiers() {
    const ts = C.tiersFor(target());
    const sk = (S.profile && S.profile.skip) || [];
    const left = ts.filter((t) => !sk.includes(t));
    return left.length ? left : ts;
  }
  function pool() { const ts = myTiers(); return ORDERED.filter((w) => ts.includes(w.tier)); }
  function inPool(w) { return myTiers().includes(w.tier); }
  function dayWords(d, all) { return WORDS.filter((w) => w.d === d && (all || inPool(w))); }
  // 복습할 단어: 범위와 상관없이 이미 배운 단어 중 복습일이 된 것 (오늘 처음 본 단어는 제외), 오래된 순
  function dueWords(t) { return C.todayPlan(WORDS, S.words, 0, t).due; }
  function canAccessDay(d) { return !CONFIG.premium.enabled || S.premium || d <= CONFIG.premium.freeDays; }

  // ═════════════ 유틸 ═════════════
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function hl(ex) { return esc(ex).replace(/\*([^*]+)\*/g, "<mark>$1</mark>"); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function voiceLabel(v) {
    if (!v) return "";
    if (v.includes("+")) return "대화";
    const acc = v[0] === "b" ? "영국" : "미국";
    const sex = v[1] === "m" ? "남" : "여";
    return `${acc}·${sex}`;
  }
  function fmtDate(n) {
    const d = C.dayToDate(n);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  function dueLabel(days) { return days <= 1 ? "내일 복습" : `${days}일 뒤`; }
  // 버튼·입력칸에 포커스가 있을 때 Space/Enter 는 그 컨트롤의 기본 동작에 맡긴다
  function onControl(e) { return (e.key === " " || e.key === "Enter") && e.target && e.target.closest && !!e.target.closest("button,input,a,select,textarea,[role=link]"); }
  function capPlugins() { return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? window.Capacitor.Plugins : null; }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 무시 */ } }

  // ═════════════ 아이콘 (Lucide 스타일, ISC) ═════════════
  const I = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/>',
    repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 4 3 5-7"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    vol: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.3 1.6 1.3 2.8 2.5 2.8z"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
    split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.2-2.9L3 3"/><path d="m15 9 6-6"/>',
    pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    crown: '<path d="m2 7 5 5 5-8 5 8 5-5-2 12H4z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
    next: '<path d="M5 4v16l10-8zM19 5v14"/>',
    prev: '<path d="M19 20V4L9 12zM5 19V5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><path d="M3 3l18 18"/><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    ear: '<path d="M6 8.5a6 6 0 1 1 12 0c0 6-6 6-6 10a3 3 0 0 1-6 0"/><path d="M10 8.5a2 2 0 1 1 4 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sparkle: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
    flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
    swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h13a4 4 0 0 1 4 4"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8a4 4 0 0 1-4-4"/>',
    gauge: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  };
  function ico(name, cls) {
    return `<svg class="ico ${cls || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ""}</svg>`;
  }
  function starIco(on) {
    return `<svg class="ico star ${on ? "on" : ""}" viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${I.star}</svg>`;
  }
  function logoSvg(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b82ff"/><stop offset="1" stop-color="#1a3bb8"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#lg)"/><path d="M17 20h9l6 18 6-18h9L36 46h-8z" fill="#fff"/><circle cx="47" cy="46" r="4" fill="#ffb648"/></svg>`;
  }

  // ═════════════ 토스트 / 모달 ═════════════
  let toastTimer = 0;
  function toast(msg) {
    const w = document.getElementById("toast");
    w.innerHTML = `<div class="toast">${esc(msg)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { w.innerHTML = ""; }, 2200);
  }
  function modal(html, onMount) {
    closeModal();
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.id = "modal";
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    bg.addEventListener("click", (e) => { if (e.target === bg) closeModal(); });
    document.body.appendChild(bg);
    bg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
    if (onMount) onMount(bg);
    const f = bg.querySelector("input,button");
    if (f && window.matchMedia("(hover: hover)").matches) f.focus();
  }
  function closeModal() { const m = document.getElementById("modal"); if (m) m.remove(); }
  function confirmBox(title, text, okLabel, danger) {
    return new Promise((res) => {
      modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="row"><button class="btn ghost" data-r="0">취소</button><button class="btn ${danger ? "danger" : ""}" data-r="1">${esc(okLabel || "확인")}</button></div>`, (m) => {
        m.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => { closeModal(); res(b.dataset.r === "1"); }));
      });
    });
  }

  // ═════════════ 소리 ═════════════
  // 음성 묶음 모드: window.VOCA_AUDIO_PACKS = { index: { "w/01-01.mp3": [묶음파일, 시작, 길이] } }
  // (파일 수 제한이 있는 웹 미리보기용. 앱·일반 배포는 audio/ 아래 개별 mp3 를 그대로 쓴다)
  const PACKS = window.VOCA_AUDIO_PACKS || null;
  const packBufs = new Map();
  const packUrls = new Map();
  async function packedUrl(rel) {
    if (packUrls.has(rel)) return packUrls.get(rel);
    const e = PACKS.index[rel];
    if (!e) return null;
    let buf = packBufs.get(e[0]);
    if (!buf) {
      buf = fetch(`audio/${e[0]}`).then((r) => { if (!r.ok) throw new Error("pack"); return r.arrayBuffer(); });
      packBufs.set(e[0], buf);
      buf.catch(() => packBufs.delete(e[0]));
    }
    const ab = await buf;
    const url = URL.createObjectURL(new Blob([ab.slice(e[1], e[1] + e[2])], { type: "audio/mpeg" }));
    packUrls.set(rel, url);
    return url;
  }
  const Sound = (function () {
    const el = new Audio();
    el.preload = "auto";
    let token = 0;
    let pendingFin = null;
    let koVoice = null;
    let enVoice = null;
    // 네이티브 앱: @capacitor-community/text-to-speech (기기 TTS 엔진)
    const NT = () => { const P = capPlugins(); return P && P.TextToSpeech; };
    let nativeKo = false;
    if (NT()) NT().getSupportedLanguages().then((r) => { nativeKo = (r.languages || []).some((l) => /^ko/i.test(l)); }).catch(() => {});
    function pickVoices() {
      if (!("speechSynthesis" in window)) return;
      const vs = speechSynthesis.getVoices();
      koVoice = vs.find((v) => /ko(-|_)KR/i.test(v.lang)) || null;
      enVoice = vs.find((v) => /en(-|_)US/i.test(v.lang) && /Google|Samantha|Aria|Jenny|Natural/i.test(v.name)) || vs.find((v) => /en(-|_)US/i.test(v.lang)) || null;
    }
    if ("speechSynthesis" in window) {
      pickVoices();
      speechSynthesis.onvoiceschanged = pickVoices;
    }
    function stop() {
      token += 1;
      if (pendingFin) { const f = pendingFin; pendingFin = null; f(false); }
      try { el.pause(); } catch (e) { /* 무시 */ }
      if (NT()) NT().stop().catch(() => {});
      else if ("speechSynthesis" in window) speechSynthesis.cancel();
      document.querySelectorAll(".play.playing").forEach((b) => b.classList.remove("playing"));
    }
    function tts(text, lang, my) {
      if (NT()) {
        if (my !== token) return Promise.resolve(false);
        return NT().speak({ text, lang: lang || "en-US", rate: lang === "ko-KR" ? 1.0 : 0.95 * S.settings.rate, volume: 1, category: "playback" })
          .then(() => my === token, () => false);
      }
      return new Promise((res) => {
        if (!("speechSynthesis" in window) || my !== token) return res(false);
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang || "en-US";
        if (lang === "ko-KR" && koVoice) u.voice = koVoice;
        if (lang !== "ko-KR" && enVoice) u.voice = enVoice;
        u.rate = lang === "ko-KR" ? 1.05 : 0.95 * S.settings.rate;
        let done = false;
        const fin = (ok) => { if (!done) { done = true; res(ok); } };
        u.onend = () => fin(true);
        u.onerror = () => fin(false);
        speechSynthesis.speak(u);
        setTimeout(() => fin(false), 12000 + text.length * 120);
      });
    }
    // rel(audio/ 아래 mp3 경로)을 재생하고 끝나면 resolve. 파일이 없거나 실패하면 기기 음성(TTS)으로 대신 읽는다
    async function play(rel, text, opt) {
      stop();
      const my = token;
      let src = null;
      if (rel) {
        if (!PACKS) src = `audio/${rel}`;
        else {
          try { src = await packedUrl(rel); } catch (e) { src = null; }
          if (my !== token) return false;
        }
      }
      const btn = opt && opt.btn;
      if (btn) btn.classList.add("playing");
      const end = (v) => { if (btn) btn.classList.remove("playing"); return v; };
      if (!src) return tts(text, "en-US", my).then(end);
      return new Promise((res) => {
        let settled = false;
        const fin = (ok) => {
          if (settled) return;
          settled = true;
          if (pendingFin === fin) pendingFin = null;
          el.onended = el.onerror = null;
          // 파일이 없거나 못 읽을 때만 기기 음성으로 대신 읽는다 (자동재생 차단은 조용히 넘어간다)
          if (ok === false && my === token) tts(text, "en-US", my).then((v) => res(end(v)));
          else res(end(ok === true));
        };
        pendingFin = fin;
        el.onended = () => fin(true);
        el.onerror = () => fin(false);
        el.src = src;
        el.playbackRate = (opt && opt.rate) || S.settings.rate;
        const p = el.play();
        if (p && p.catch) p.catch((err) => fin(err && err.name === "NotAllowedError" ? "blocked" : false));
      });
    }
    function word(w, btn) { return play(w.au ? `w/${w.id}.mp3` : null, w.w, { btn }); }
    function example(w, btn) { return play(w.exAu ? `s/${w.id}.mp3` : null, C.plainEx(w.ex), { btn }); }
    function ko(text) { const my = token; return hasKo() ? tts(text, "ko-KR", my) : Promise.resolve(false); }
    function hasKo() { return NT() ? nativeKo : !!koVoice; }
    function current() { return token; }
    return { play, word, example, ko, stop, hasKo, current };
  })();
  // 효과음 (Web Audio로 짧게 만든다 — 파일 없음)
  const Sfx = (function () {
    let ctx = null;
    function beep(freqs, dur) {
      if (!S.settings.sfx) return;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        let t = ctx.currentTime;
        freqs.forEach((f) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "sine";
          o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(g).connect(ctx.destination);
          o.start(t);
          o.stop(t + dur + 0.02);
          t += dur * 0.6;
        });
      } catch (e) { /* 무시 */ }
    }
    return { ok: () => beep([880, 1320], 0.12), bad: () => beep([220, 180], 0.16) };
  })();

  // ═════════════ 학습 알림 (네이티브 앱: @capacitor/local-notifications) ═════════════
  const Notify = (function () {
    const plugin = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
    const MSGS = ["오늘의 토익 단어가 기다리고 있어요 📚", "5분만 투자해도 목표 점수에 가까워져요", "복습할 단어가 쌓이기 전에 한 번 볼까요?", "연속 학습 기록을 이어가세요 🔥"];
    async function apply() {
      const LN = plugin();
      if (!LN) return false;
      try {
        await LN.cancel({ notifications: [{ id: 1001 }] }).catch(() => {});
        if (!S.settings.remind) return true;
        const perm = await LN.requestPermissions();
        if (perm.display !== "granted") return false;
        const [h, m] = (S.settings.remindAt || "21:00").split(":").map(Number);
        await LN.schedule({ notifications: [{ id: 1001, title: BRAND.name, body: MSGS[Math.floor(Math.random() * MSGS.length)], schedule: { on: { hour: h, minute: m }, repeats: true, allowWhileIdle: true } }] });
        return true;
      } catch (e) { return false; }
    }
    return { available: () => !!plugin(), apply };
  })();

  // ═════════════ 라우터 ═════════════
  let session = null; // 진행 중인 학습
  let seqId = 0; // 목록 연속 재생 취소용
  let studyPushed = false; // 학습 화면을 기록(history)에 쌓았는지 — 나갈 때 history.back()으로 돌아간다
  function enterStudy() {
    if (location.hash === "#/study") render();
    else { studyPushed = true; location.hash = "#/study"; }
  }
  let keyHandler = null;
  let ui = { dayFilter: "all", dayAll: false, p1g: "all", reviewTab: "due", searchQ: "", course: null };
  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [path, qs] = h.split("?");
    const parts = path.split("/").filter(Boolean);
    const q = {};
    (qs || "").split("&").filter(Boolean).forEach((kv) => { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v || ""); });
    return { name: parts[0] || "home", arg: parts[1], q };
  }
  window.addEventListener("hashchange", () => {
    seqId += 1;
    lineSeq += 1;
    lcqSeq += 1;
    Sound.stop();
    // 뒤로가기 등으로 학습 화면을 벗어나면 진행 중이던 세션을 끝낸다 (기록은 이미 저장됨)
    if (route().name !== "study") { session = null; studyPushed = false; }
    render();
  });

  function render() {
    closeModal();
    keyHandler = null;
    const r = route();
    document.body.classList.toggle("in-study", r.name === "study" || r.name === "onboarding");
    if (!S.profile && r.name !== "onboarding") return go("#/onboarding");
    const views = { onboarding: vOnboarding, home: vHome, days: vDays, day: vDay, word: vWord, study: vStudy, review: vReview, part1: vPart1, conf: vConf, lc: vLc, practice: vPractice, sets: vSets, grammar: vGrammar, dict: vDict, mock: vMock, search: vSearch, stats: vStats, settings: vSettings, licenses: vLicenses, premium: vPremium };
    const v = views[r.name] || vHome;
    v(r);
    window.scrollTo(0, 0);
  }

  // 공통 껍데기 (사이드바 + 하단 탭)
  const NAV = [
    ["home", "홈", "home"],
    ["days", "단어장", "book"],
    ["practice", "실전", "target"],
    ["review", "복습", "repeat"],
    ["stats", "통계", "chart"],
  ];
  function shell(active, body, wide) {
    const links = NAV.map(([k, label, ic]) => `<a href="#/${k}" class="side-link ${active === k ? "on" : ""}">${ico(ic)}${label}</a>`).join("");
    const tabs = NAV.map(([k, label, ic]) => `<a href="#/${k}" class="tab ${active === k ? "on" : ""}" aria-label="${label}">${ico(ic)}${label}</a>`).join("");
    $app.innerHTML = `<div class="shell">
      <nav class="side" aria-label="메뉴"><div class="side-brand">${logoSvg(30)}<span>${BRAND.name}</span></div>${links}
        <a href="#/settings" class="side-link ${active === "settings" ? "on" : ""}">${ico("gear")}설정</a>
        <div class="side-sep"></div>
        <a href="#/search" class="side-link ${active === "search" ? "on" : ""}">${ico("search")}단어 검색</a>
        <a href="#/part1" class="side-link ${active === "part1" ? "on" : ""}">${ico("camera")}Part 1 사진 표현</a>
        <a href="#/conf" class="side-link ${active === "conf" ? "on" : ""}">${ico("split")}혼동 어휘</a>
        ${(D.lc || []).length ? `<a href="#/lc" class="side-link ${active === "lc" ? "on" : ""}">${ico("ear")}LC 빈출 표현</a>` : ""}
        <div class="side-foot">목표 ${target()}점 · 단어 ${pool().length}개</div></nav>
      <main class="main"><div class="page ${wide ? "wide" : ""} fade-in">${body}</div></main>
      <nav class="tabbar" aria-label="탭">${tabs}</nav></div>`;
  }
  function topBar(title, opts) {
    const o = opts || {};
    return `<div class="top">${o.back ? `<button class="icon-btn back" data-act="back" aria-label="뒤로">${ico("left")}</button>` : ""}<h1>${title}${o.sub ? `<div class="sub">${o.sub}</div>` : ""}</h1>${o.right || ""}</div>`;
  }
  function back(fallback) {
    if (history.length > 1) history.back();
    else go(fallback || "#/home");
  }

  // 전역 클릭 위임 (data-act)
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const act = t.dataset.act;
    const id = t.dataset.id;
    if (act === "back") return back(t.dataset.fb);
    if (act === "play-word") { e.stopPropagation(); const w = BY_ID.get(id); if (w) Sound.word(w, t); return; }
    if (act === "play-ex") { e.stopPropagation(); const w = BY_ID.get(id); if (w) Sound.example(w, t); return; }
    if (act === "star") {
      e.stopPropagation();
      const s = S.words[id] || C.newState();
      s.star = !s.star;
      S.words[id] = s;
      save();
      t.innerHTML = starIco(s.star);
      toast(s.star ? "★ 중요 단어에 추가했어요" : "중요 단어에서 뺐어요");
      return;
    }
    if (act === "open-word") return go(`#/word/${id}`);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target && e.target.matches && e.target.matches('[data-act="open-word"]')) return go(`#/word/${e.target.dataset.id}`);
    if (document.getElementById("modal")) {
      if (e.key === "Escape") closeModal();
      return;
    }
    if (keyHandler && !e.metaKey && !e.ctrlKey && !e.altKey) keyHandler(e);
  });

  // ═════════════ 온보딩 ═════════════
  let onb = { step: 0, target: 800, exam: "", daily: 0 };
  function onbPool() { return C.poolFor(WORDS, onb.target).length; }
  function onbDaily() {
    const exam = C.parseYmd(onb.exam);
    return onb.daily || C.recommendDaily(onbPool(), exam, today());
  }
  function vOnboarding() {
    const editing = !!S.profile;
    if (editing && onb.step === 0) {
      onb = { step: 1, target: S.profile.target, exam: S.profile.examDate || "", daily: S.profile.daily };
    }
    const steps = 4;
    let body = "";
    if (onb.step === 0) {
      body = `<div class="welcome-art">${logoSvg(88)}</div>
        <h1 style="text-align:center">토익 단어,<br/>목표 점수만큼만 정확하게</h1>
        <p class="lead" style="text-align:center">목표 점수를 알려주시면 꼭 필요한 단어만 골라<br/>매일 학습 계획을 만들어 드려요.</p>
        <div class="feature-list">
          <div><span class="tico c-blue">${ico("target")}</span><span><b>목표 점수 맞춤 단어 ${NWORDS}개</b>${NDAYS > 30 ? `${NDAYS}일 · 기본/심화/완성 코스` : "30일 주제별"} · 기본/핵심/고득점 3단계</span></div>
          <div><span class="tico c-green">${ico("headphones")}</span><span><b>모든 단어·예문 원어민 음성</b>미국·영국 발음으로 토익 LC까지 대비</span></div>
          <div><span class="tico c-orange">${ico("repeat")}</span><span><b>잊을 때쯤 다시 나오는 복습</b>1·3·7·14·30일 간격 반복 + 오답노트</span></div>
          <div><span class="tico c-purple">${ico("trophy")}</span><span><b>Part 2~7 실전 문제 · 하프 모의고사</b>정답 근거까지 보여 주는 해설 · 예상 점수</span></div>
        </div>`;
    } else if (onb.step === 1) {
      const n = onbPool();
      const band = C.scoreBand(onb.target);
      body = `<div class="onb-step">1 / ${steps - 1}</div><h1>목표 점수가<br/>몇 점인가요?</h1><p class="lead">목표에 맞는 난이도의 단어만 학습해요. 나중에 언제든 바꿀 수 있어요.</p>
        <div class="score-grid">${C.SCORE_OPTIONS.map((s) => `<button class="score-opt ${onb.target === s ? "on" : ""}" data-score="${s}">${s}${s === 950 ? "+" : ""}<small>${s <= 650 ? "기본" : s <= 800 ? "핵심" : "고득점"}</small></button>`).join("")}</div>
        <div class="plan-box"><div class="pl"><span>학습 범위</span><b>${band.label}</b></div><div class="pl"><span>${band.desc}</span><b>${n.toLocaleString()}개</b></div></div>`;
    } else if (onb.step === 2) {
      const presets = [[14, "2주 뒤"], [30, "1개월 뒤"], [60, "2개월 뒤"], [90, "3개월 뒤"]];
      body = `<div class="onb-step">2 / ${steps - 1}</div><h1>시험은 언제인가요?</h1><p class="lead">시험일에 맞춰 하루 학습량을 계산해요. 정하지 않았다면 건너뛰어도 돼요.</p>
        <div class="chips" style="margin-bottom:14px">${presets.map(([d, l]) => `<button class="chip ${onb.exam === C.ymd(today() + d) ? "on" : ""}" data-exam="${C.ymd(today() + d)}">${l}</button>`).join("")}<button class="chip ${!onb.exam ? "on" : ""}" data-exam="">아직 몰라요</button></div>
        <input type="date" class="field" id="examInput" value="${esc(onb.exam)}" min="${C.ymd(today() + 1)}" aria-label="시험일" />
        ${onb.exam ? `<div class="plan-box"><div class="pl"><span>시험까지</span><b>D-${C.parseYmd(onb.exam) - today()}</b></div></div>` : ""}`;
    } else {
      const n = onbPool();
      const rec = C.recommendDaily(n, C.parseYmd(onb.exam), today());
      const daily = onbDaily();
      const days = Math.ceil(n / daily);
      const opts = Array.from(new Set([10, 20, 30, 40, 50, 60, rec])).sort((a, b) => a - b);
      body = `<div class="onb-step">3 / ${steps - 1}</div><h1>하루에 몇 개씩<br/>외워 볼까요?</h1><p class="lead">새 단어 기준이에요. 복습 단어는 따로 나와요.</p>
        <div class="chips">${opts.map((d) => `<button class="chip ${daily === d ? "on" : ""}" data-daily="${d}">${d}개${d === rec ? " · 추천" : ""}</button>`).join("")}</div>
        <div class="plan-box">
          <div class="pl"><span>목표 점수</span><b>${onb.target}점</b></div>
          <div class="pl"><span>학습 단어</span><b>${n.toLocaleString()}개</b></div>
          <div class="pl"><span>하루 새 단어</span><b>${daily}개</b></div>
          <div class="pl"><span>1회독 완료</span><b>${days}일 뒤 (${fmtDate(today() + days - 1)})</b></div>
          ${onb.exam ? `<div class="pl"><span>시험일</span><b>${fmtDate(C.parseYmd(onb.exam))} (D-${C.parseYmd(onb.exam) - today()})</b></div>` : ""}
        </div>
        ${(() => {
          // 시험 전에 1회독이 안 되면 숨기지 않고 알려 준다 (쉬운 단어부터 나오므로 볼 수 있는 범위를 안내)
          if (!onb.exam) return "";
          const left = C.parseYmd(onb.exam) - today();
          const cover = Math.min(n, daily * Math.max(0, left));
          if (cover >= n) return "";
          return `<div class="tip-box" style="margin-top:12px;background:var(--bad-soft)"><b>시험 전 1회독은 어려워요</b> 시험일까지 ${cover.toLocaleString()}개를 볼 수 있어요(쉬운 단어부터 순서대로). ${daily < 80 ? "하루 학습량을 늘리거나, " : ""}남은 시간에는 <b>실전 문제</b>로 자주 나오는 표현을 익히는 걸 추천해요.</div>`;
        })()}`;
    }
    const foot = onb.step === 0
      ? `<button class="btn block" data-next>시작하기</button>`
      : `<button class="btn ghost" data-prev style="flex:0 0 96px">${editing && onb.step === 1 ? "취소" : "이전"}</button><button class="btn" style="flex:1" data-next>${onb.step === 3 ? (editing ? "저장" : "학습 시작하기") : "다음"}</button>`;
    $app.innerHTML = `<div class="onb fade-in">${body}<div class="onb-foot">${foot}</div></div>`;
    $app.querySelectorAll("[data-score]").forEach((b) => b.addEventListener("click", () => { onb.target = +b.dataset.score; onb.daily = 0; vOnboarding(); }));
    $app.querySelectorAll("[data-exam]").forEach((b) => b.addEventListener("click", () => { onb.exam = b.dataset.exam; onb.daily = 0; vOnboarding(); }));
    const ei = document.getElementById("examInput");
    if (ei) ei.addEventListener("change", () => { onb.exam = ei.value; onb.daily = 0; vOnboarding(); });
    $app.querySelectorAll("[data-daily]").forEach((b) => b.addEventListener("click", () => { onb.daily = +b.dataset.daily; vOnboarding(); }));
    const prev = $app.querySelector("[data-prev]");
    if (prev) prev.addEventListener("click", () => {
      if (editing && onb.step === 1) { onb = { step: 0, target: 800, exam: "", daily: 0 }; return go("#/settings"); }
      onb.step -= 1;
      vOnboarding();
    });
    $app.querySelector("[data-next]").addEventListener("click", () => {
      if (onb.step < 3) { onb.step += 1; return vOnboarding(); }
      const p = S.profile || { start: today() };
      S.profile = Object.assign(p, { target: onb.target, examDate: onb.exam || null, daily: onbDaily() });
      save(true);
      onb = { step: 0, target: 800, exam: "", daily: 0 };
      toast(editing ? "학습 계획을 바꿨어요" : "학습 계획이 준비됐어요. 화이팅!");
      go(editing ? "#/settings" : "#/home");
    });
  }

  // ═════════════ 홈 ═════════════
  function ring(pct, size, stroke, color) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${pct}%"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color || "#fff"}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#fff" font-size="${size / 4.2}" font-weight="800">${pct}%</text></svg>`;
  }
  function vHome() {
    const t = today();
    const P = pool();
    const plan = C.todayPlan(P.filter((w) => canAccessDay(w.d)), S.words, S.profile.daily, t);
    plan.due = dueWords(t);
    const sum = C.summarize(P, S.words);
    const pct = P.length ? Math.round((sum.mastered / P.length) * 100) : 0;
    const streak = C.streak(S.log, t);
    const exam = C.parseYmd(S.profile.examDate);
    const dday = exam != null ? exam - t : null;
    const wrong = WORDS.filter((w) => st(w.id) && st(w.id).wrong).length;
    const introduced = P.filter((w) => st(w.id) && st(w.id).first === t);
    const newDone = plan.newWords.length === 0;
    const nextWord = plan.newWords[0];
    const hour = new Date().getHours();
    const hi = hour < 6 ? "늦은 밤에도 열공 중이시네요" : hour < 12 ? "좋은 아침이에요" : hour < 18 ? "오늘도 한 걸음 더" : "오늘 하루도 수고했어요";
    const l = S.log[t] || {};
    const task = practiceTaskToday(P, sum, t);
    const prog = C.todayProgress({ daily: S.profile.daily, introduced: plan.introducedToday, reviewed: l.rev || 0, due: plan.due.length, practiced: !!l.prac });
    const estMin = Math.ceil(plan.newWords.length * 0.4 + Math.min(plan.due.length, 100) * 0.15 + (l.prac ? 0 : task.min));
    const allDone = newDone && !plan.due.length && l.prac;
    // 오늘 할 일 순서: 복습 → 새 단어 → 오늘 단어 퀴즈 → 오늘의 실전 (잊기 전에 복습부터)
    const next = plan.due.length ? ["due", "repeat", `복습 ${Math.min(plan.due.length, 100)}개부터 시작`] : !newDone ? ["new", "play", `새 단어 ${plan.newWords.length}개 시작`] : !l.prac ? ["prac", "target", `오늘의 실전 · ${task.label}`] : introduced.length ? ["quiz-today", "zap", "오늘 단어 퀴즈로 마무리"] : null;
    const heroTitle = allDone ? "오늘 할 일 끝! 🎉" : plan.remaining === 0 && newDone ? "범위 1회독 완료! 복습과 실전으로" : `오늘의 학습`;
    const heroSub = allDone ? "내일도 이어서 해요 · 더 하고 싶다면 실전 탭에서" : `예상 ${Math.max(1, estMin)}분 · ${[plan.due.length ? `복습 ${Math.min(plan.due.length, 100)}` : "", !newDone ? `새 단어 ${plan.newWords.length}` : "", !l.prac ? "실전 1" : ""].filter(Boolean).join(" · ") || "남은 과제 없음"}`;
    const body = `
      <div class="top"><h1>${hi}</h1><a class="icon-btn" href="#/search" aria-label="검색">${ico("search")}</a><a class="icon-btn" href="#/settings" aria-label="설정">${ico("gear")}</a></div>
      <section class="hero">
        <div class="ring" aria-label="오늘 진행률 ${prog}%">${ring(prog, 76, 7)}</div>
        <div class="eyebrow">목표 ${target()}점 · ${C.scoreBand(target()).label}${nextWord ? ` · DAY ${pad(nextWord.d)}` : ""}</div>
        <div class="big">${heroTitle}</div>
        <div class="eyebrow">${heroSub}</div>
        <div class="meta">
          <div><b>${sum.mastered.toLocaleString()}</b>암기 완료</div>
          <div><b>${streak}일</b>연속 학습</div>
          <div><b>${dday != null ? (dday >= 0 ? "D-" + dday : "종료") : "–"}</b>시험까지</div>
        </div>
        ${next ? `<button class="btn block" data-go="${next[0]}">${ico(next[1])}${next[2]}</button>` : `<a class="btn block" href="#/practice">${ico("target")}실전 문제 더 풀기</a>`}
      </section>
      <div class="section"><div class="section-h"><h2>오늘 할 일</h2><span class="small muted">${fmtDate(t)}</span></div>
        <button class="task ${plan.due.length ? "" : "done"}" data-go="due"><span class="tico c-orange">${ico("repeat")}</span><span class="spacer"><div class="tt">복습하기</div><div class="td">${plan.due.length ? "잊어버리기 전에 다시 볼 단어 · 먼저 하면 기억이 오래가요" : l.rev ? `오늘 ${l.rev}개 복습 완료` : "오늘 복습할 단어가 없어요"}</div></span><span class="tn">${plan.due.length ? Math.min(plan.due.length, 100) : ico("check")}</span></button>
        <button class="task ${newDone ? "done" : ""}" data-go="new"><span class="tico c-blue">${ico("layers")}</span><span class="spacer"><div class="tt">새 단어 외우기${nextWord ? ` <span class="small muted" style="font-weight:600">DAY ${pad(nextWord.d)} · ${esc(DAY_BY.get(nextWord.d).title)}</span>` : ""}</div><div class="td">${newDone ? `오늘 ${plan.introducedToday}개 완료 · 더 하고 싶다면 단어장에서` : `카드로 뜻 확인 → 모르는 단어는 다시`}</div></span><span class="tn">${newDone ? ico("check") : plan.newWords.length}</span></button>
        <button class="task ${introduced.length ? "" : "done"}" data-go="quiz-today"><span class="tico c-purple">${ico("zap")}</span><span class="spacer"><div class="tt">오늘 단어 확인 퀴즈</div><div class="td">${introduced.length ? `오늘 본 ${introduced.length}개 · 뜻/단어/예문/Part 5 섞어서` : "새 단어를 외우면 열려요"}</div></span><span class="tn">${introduced.length || "–"}</span></button>
        <button class="task ${l.prac ? "done" : ""}" data-go="prac"><span class="tico c-green">${ico("target")}</span><span class="spacer"><div class="tt">오늘의 실전 · ${esc(task.label)}</div><div class="td">${l.prac ? "오늘 실전 완료 · 더 풀려면 실전 탭에서" : task.kind === "mock" ? "시험 2주 전 · 실전처럼 시간 재고 풀어 보세요" : `약 ${task.min}분 · 목표 ${target()}점에 맞춘 난이도`}</div></span><span class="tn">${l.prac ? ico("check") : ico("right")}</span></button>
        ${S.profile.placed ? "" : `<button class="task" data-go="place"><span class="tico c-green">${ico("gauge")}</span><span class="spacer"><div class="tt">3분 어휘 진단</div><div class="td">이미 아는 단어는 건너뛰고 필요한 단어부터</div></span><span class="tn">${ico("right")}</span></button>`}
        <button class="task ${wrong ? "" : "done"}" data-go="wrong"><span class="tico c-red">${ico("alert")}</span><span class="spacer"><div class="tt">오답노트</div><div class="td">${wrong ? "틀린 단어만 다시 풀어요" : "아직 틀린 단어가 없어요"}</div></span><span class="tn">${wrong || "–"}</span></button>
      </div>
      <div class="section"><div class="section-h"><h2>진도</h2><a href="#/stats">자세히</a></div>
        <div class="card">${progressBlock(P)}</div>
      </div>`;
    shell("home", body);
    $app.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => homeGo(b.dataset.go, plan, introduced)));
  }
  // 오늘의 실전 과제 (시험일·단어 진도·모의고사 기록 기준)
  function practiceTaskToday(P, sum, t) {
    const mocks = (PR && PR.mocks ? PR.mocks.length : 4);
    const taken = Object.keys(S.mock).length;
    const last = Object.values(S.mock).reduce((m, r) => Math.max(m, r.at || 0), 0) || null;
    const exam = C.parseYmd(S.profile.examDate);
    return C.practiceTask({ dday: exam != null ? exam - t : null, seenRatio: P.length ? sum.seen / P.length : 0, dayIndex: t - (S.profile.start || t), mocksLeft: mocks - taken, lastMockDay: last, today: t });
  }
  function startPracticeTask(task) {
    loadPractice().then(() => {
      const title = `오늘의 실전 · ${task.label}`;
      if (task.kind === "mock") return go("#/mock");
      if (task.kind === "p2") return startLcQuiz("resp", D.lc || [], task.n);
      if (task.kind === "p5g") {
        const qs = PR.grammar.flatMap((x) => x.qs.filter((q) => !q.mock));
        return startGrammarQuiz(C.lcPick(qs, S.gq, task.n), title);
      }
      startSets(task.kind, pickSets(practicePool(task.kind), task.n), title);
    }).catch(() => toast("문제를 불러오지 못했어요"));
  }
  function progressBlock(P) {
    const tiers = myTiers();
    return tiers.map((tier) => {
      const ws = P.filter((w) => w.tier === tier);
      const s = C.summarize(ws, S.words);
      const m = ws.length ? (s.mastered / ws.length) * 100 : 0;
      const l = ws.length ? (s.learning / ws.length) * 100 : 0;
      return `<div style="margin:6px 0 14px"><div class="row small" style="margin-bottom:6px"><span class="badge tier-${tier}">${C.TIER_NAMES[tier]}</span><span class="spacer"></span><span class="muted">${s.mastered} / ${ws.length} 완료</span></div>
        <div class="stack-bar"><i style="width:${m}%;background:var(--ok)"></i><i style="width:${l}%;background:var(--accent)"></i></div></div>`;
    }).join("") + `<div class="legend"><span><i style="background:var(--ok)"></i>암기 완료</span><span><i style="background:var(--accent)"></i>학습 중</span><span><i style="background:var(--bg-sunk);border:1px solid var(--line-strong)"></i>아직 안 봄</span></div>`;
  }
  function homeGo(what, plan, introduced) {
    const P = pool();
    if (what === "new") {
      if (!plan.newWords.length) {
        if (plan.remaining === 0) return toast("목표 범위의 단어를 모두 봤어요! 복습과 테스트로 굳혀 보세요");
        return toast("오늘 분량을 끝냈어요. 더 하려면 단어장에서 Day를 골라 주세요");
      }
      return startCard(plan.newWords, { title: "오늘의 새 단어", src: "today" });
    }
    if (what === "due") {
      if (!plan.due.length) return toast("오늘 복습할 단어가 없어요");
      return startCard(plan.due.slice(0, 100), { title: "복습", src: "due" });
    }
    if (what === "quiz-today") {
      if (!introduced.length) return toast("오늘 새 단어를 먼저 외워 주세요");
      return startQuiz(introduced, "mix", { title: "오늘 단어 퀴즈" });
    }
    if (what === "place") return startPlacement();
    if (what === "prac") {
      const t = today();
      if (S.log[t] && S.log[t].prac) return go("#/practice");
      return startPracticeTask(practiceTaskToday(P, C.summarize(P, S.words), t));
    }
    if (what === "wrong") {
      const ws = WORDS.filter((w) => st(w.id) && st(w.id).wrong);
      if (!ws.length) return toast("오답노트가 비어 있어요");
      return startQuiz(ws.slice(0, 40), "mix", { title: "오답노트", wrongNote: true });
    }
    if (what === "listen") {
      const seen = P.filter((w) => st(w.id) && st(w.id).n);
      const list = plan.newWords.length ? plan.newWords : seen.length ? C.shuffle(seen).slice(0, 40) : P.slice(0, 30);
      return startListen(list, { title: "듣기 모드" });
    }
    if (what === "para") {
      const seen = P.filter((w) => st(w.id) && st(w.id).n && C.canParaphrase(w));
      const base = seen.length >= 10 ? seen : P.filter(C.canParaphrase).slice(0, 80);
      return startQuiz(C.shuffle(base).slice(0, 20), "para", { title: "Part 7 동의어 20제" });
    }
    if (what === "part5") {
      const seen = P.filter((w) => st(w.id) && st(w.id).n);
      const base = seen.length >= 10 ? seen : P.slice(0, 80);
      return startQuiz(C.shuffle(base).slice(0, 20), "part5", { title: "Part 5 어휘 20제" });
    }
  }

  // ═════════════ 단어장 (Day 목록) ═════════════
  function vDays() {
    const P = pool();
    const plan = C.todayPlan(P, S.words, S.profile.daily, today());
    const curDay = plan.newWords[0] ? plan.newWords[0].d : 0;
    const card = (d) => {
      const ws = dayWords(d.day);
      const s = C.summarize(ws, S.words);
      const pct = ws.length ? Math.round((s.seen / ws.length) * 100) : 0;
      const mpct = ws.length ? Math.round((s.mastered / ws.length) * 100) : 0;
      const locked = !canAccessDay(d.day);
      const done = ws.length && s.mastered === ws.length;
      const test = S.tests[d.day];
      return `<a class="day-card ${d.day === curDay ? "cur" : ""} ${locked ? "lock" : ""}" href="#/day/${d.day}">
        ${locked ? `<span class="lock-ico">${ico("lock")}</span>` : done ? `<span class="done-ico">${ico("check")}</span>` : ""}
        <span class="dn">DAY ${pad(d.day)}${d.day === curDay ? " · 학습 중" : ""}</span>
        <span class="dt">${esc(d.title)}</span>
        <div class="bar thin ${mpct === 100 ? "ok" : ""}"><i style="width:${pct}%"></i></div>
        <span class="dm"><span>${s.seen}/${ws.length}개</span><span>${test ? `테스트 ${test.best}점` : ""}</span></span></a>`;
    };
    const section = (title, desc, list) => `<div class="section"><div class="section-h"><h2>${title}</h2><span class="small muted">${desc}</span></div><div class="grid2 grid-days">${list.map(card).join("")}</div></div>`;
    // 코스 탭: 기본 / 심화 / 실전 (처음엔 지금 학습 중인 Day 가 있는 코스)
    const courses = COURSES.filter((c) => DAYS.some((d) => d.day >= c.from && d.day <= c.to));
    if (ui.course == null || !courses[ui.course]) ui.course = Math.max(0, courses.findIndex((c) => curDay >= c.from && curDay <= c.to));
    const cur = courses[ui.course];
    const tabs = courses.length > 1 ? `<div class="seg" style="margin:6px 0 2px">${courses.map((c, i) => `<button class="${i === ui.course ? "on" : ""}" data-course="${i}">${c.name.replace(" 코스", "")}</button>`).join("")}</div>` : "";
    const cards = courses.length > 1
      ? tabs + section(cur.name, `DAY ${pad(cur.from)}~${pad(Math.min(cur.to, NDAYS))} · ${cur.desc}`, DAYS.filter((d) => d.day >= cur.from && d.day <= cur.to))
      : `<div class="grid2 grid-days">${DAYS.map(card).join("")}</div>`;
    const body = `${topBar("단어장", { sub: `목표 ${target()}점 · ${C.scoreBand(target()).label} · ${P.length.toLocaleString()}개`, right: `<a class="icon-btn" href="#/search" aria-label="검색">${ico("search")}</a>` })}
      <div class="chips scroll" style="margin-bottom:14px">
        <a class="chip" href="#/part1">${ico("camera")}Part 1 사진 표현</a>
        <a class="chip" href="#/conf">${ico("split")}혼동 어휘</a>
        ${(D.lc || []).length ? `<a class="chip" href="#/lc">${ico("ear")}LC 빈출 표현</a>` : ""}
        <a class="chip" href="#/review?tab=star">${ico("star")}중요 단어</a>
        <a class="chip" href="#/review?tab=wrong">${ico("alert")}오답노트</a>
      </div>
      <p class="small muted" style="margin:0 2px">오늘의 학습은 목표 범위 안에서 쉬운 단어(기본 → 핵심 → 고득점)부터 자동으로 골라 드려요. Day를 골라 직접 학습해도 진도에 반영돼요.</p>
      ${cards}`;
    shell("days", body, true);
    $app.querySelectorAll("[data-course]").forEach((b) => b.addEventListener("click", () => { ui.course = +b.dataset.course; vDays(); }));
  }

  // ═════════════ Day 상세 ═════════════
  function vDay(r) {
    const d = +r.arg;
    const day = DAY_BY.get(d);
    if (!day) return go("#/days");
    if (!canAccessDay(d)) return go("#/premium");
    const all = dayWords(d, true);
    const mine = dayWords(d);
    const base = ui.dayAll ? all : mine;
    const f = ui.dayFilter;
    const list = base.filter((w) => {
      const s = st(w.id);
      if (f === "new") return C.status(s) === "new";
      if (f === "learning") return C.status(s) === "learning";
      if (f === "mastered") return C.status(s) === "mastered";
      if (f === "star") return s && s.star;
      return true;
    });
    const sum = C.summarize(mine, S.words);
    const test = S.tests[d];
    const modes = [
      ["sort", "아는 단어 빼기", "check", "c-green"],
      ["card", "카드 암기", "layers", "c-blue"],
      ["meaning", "뜻 고르기", "list", "c-green"],
      ["word", "단어 고르기", "shuffle", "c-orange"],
      ["listen-q", "듣고 고르기", "ear", "c-purple"],
      ["spell", "철자 쓰기", "pencil", "c-gold"],
      ["cloze", "예문 빈칸", "bulb", "c-blue"],
      ["part5", "Part 5 어휘", "trophy", "c-purple"],
      ["para", "Part 7 동의어", "swap", "c-orange"],
    ];
    const items = list.map((w) => wordItem(w)).join("") || `<div class="empty">${ico("search")}<b>해당하는 단어가 없어요</b>필터를 바꿔 보세요</div>`;
    const hiddenCount = all.length - mine.length;
    const body = `${topBar(`DAY ${pad(d)}`, { back: true, sub: esc(day.title) + " · " + esc(day.titleEn), right: `${DAY_BY.has(d - 1) ? `<a class="icon-btn" href="#/day/${d - 1}" aria-label="이전 Day">${ico("left")}</a>` : ""}${DAY_BY.has(d + 1) ? `<a class="icon-btn" href="#/day/${d + 1}" aria-label="다음 Day">${ico("right")}</a>` : ""}` })}
      <div class="card"><div class="row"><div class="spacer"><div class="stat-num">${sum.mastered}<span class="muted" style="font-size:16px"> / ${mine.length}</span></div><div class="stat-lbl">암기 완료 · 학습 중 ${sum.learning}</div></div>
        ${test ? `<div style="text-align:right"><div class="stat-num" style="color:${test.best >= 80 ? "var(--ok)" : "var(--accent)"}">${test.best}<span style="font-size:16px">점</span></div><div class="stat-lbl">테스트 최고점</div></div>` : ""}</div>
        <div class="stack-bar" style="margin-top:12px"><i style="width:${mine.length ? (sum.mastered / mine.length) * 100 : 0}%;background:var(--ok)"></i><i style="width:${mine.length ? (sum.learning / mine.length) * 100 : 0}%;background:var(--accent)"></i></div></div>
      <div class="section"><div class="section-h"><h2>학습 방법</h2></div>
        <div class="grid3">${modes.map(([k, l, ic, c]) => `<button class="tile" data-mode="${k}" style="align-items:center;text-align:center;padding:14px 8px"><span class="tico ${c}">${ico(ic)}</span><b style="font-size:13.5px">${l}</b></button>`).join("")}</div>
        <button class="task" data-mode="listen" style="margin-top:10px"><span class="tico c-green">${ico("headphones")}</span><span class="spacer"><div class="tt">듣기 모드</div><div class="td">단어 → 뜻 → 예문 자동 재생 · 출퇴근길에</div></span>${ico("right")}</button>
        <button class="task" data-mode="test" style="margin-top:10px"><span class="tico c-red">${ico("flag")}</span><span class="spacer"><div class="tt">DAY ${pad(d)} 테스트</div><div class="td">20문제 · 80점 이상이면 통과${test ? ` · 최고 ${test.best}점` : ""}</div></span>${ico("right")}</button>
      </div>
      <div class="section"><div class="section-h"><h2>단어 ${list.length}개</h2><button data-toggle-hide>${S.settings.hideMeaning ? "뜻 보이기" : "뜻 가리기"}</button></div>
        <div class="chips scroll" style="margin-bottom:12px">${[["all", "전체"], ["new", "안 본 단어"], ["learning", "학습 중"], ["mastered", "암기 완료"], ["star", "★ 중요"]].map(([k, l]) => `<button class="chip ${f === k ? "on" : ""}" data-filter="${k}">${l}</button>`).join("")}
          ${hiddenCount > 0 || ui.dayAll ? `<button class="chip ${ui.dayAll ? "on" : ""}" data-all>${ui.dayAll ? "내 목표 범위만" : `목표 밖 단어 +${hiddenCount}`}</button>` : ""}</div>
        <div class="wlist">${items}</div></div>`;
    shell("days", body);
    $app.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => { ui.dayFilter = b.dataset.filter; vDay(r); }));
    const ab = $app.querySelector("[data-all]");
    if (ab) ab.addEventListener("click", () => { ui.dayAll = !ui.dayAll; vDay(r); });
    $app.querySelector("[data-toggle-hide]").addEventListener("click", () => { S.settings.hideMeaning = !S.settings.hideMeaning; save(); vDay(r); });
    $app.querySelectorAll(".witem.hide-m").forEach((el) => el.addEventListener("touchstart", () => el.classList.add("peek"), { passive: true }));
    $app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      const ws = list.length ? list : base;
      const m = b.dataset.mode;
      const title = `DAY ${pad(d)} · ${b.textContent.trim()}`;
      if (m === "card") return startCard(ws, { title });
      if (m === "sort") return startSort(ws.filter((w) => C.status(st(w.id)) !== "mastered"), { title });
      if (m === "listen") return startListen(ws, { title });
      if (m === "test") return startQuiz(base, "test", { title: `DAY ${pad(d)} 테스트`, day: d });
      if (m === "listen-q") return startQuiz(ws, "listen", { title });
      startQuiz(ws, m, { title });
    }));
  }
  function wordItem(w) {
    const s = st(w.id);
    return `<div class="witem ${S.settings.hideMeaning ? "hide-m" : ""}" data-act="open-word" data-id="${w.id}" role="link" tabindex="0" aria-label="${esc(w.w)} 상세 보기">
      <span class="dot ${C.status(s)}" title="${{ new: "안 봄", learning: "학습 중", mastered: "암기 완료" }[C.status(s)]}"></span>
      <div class="wbody"><div class="row" style="gap:8px"><span class="ww en">${esc(w.w)}</span><span class="badge tier-${w.tier}">${C.TIER_NAMES[w.tier]}</span></div>
      <div class="wm"><span class="muted">${POS_SHORT[w.pos] || ""}</span> ${esc(C.meaningText(w, 3))}</div></div>
      <button class="icon-btn" data-act="star" data-id="${w.id}" aria-label="중요 표시">${starIco(s && s.star)}</button>
      <button class="play" data-act="play-word" data-id="${w.id}" aria-label="발음 듣기">${ico("vol")}</button></div>`;
  }

  // ═════════════ 단어 상세 ═════════════
  function wordDetailHtml(w, opt) {
    const s = st(w.id);
    const o = opt || {};
    const derivs = (w.der || []).map((x) => `<div class="kv"><span class="k en">${esc(x.w)}</span><span class="badge pos">${POS_KO[x.pos] || x.pos}</span><span class="v">${esc(x.m)}</span></div>`).join("");
    const cols = (w.col || []).map((x) => `<div class="kv"><span class="k en">${esc(x.e)}</span><span class="v">${esc(x.k)}</span></div>`).join("");
    return `<div class="wd-head">
        <div class="row" style="gap:6px;flex-wrap:wrap"><span class="badge tier-${w.tier}">${C.TIER_NAMES[w.tier]}</span><span class="badge pos">${POS_KO[w.pos] || w.pos}</span>${(w.parts || []).map((p) => `<span class="badge part">Part ${p}</span>`).join("")}<span class="spacer"></span>
          <span class="small muted">DAY ${pad(w.d)}</span></div>
        <div class="row" style="align-items:flex-end"><div class="spacer"><div class="wd-word en">${esc(w.w)}</div>${w.ipa ? `<div class="wd-ipa">${esc(w.ipa)}</div>` : ""}</div>
          <button class="icon-btn" data-act="star" data-id="${w.id}" aria-label="중요 표시">${starIco(s && s.star)}</button>
          <button class="play lg" data-act="play-word" data-id="${w.id}" aria-label="발음 듣기">${ico("vol")}</button></div>
        <div class="wd-mean">${w.m.map((m, i) => `${i ? '<span class="muted">, </span>' : ""}${esc(m)}`).join("")}</div>
      </div>
      <div class="card blk"><div class="blk-h">예문 ${w.exV ? `<span class="voice-tag">${voiceLabel(w.exV)}</span>` : ""}<span class="spacer"></span><button class="play" data-act="play-ex" data-id="${w.id}" aria-label="예문 듣기">${ico("vol")}</button></div>
        <div class="ex-en en">${hl(w.ex)}</div><div class="ex-ko">${esc(w.exKo)}</div></div>
      ${w.tip ? `<div class="tip-box blk"><b>출제 포인트</b> ${esc(w.tip)}</div>` : ""}
      ${cols ? `<div class="card blk"><div class="blk-h">빈출 표현</div>${cols}</div>` : ""}
      ${derivs ? `<div class="card blk"><div class="blk-h">파생어 · 품사 변화</div>${derivs}</div>` : ""}
      ${(w.para && w.para.length) || w.ant ? `<div class="card blk">${w.para && w.para.length ? `<div class="blk-h">Part 7 패러프레이징 (바꿔 쓰기)</div><div class="para-list">${w.para.map((p) => `<span class="en">${esc(p)}</span>`).join("")}</div>` : ""}${w.ant ? `<div class="blk-h" style="margin-top:${w.para && w.para.length ? 14 : 0}px">반의어</div><div class="en" style="font-weight:650">${esc(w.ant)}</div>` : ""}</div>` : ""}
      ${o.noQuiz || !w.q ? "" : `<div class="card blk" id="p5"><div class="blk-h">Part 5 어휘 문제</div><div class="en" style="font-size:16px;line-height:1.6">${esc(w.q.s).replace("-------", '<b style="letter-spacing:.1em">_______</b>')}</div>
        <div class="opts" style="margin-top:12px">${w.q.o.map((x, i) => `<button class="opt" data-p5="${i}"><span class="on">${"ABCD"[i]}</span><span class="en">${esc(x)}</span></button>`).join("")}</div><div id="p5fb"></div></div>`}
      ${s && s.n ? `<p class="small muted" style="text-align:center;margin-top:18px">본 횟수 ${s.n}회 · 맞힘 ${s.ok} · 틀림 ${s.ng}${s.due && s.b ? ` · 다음 복습 ${fmtDate(s.due)}` : ""}</p>` : ""}`;
  }
  function bindP5(w, root) {
    root.querySelectorAll("[data-p5]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.p5;
      const ok = i === w.q.a;
      root.querySelectorAll("[data-p5]").forEach((x) => {
        x.disabled = true;
        const j = +x.dataset.p5;
        if (j === w.q.a) x.classList.add("right");
        else if (j === i) x.classList.add("wrong");
        else x.classList.add("dim");
      });
      (ok ? Sfx.ok : Sfx.bad)();
      root.querySelector("#p5fb").innerHTML = `<div class="feedback ${ok ? "ok" : "bad"}"><b class="t">${ok ? "정답!" : `오답 · 정답 ${"ABCD"[w.q.a]}`}</b>${esc(w.q.k)}</div>`;
    }));
  }
  function vWord(r) {
    const w = BY_ID.get(r.arg);
    if (!w) return go("#/days");
    if (!canAccessDay(w.d)) return go("#/premium");
    const siblings = dayWords(w.d, true);
    const i = siblings.indexOf(w);
    const prev = siblings[i - 1];
    const next = siblings[i + 1];
    const body = `${topBar("", { back: true, right: `${prev ? `<a class="icon-btn" href="#/word/${prev.id}" aria-label="이전 단어">${ico("left")}</a>` : ""}<span class="small muted">${i + 1} / ${siblings.length}</span>${next ? `<a class="icon-btn" href="#/word/${next.id}" aria-label="다음 단어">${ico("right")}</a>` : ""}` })}${wordDetailHtml(w)}`;
    shell("days", body);
    bindP5(w, $app);
    if (S.settings.autoWord) Sound.word(w);
    keyHandler = (e) => {
      if (e.key === "ArrowLeft" && prev) go(`#/word/${prev.id}`);
      if (e.key === "ArrowRight" && next) go(`#/word/${next.id}`);
      if (e.key === "p" || e.key === "P") Sound.word(w);
      if (e.key === "e" || e.key === "E") Sound.example(w);
    };
  }

  // ═════════════ 학습 세션 공통 ═════════════
  function exitStudy() {
    lineSeq += 1;
    lcqSeq += 1;
    Sound.stop();
    session = null;
    if (studyPushed) { studyPushed = false; history.back(); }
    else location.replace("#/home");
  }
  function askExit() {
    if (!session || session.done) return exitStudy();
    const mock = session.kind === "mock";
    confirmBox(mock ? "모의고사를 멈출까요?" : "학습을 그만할까요?", mock ? "푼 답안과 남은 시간이 저장돼요. 모의고사 화면에서 이어서 풀 수 있어요." : "지금까지 한 내용은 저장돼요.", mock ? "멈추기" : "그만하기").then((ok) => { if (ok) { if (mock && session) saveMockRun(session); exitStudy(); } });
  }
  function studyTop(cur, total) {
    const pct = total ? Math.round((cur / total) * 100) : 0;
    return `<div class="study-top"><button class="icon-btn back" data-exit aria-label="닫기">${ico("x")}</button><div class="bar"><i style="width:${pct}%"></i></div><span class="cnt">${Math.min(cur + 1, total)} / ${total}</span></div>`;
  }
  function bindExit() { const b = $app.querySelector("[data-exit]"); if (b) b.addEventListener("click", askExit); }
  function introduceIfNew(w) {
    const s = st(w.id);
    if (!s || !s.n) logToday().new += 1;
  }

  // ═════════════ 카드 암기 ═════════════
  function startCard(words, opt) {
    if (!words.length) return toast("학습할 단어가 없어요");
    session = { kind: "card", title: opt.title, src: opt.src, queue: words.slice(), i: 0, flipped: false, round: 1, again: [], res: { 0: 0, 1: 0, 2: 0 }, seenIds: new Set(), from: location.hash, startedAt: Date.now() };
    enterStudy();
  }
  function vStudy() {
    if (!session) return location.replace("#/home");
    if (session.kind === "place") return vPlacement();
    if (session.done) return session.kind === "mock" && session.reviewing != null ? vMockReview() : vResult();
    if (session.kind === "card") return vCard();
    if (session.kind === "sort") return vSort();
    if (session.kind === "place") return vPlacement();
    if (session.kind === "quiz") return vQuiz();
    if (session.kind === "listen") return vListen();
    if (session.kind === "conf") return vQuiz();
    if (session.kind === "lcq") return vLcQuiz();
    if (session.kind === "pset") return vPset();
    if (session.kind === "gq") return vGq();
    if (session.kind === "dict") return vDictSession();
    if (session.kind === "mock") return vMockSession();
  }
  function vCard() {
    const s = session;
    const w = s.queue[s.i];
    const showKo = S.settings.showKo;
    const st0 = st(w.id);
    $app.innerHTML = `<div class="study">${studyTop(s.i, s.queue.length)}
      <div class="small muted" style="text-align:center">${esc(s.title)}${s.round > 1 ? ` · ${s.round}회차 (모르는 단어 다시)` : ""}</div>
      <div class="flash-wrap"><div class="flash" id="flash">
        <span class="swipe-label l">모름</span><span class="swipe-label r">알아요</span>
        <div class="f-head"><span class="badge tier-${w.tier}">${C.TIER_NAMES[w.tier]}</span><span class="badge pos">${POS_KO[w.pos] || ""}</span>${!st0 || !st0.n ? '<span class="badge c-blue">NEW</span>' : ""}<span class="spacer"></span><button class="icon-btn" data-act="star" data-id="${w.id}" aria-label="중요 표시">${starIco(st0 && st0.star)}</button></div>
        <div class="f-center"><div class="f-word en">${esc(w.w)}</div>${w.ipa ? `<div class="f-ipa">${esc(w.ipa)}</div>` : ""}
          <button class="play lg" data-act="play-word" data-id="${w.id}" style="margin-top:14px" aria-label="발음 듣기">${ico("vol")}</button></div>
        ${s.flipped ? `<div class="f-back"><div class="f-mean">${esc(C.meaningText(w, 3))}</div>
          <div class="f-ex"><div class="row" style="align-items:flex-start"><div class="spacer ex-en en" style="font-size:15.5px">${hl(w.ex)}</div><button class="play" data-act="play-ex" data-id="${w.id}" aria-label="예문 듣기">${ico("vol")}</button></div>${showKo ? `<div class="ex-ko">${esc(w.exKo)}</div>` : ""}</div>
          ${w.tip ? `<div class="small" style="margin-top:10px;color:var(--text-2)"><b style="color:var(--warn)">출제 포인트</b> ${esc(w.tip)}</div>` : ""}</div>` : `<div class="f-hint">뜻을 떠올린 뒤 카드를 눌러 확인하세요</div>`}
      </div></div>
      <div class="study-foot">${s.flipped
        ? `<div class="grade3"><button class="btn g-no" data-g="0">모르겠어요<small>다시 보기</small></button><button class="btn g-mid" data-g="1">헷갈려요<small>${dueLabel(C.INTERVALS[Math.max(1, ((st0 && st0.b) || 0) - 1)])}</small></button><button class="btn g-yes" data-g="2">알아요<small>${s.seenIds.has(w.id) ? "내일 복습" : !st0 || !st0.b ? dueLabel(C.INTERVALS[2]) : dueLabel(C.INTERVALS[Math.min(st0.b + 1, 6)])}</small></button></div>`
        : `<button class="btn block" data-flip>뜻 확인하기</button>`}
        <div class="kbd-hint"><kbd>Space</kbd> 뒤집기 · <kbd>1</kbd> 모름 <kbd>2</kbd> 헷갈림 <kbd>3</kbd> 알아요 · <kbd>P</kbd> 발음 <kbd>E</kbd> 예문 · 카드를 좌우로 밀어도 돼요</div></div></div>`;
    bindExit();
    const flash = document.getElementById("flash");
    const flip = () => {
      if (s.flipped) return;
      s.flipped = true;
      vCard();
      if (S.settings.autoEx) setTimeout(() => Sound.example(w), 50);
    };
    flash.addEventListener("click", (e) => { if (flash.dataset.swiped || s.animating) return; if (!e.target.closest("button")) flip(); });
    const fb = $app.querySelector("[data-flip]");
    if (fb) fb.addEventListener("click", flip);
    $app.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => { if (!s.animating) gradeCard(+b.dataset.g); }));
    bindSwipe(flash, () => { s.animating = true; }, (dir) => {
      s.animating = false;
      if (session !== s || route().name !== "study") return;
      s.flipped = true;
      gradeCard(dir > 0 ? 2 : 0);
    });
    if (!s.flipped && S.settings.autoWord) Sound.word(w);
    keyHandler = (e) => {
      if (onControl(e) || s.animating) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!s.flipped) flip(); }
      else if (s.flipped && ["1", "2", "3"].includes(e.key)) gradeCard(+e.key - 1);
      else if (e.key === "ArrowLeft" && s.flipped) gradeCard(0);
      else if (e.key === "ArrowRight" && s.flipped) gradeCard(2);
      else if (e.key === "p" || e.key === "P") Sound.word(w);
      else if (e.key === "e" || e.key === "E") Sound.example(w);
      else if (e.key === "Escape") askExit();
    };
  }
  function bindSwipe(el, onStart, cb) {
    let x0 = null, y0 = 0, dx = 0, id = null;
    el.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; x0 = e.clientX; y0 = e.clientY; dx = 0; id = e.pointerId; });
    el.addEventListener("pointermove", (e) => {
      if (x0 == null || e.pointerId !== id) return;
      dx = e.clientX - x0;
      if (Math.abs(dx) < 10 || Math.abs(e.clientY - y0) > Math.abs(dx)) return;
      el.style.transition = "none";
      el.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
      el.querySelector(".swipe-label.l").style.opacity = dx < -30 ? Math.min(1, -dx / 120) : 0;
      el.querySelector(".swipe-label.r").style.opacity = dx > 30 ? Math.min(1, dx / 120) : 0;
    });
    const end = () => {
      if (x0 == null) return;
      x0 = null;
      el.style.transition = "";
      if (Math.abs(dx) > 8) el.dataset.swiped = "1"; // 끌기 끝의 click 이 카드를 뒤집지 않게
      if (Math.abs(dx) > 100) {
        el.classList.add(dx > 0 ? "swipe-r" : "swipe-l");
        const d = dx;
        onStart();
        setTimeout(() => cb(d > 0 ? 1 : -1), 180);
      } else {
        setTimeout(() => { delete el.dataset.swiped; }, 0);
        el.style.transform = "";
        el.querySelectorAll(".swipe-label").forEach((l) => { l.style.opacity = 0; });
      }
      dx = 0;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
  function gradeCard(g) {
    const s = session;
    const w = s.queue[s.i];
    const t = today();
    const prev = st(w.id);
    // 처음 보는 단어를 바로 '알아요' 하면 3일 뒤 확인 ('헷갈려요'는 내일)
    const brandNew = (!prev || !prev.b) && !s.seenIds.has(w.id);
    introduceIfNew(w);
    const before = st(w.id);
    let ns = C.grade(before, g, t);
    if (g === 2 && brandNew) ns = Object.assign(ns, { b: 2, due: t + C.INTERVALS[2] });
    // 같은 세션에서 다시 나온 단어는 승급하지 않는다 (모름→알아요가 한 번에 맞힌 것보다 높아지지 않게)
    if (g === 2 && s.seenIds.has(w.id) && before) {
      const b = Math.max(1, before.b);
      ns = Object.assign({}, before, { b, due: t + C.INTERVALS[b], n: before.n + 1, last: t });
    }
    if (before && before.star) ns.star = true;
    // 오답노트: '알아요'로 다시 맞히면 빼 준다 (오늘 처음 틀린 경우는 남긴다)
    if (g === 2 && before && before.wrong && s.round > 1) ns.wrong = before.wrong;
    else if (g === 2 && before && before.wrong) ns.wrong = false;
    setSt(w.id, ns);
    const l = logToday();
    if (before && before.n) l.rev += 1;
    if (s.round === 1 || !s.seenIds.has(w.id)) s.res[g] += 1;
    s.seenIds.add(w.id);
    if (g < 2) s.again.push(w);
    vibrate(g === 2 ? 8 : 18);
    save();
    s.i += 1;
    s.flipped = false;
    if (s.i >= s.queue.length) {
      if (s.again.length) {
        s.queue = C.shuffle(s.again);
        s.again = [];
        s.i = 0;
        s.round += 1;
        toast(`모르는 단어 ${s.queue.length}개를 한 번 더 볼게요`);
      } else return finishSession();
    }
    vCard();
  }

  // ═════════════ 아는 단어 빼기 ═════════════
  function startSort(words, opt) {
    if (!words.length) return toast("뺄 단어가 없어요 (이미 모두 암기 완료)");
    session = { kind: "sort", title: opt.title, queue: words.slice(), i: 0, known: [], unknown: [] };
    enterStudy();
  }
  function vSort() {
    const s = session;
    const w = s.queue[s.i];
    $app.innerHTML = `<div class="study">${studyTop(s.i, s.queue.length)}
      <div class="small muted" style="text-align:center">${esc(s.title)} · 확실히 아는 단어만 빼 두세요</div>
      <div class="flash-wrap"><div class="flash" id="flash" style="min-height:320px">
        <span class="swipe-label l">몰라요</span><span class="swipe-label r">알아요</span>
        <div class="f-head"><span class="badge tier-${w.tier}">${C.TIER_NAMES[w.tier]}</span><span class="badge pos">${POS_KO[w.pos] || ""}</span></div>
        <div class="f-center"><div class="f-word en">${esc(w.w)}</div>${w.ipa ? `<div class="f-ipa">${esc(w.ipa)}</div>` : ""}
          <button class="play lg" data-act="play-word" data-id="${w.id}" style="margin-top:14px" aria-label="발음 듣기">${ico("vol")}</button>
          ${s.peek ? `<div class="f-mean" style="margin-top:16px">${esc(C.meaningText(w, 3))}</div>` : `<button class="btn ghost sm" data-peek style="margin-top:16px">${ico("eye")}뜻 확인</button>`}</div>
      </div></div>
      <div class="study-foot"><div class="grid2 grade2"><button class="btn g-no" data-k="0">몰라요<small>학습할게요</small></button><button class="btn g-yes" data-k="1">알아요<small>빼 둘게요</small></button></div>
      <div class="kbd-hint"><kbd>←</kbd> 몰라요 · <kbd>→</kbd> 알아요 · <kbd>Space</kbd> 뜻 확인 · <kbd>P</kbd> 발음</div></div></div>`;
    bindExit();
    const decide = (known) => {
      if (s.animating) return;
      if (known) {
        const before = st(w.id);
        const ns = C.markKnown(before, today());
        if (before && before.star) ns.star = true;
        setSt(w.id, ns);
        s.known.push(w);
        save();
      } else s.unknown.push(w);
      s.i += 1;
      s.peek = false;
      if (s.i >= s.queue.length) return finishSession();
      vSort();
    };
    $app.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => decide(b.dataset.k === "1")));
    const pk = $app.querySelector("[data-peek]");
    if (pk) pk.addEventListener("click", () => { s.peek = true; vSort(); });
    const flash = document.getElementById("flash");
    bindSwipe(flash, () => { s.animating = true; }, (dir) => { s.animating = false; if (session === s && route().name === "study") decide(dir > 0); });
    if (S.settings.autoWord && !s.peek) Sound.word(w);
    keyHandler = (e) => {
      if (onControl(e) || s.animating) return;
      if (e.key === "ArrowLeft" || e.key === "1") decide(false);
      else if (e.key === "ArrowRight" || e.key === "2") decide(true);
      else if (e.key === " ") { e.preventDefault(); s.peek = true; vSort(); }
      else if (e.key === "p" || e.key === "P") Sound.word(w);
      else if (e.key === "Escape") askExit();
    };
  }

  // ═════════════ 어휘 진단 ═════════════
  // 난이도별 8문항(총 24) 뜻 고르기 + '모르겠어요'. 결과로 아는 단어 수를 추정하고 건너뛸 난이도를 추천한다
  function startPlacement() {
    const words = C.placementSample(WORDS, 8);
    const qs = words.map((w) => C.makeQuestion("meaning", w, WORDS));
    session = { kind: "place", qs, i: 0, results: [], from: location.hash };
    enterStudy();
  }
  function vPlacement() {
    const s = session;
    if (s.done) return vPlacementResult();
    const q = s.qs[s.i];
    const w = q.word;
    $app.innerHTML = `<div class="study">${studyTop(s.i, s.qs.length)}
      <div class="small muted" style="text-align:center">어휘 진단 · 아는 만큼만 답하세요 (점수에 영향 없음)</div>
      <div class="quiz-q"><div class="qk">알맞은 뜻은?</div><div class="qw en">${esc(w.w)}</div></div>
      <div class="opts">${q.options.map((o, i) => `<button class="opt" data-pick="${i}"><span class="on">${i + 1}</span><span>${esc(o)}</span></button>`).join("")}
        <button class="opt" data-skip style="justify-content:center;color:var(--text-3)">모르겠어요</button></div>
      <div class="kbd-hint"><kbd>1</kbd>~<kbd>4</kbd> 선택 · <kbd>0</kbd> 모르겠어요</div></div>`;
    bindExit();
    const answer = (pick) => {
      s.results.push({ tier: w.tier, ok: pick === q.answer, skipped: pick < 0 });
      s.i += 1;
      if (s.i >= s.qs.length) { s.done = true; return vPlacementResult(); }
      vPlacement();
    };
    $app.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => answer(+b.dataset.pick)));
    $app.querySelector("[data-skip]").addEventListener("click", () => answer(-1));
    keyHandler = (e) => {
      if (onControl(e)) return;
      if (/^[1-4]$/.test(e.key)) answer(+e.key - 1);
      else if (e.key === "0") answer(-1);
      else if (e.key === "Escape") askExit();
    };
  }
  function vPlacementResult() {
    const s = session;
    const p = C.placementScore(s.results);
    const known = C.estimateKnown(p, WORDS);
    const rec = C.recommendSkip(p).filter((t) => C.tiersFor(target()).includes(t) && t < Math.max(...C.tiersFor(target())));
    const pct = (x) => Math.round(x * 100);
    const bar = (t) => `<div style="margin:10px 0"><div class="row small" style="margin-bottom:6px"><span class="badge tier-${t}">${C.TIER_NAMES[t]}</span><span class="spacer"></span><b>${pct(p[t])}%</b></div><div class="bar"><i style="width:${pct(p[t])}%"></i></div></div>`;
    const recText = rec.length ? `<b>${rec.map((t) => C.TIER_NAMES[t]).join("·")} 단어</b>는 이미 잘 알고 있어요. 건너뛰고 <b>${C.TIER_NAMES[rec[rec.length - 1] + 1]} 단어</b>부터 시작하면 시간을 아낄 수 있어요.` : "처음부터 차근차근 학습하는 걸 추천해요. 아는 단어는 Day 화면의 '아는 단어 빼기'로 빠르게 넘길 수 있어요.";
    $app.innerHTML = `<div class="study"><div class="study-top"><button class="icon-btn back" data-home aria-label="닫기">${ico("x")}</button><span class="spacer"></span></div>
      <div class="result-hero"><div style="display:flex;justify-content:center;color:var(--brand)">${ico("gauge", "")}</div>
        <div class="msg" style="margin-top:6px">이미 알고 있는 토익 단어</div><div class="score"><small>약 </small>${known.toLocaleString()}<small>개</small></div>
        <p class="muted small">전체 ${NWORDS}개 기준 추정 · ${s.results.length}문항</p></div>
      <div class="card">${[1, 2, 3].map(bar).join("")}</div>
      <div class="tip-box" style="margin-top:12px">${recText}</div>
      <div style="margin-top:16px">${rec.length ? `<button class="btn block" data-apply>${ico("check")}${rec.map((t) => C.TIER_NAMES[t]).join("·")} 단어 건너뛰고 시작</button><button class="btn ghost block" style="margin-top:10px" data-keep>처음부터 학습할게요</button>` : `<button class="btn block" data-keep>학습 시작하기</button>`}</div></div>`;
    const finish = (skip) => {
      S.profile.placed = true;
      S.profile.skip = skip;
      save(true);
      toast(skip.length ? `${skip.map((t) => C.TIER_NAMES[t]).join("·")} 단어를 건너뛰었어요. 설정에서 다시 포함할 수 있어요` : "진단 완료! 오늘의 단어부터 시작해요");
      exitStudy();
    };
    const ap = $app.querySelector("[data-apply]");
    if (ap) ap.addEventListener("click", () => finish(rec));
    $app.querySelector("[data-keep]").addEventListener("click", () => finish([]));
    $app.querySelector("[data-home]").addEventListener("click", () => finish(S.profile.skip || []));
    keyHandler = (e) => { if (e.key === "Escape") finish(S.profile.skip || []); };
  }

  // ═════════════ 퀴즈 ═════════════
  const QUIZ_TITLES = { meaning: "알맞은 뜻은?", word: "알맞은 단어는?", listen: "듣고 알맞은 뜻 고르기", spell: "영어로 쓰세요", cloze: "빈칸에 알맞은 말은?", part5: "Part 5 · 빈칸에 알맞은 것은?", conf: "혼동 어휘 · 빈칸에 알맞은 것은?", para: "Part 7 · 문맥상 뜻이 가장 가까운 것은?" };
  function startQuiz(words, type, opt) {
    // 모의고사 전용 Part 5 어휘 문제(w.mq)는 연습에 쓰지 않는다
    if (type === "part5") words = words.filter((w) => w.q);
    if (!words.length) return toast("문제를 만들 단어가 없어요");
    const all = pool().length > 60 ? pool() : WORDS;
    let qs;
    if (type === "test") qs = C.makeTest(words, all, Math.min(20, words.length));
    else if (type === "mix") {
      const types = ["meaning", "word", "cloze", "part5", "listen", "para"];
      qs = C.shuffle(words).slice(0, 30).map((w, i) => {
        let tp = types[i % types.length];
        if (tp === "cloze" && C.starred(w.ex).length !== 1) tp = "meaning";
        if (tp === "para") return C.canParaphrase(w) ? C.makeParaphrase(w, all) : C.makeQuestion("meaning", w, all);
        return C.makeQuestion(tp, w, all);
      });
    } else {
      let ws = C.shuffle(words);
      if (type === "cloze") ws = ws.filter((w) => C.starred(w.ex).length === 1);
      if (type === "para") ws = ws.filter(C.canParaphrase);
      qs = ws.slice(0, 30).map((w) => (type === "para" ? C.makeParaphrase(w, all) : C.makeQuestion(type, w, all)));
    }
    if (!qs.length) return toast(type === "cloze" ? "예문 빈칸 문제를 만들 수 있는 단어가 없어요" : type === "para" ? "바꿔 쓰기 표현이 있는 단어가 없어요" : "문제를 만들 단어가 없어요");
    session = { kind: "quiz", type, title: opt.title, qs, i: 0, answered: null, results: [], day: opt.day, wrongNote: opt.wrongNote, from: location.hash, hint: 0 };
    enterStudy();
  }
  function startConfQuiz(sets) {
    if (!sets.length) return toast("문제가 없어요");
    const qs = C.shuffle(sets).map((c) => ({ type: "conf", conf: c, prompt: c.q.s, options: c.q.o, answer: c.q.a, explain: c.q.k }));
    session = { kind: "conf", type: "conf", title: "혼동 어휘 퀴즈", qs, i: 0, answered: null, results: [], from: location.hash };
    enterStudy();
  }
  function vQuiz() {
    const s = session;
    const q = s.qs[s.i];
    const w = q.word;
    const ans = s.answered;
    const label = QUIZ_TITLES[q.type];
    let qhtml = "";
    if (q.type === "meaning") qhtml = `<div class="qw en">${esc(w.w)}</div>${w.ipa ? `<div class="muted small" style="margin-top:4px">${esc(w.ipa)}</div>` : ""}`;
    else if (q.type === "word") qhtml = `<div class="qm">${esc(q.prompt)}</div><div class="muted small" style="margin-top:6px">${POS_KO[w.pos] || ""}</div>`;
    else if (q.type === "listen") qhtml = `<button class="play lg" data-replay style="margin:18px auto 0;width:84px;height:84px" aria-label="다시 듣기">${ico("vol")}</button>${ans ? `<div class="qw en" style="font-size:26px">${esc(w.w)}</div>` : `<div class="small muted" style="margin-top:10px">버튼을 눌러 다시 들을 수 있어요</div>`}`;
    else if (q.type === "cloze") qhtml = `<div class="qs en">${esc(q.prompt).replace(/_____/g, '<b style="color:var(--brand)">_____</b>')}</div>${S.settings.showKo && ans ? `<div class="qsub">${esc(q.sub)}</div>` : ""}`;
    else if (q.type === "part5" || q.type === "conf") qhtml = `<div class="qs en">${esc(q.prompt).replace("-------", '<b style="color:var(--brand);letter-spacing:.05em">_______</b>')}</div>`;
    else if (q.type === "para") qhtml = `<div class="qs en">${hl(w.ex)}</div><div class="qsub">표시된 <b class="en">${esc(q.key)}</b>와 바꿔 쓸 수 있는 표현은?</div>`;
    else if (q.type === "spell") qhtml = `<div class="qm">${esc(q.prompt)}</div><div class="muted small" style="margin-top:6px">${POS_KO[w.pos] || ""}${w.ex ? "" : ""}</div>`;
    let body;
    if (q.type === "spell") {
      const hint = C.spellHint(w.w, s.hint);
      body = `<div class="spell-hint en" aria-label="힌트">${esc(hint)}</div>
        <input class="spell-input en ${ans ? (ans.ok ? "ok" : "bad") : ""}" id="spell" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="정답 입력" ${ans ? "disabled" : ""} value="${ans ? esc(ans.given) : ""}" />
        ${ans ? "" : `<div class="row" style="margin-top:12px"><button class="btn ghost sm" data-hint style="flex:1">${ico("bulb")}힌트</button><button class="btn ghost sm" data-giveup style="flex:1">모르겠어요</button></div>`}`;
    } else {
      body = `<div class="opts">${q.options.map((o, i) => {
        let cls = "";
        if (ans) cls = i === q.answer ? "right" : i === ans.pick ? "wrong" : "dim";
        return `<button class="opt ${cls}" data-pick="${i}" ${ans ? "disabled" : ""}><span class="on">${i + 1}</span><span class="${q.type === "word" || q.type === "cloze" || q.type === "part5" || q.type === "conf" || q.type === "para" ? "en" : ""}">${esc(o)}</span></button>`;
      }).join("")}</div>`;
    }
    let fb = "";
    if (ans) {
      const expl = q.type === "part5" || q.type === "conf" ? q.explain : q.type === "para" ? `이 문맥의 ${q.key}(${C.meaningText(w, 2)}) = ${w.para.join(", ")}${S.settings.showKo ? ` · ${w.exKo}` : ""}` : "";
      const wInfo = w ? `<div style="margin-top:6px"><b class="en">${esc(w.w)}</b> ${esc(C.meaningText(w, 3))}</div>` : "";
      const confInfo = q.conf ? `<div style="margin-top:8px">${q.conf.words.map((x) => `<div><b class="en">${esc(x.w)}</b> <span class="muted">${POS_SHORT[x.pos] || ""}</span> ${esc(x.m)}</div>`).join("")}<div style="margin-top:6px;color:var(--text-2)">${esc(q.conf.point)}</div></div>` : "";
      fb = `<div class="feedback ${ans.ok ? "ok" : "bad"}"><b class="t">${ans.ok ? "정답이에요!" : ans.close ? "아깝다! 철자를 확인해 보세요" : "틀렸어요"}</b>${expl ? esc(expl) : ""}${q.type === "spell" && !ans.ok ? `<div style="margin-top:4px">정답: <b class="en">${esc(w.w)}</b></div>` : ""}${!ans.ok || q.type === "part5" ? wInfo : ""}${confInfo}</div>`;
    }
    $app.innerHTML = `<div class="study">${studyTop(s.i, s.qs.length)}
      <div class="quiz-q"><div class="qk">${label}</div>${qhtml}</div>
      ${body}${fb}
      <div class="study-foot">${ans ? `<button class="btn block" data-next>${s.i + 1 >= s.qs.length ? "결과 보기" : "다음 문제"}</button>` : q.type === "spell" ? `<button class="btn block" data-check>확인</button>` : ""}
      <div class="kbd-hint">${q.type === "spell" ? "<kbd>Enter</kbd> 확인 · 다음" : "<kbd>1</kbd>~<kbd>4</kbd> 선택 · <kbd>Enter</kbd> 다음"}${w ? " · <kbd>P</kbd> 발음" : ""}</div></div></div>`;
    bindExit();
    const pick = (i) => {
      if (s.answered) return;
      answerQuiz({ pick: i, ok: i === q.answer });
    };
    $app.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => pick(+b.dataset.pick)));
    const nx = $app.querySelector("[data-next]");
    if (nx) nx.addEventListener("click", nextQuiz);
    const rp = $app.querySelector("[data-replay]");
    if (rp) rp.addEventListener("click", () => Sound.word(w, rp));
    const input = document.getElementById("spell");
    const check = () => {
      if (s.answered) return;
      const r = C.checkSpelling(input.value, w.w);
      if (!r.ok && r.close && !s.closeOnce) {
        s.closeOnce = true;
        input.classList.add("bad");
        toast("거의 맞았어요! 철자를 다시 확인해 보세요");
        setTimeout(() => input.classList.remove("bad"), 600);
        return;
      }
      answerQuiz({ given: input.value, ok: r.ok, close: r.close });
    };
    if (input && !ans) {
      if (window.matchMedia("(hover: hover)").matches) input.focus();
      else setTimeout(() => input.focus(), 50);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); check(); } });
      $app.querySelector("[data-check]").addEventListener("click", check);
      $app.querySelector("[data-hint]").addEventListener("click", () => { s.hint += 1; const v = input.value; vQuiz(); document.getElementById("spell").value = v; });
      $app.querySelector("[data-giveup]").addEventListener("click", () => answerQuiz({ given: "", ok: false }));
    }
    if (!ans && q.type === "listen") setTimeout(() => Sound.word(w, $app.querySelector("[data-replay]")), 150);
    if (!ans && q.type === "meaning" && S.settings.autoWord) Sound.word(w);
    keyHandler = (e) => {
      if (e.key === "Escape") return askExit();
      if (onControl(e)) return;
      if (s.answered && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); return nextQuiz(); }
      if (!s.answered && q.type !== "spell" && /^[1-4]$/.test(e.key)) pick(+e.key - 1);
      if ((e.key === "p" || e.key === "P") && w && q.type !== "spell") Sound.word(w);
    };
  }
  function answerQuiz(a) {
    const s = session;
    const q = s.qs[s.i];
    s.answered = a;
    s.closeOnce = false;
    s.results.push({ q, ok: a.ok });
    if (q.type === "part5" || q.type === "conf") recordAnswer("rc", "p5:어휘", a.ok);
    else {
      const l = logToday();
      l.q += 1;
      if (a.ok) l.ok += 1;
    }
    if (q.word) {
      const w = q.word;
      introduceIfNew(w);
      const before = st(w.id);
      const ns = C.applyQuiz(before, a.ok, today());
      if (before && before.star) ns.star = true;
      if (a.ok && s.wrongNote) ns.wrong = false;
      setSt(w.id, ns);
    }
    (a.ok ? Sfx.ok : Sfx.bad)();
    vibrate(a.ok ? 8 : [20, 40, 20]);
    save();
    vQuiz();
    if (q.word && (q.type === "word" || q.type === "spell" || q.type === "cloze") && S.settings.autoWord) Sound.word(q.word);
    if (a.ok && q.type !== "part5" && q.type !== "conf" && q.type !== "spell" && q.type !== "para") {
      const i = s.i;
      setTimeout(() => { if (session === s && s.i === i && s.answered) nextQuiz(); }, 900);
    }
  }
  function nextQuiz() {
    const s = session;
    if (!s || !s.answered) return;
    s.i += 1;
    s.answered = null;
    s.hint = 0;
    if (s.i >= s.qs.length) return finishSession();
    vQuiz();
  }

  // ═════════════ 듣기 모드 ═════════════
  function startListen(words, opt) {
    if (!words.length) return toast("들을 단어가 없어요");
    session = { kind: "listen", title: opt.title, list: words.slice(), i: 0, playing: false, phase: "", from: location.hash, showMean: true, withEx: true, readKo: S.settings.readKo };
    enterStudy();
  }
  function vListen() {
    const s = session;
    const w = s.list[s.i];
    $app.innerHTML = `<div class="study">${studyTop(s.i, s.list.length)}
      <div class="small muted" style="text-align:center">${esc(s.title)} · 단어 → 뜻 → 예문 순서로 자동 재생</div>
      <div class="player"><span class="badge tier-${w.tier}">${C.TIER_NAMES[w.tier]}</span>
        <div class="pw en">${esc(w.w)}</div>${w.ipa ? `<div class="muted">${esc(w.ipa)}</div>` : ""}
        <div class="pm" style="margin-top:12px">${s.showMean ? esc(C.meaningText(w, 3)) : '<span class="muted small">뜻 가림</span>'}</div>
        ${s.withEx ? `<div class="pe en">${hl(w.ex)}</div>${s.showMean && S.settings.showKo ? `<div class="ex-ko">${esc(w.exKo)}</div>` : ""}` : ""}
        <div class="player-ctl"><button class="icon-btn" data-prev aria-label="이전">${ico("prev")}</button><button class="main-btn" data-toggle aria-label="${s.playing ? "일시정지" : "재생"}">${ico(s.playing ? "pause" : "play")}</button><button class="icon-btn" data-next aria-label="다음">${ico("next")}</button></div>
      </div>
      <div class="study-foot"><div class="set-group">
        <label class="set-row"><span class="sl"><b>뜻 보기</b></span><span class="switch"><input type="checkbox" data-opt="showMean" ${s.showMean ? "checked" : ""}/><span></span></span></label>
        <label class="set-row"><span class="sl"><b>예문까지 듣기</b></span><span class="switch"><input type="checkbox" data-opt="withEx" ${s.withEx ? "checked" : ""}/><span></span></span></label>
        <label class="set-row"><span class="sl"><b>한국어 뜻 읽어 주기</b><span>${Sound.hasKo() ? "기기의 한국어 음성으로 읽어요" : "이 기기에는 한국어 음성이 없어요"}</span></span><span class="switch"><input type="checkbox" data-opt="readKo" ${s.readKo && Sound.hasKo() ? "checked" : ""} ${Sound.hasKo() ? "" : "disabled"}/><span></span></span></label>
      </div></div></div>`;
    bindExit();
    $app.querySelector("[data-toggle]").addEventListener("click", () => { s.playing ? pauseListen() : playListen(); });
    $app.querySelector("[data-prev]").addEventListener("click", () => { s.i = Math.max(0, s.i - 1); restartListen(); });
    $app.querySelector("[data-next]").addEventListener("click", () => { if (s.i + 1 < s.list.length) { s.i += 1; restartListen(); } });
    $app.querySelectorAll("[data-opt]").forEach((c) => c.addEventListener("change", () => {
      s[c.dataset.opt] = c.checked;
      if (c.dataset.opt === "readKo") { S.settings.readKo = c.checked; save(); }
      vListen();
    }));
    keyHandler = (e) => {
      if (onControl(e)) return;
      if (e.key === " ") { e.preventDefault(); s.playing ? pauseListen() : playListen(); }
      if (e.key === "ArrowRight" && s.i + 1 < s.list.length) { s.i += 1; restartListen(); }
      if (e.key === "ArrowLeft") { s.i = Math.max(0, s.i - 1); restartListen(); }
      if (e.key === "Escape") askExit();
    };
  }
  function restartListen() {
    const s = session;
    const was = s.playing;
    s.run = (s.run || 0) + 1;
    Sound.stop();
    s.playing = false;
    vListen();
    if (was) playListen();
  }
  function pauseListen() {
    session.run = (session.run || 0) + 1;
    Sound.stop();
    session.playing = false;
    vListen();
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function playListen() {
    const s = session;
    const run = (s.run = (s.run || 0) + 1);
    s.playing = true;
    vListen();
    // 다음/이전/일시정지를 누르면 run 이 바뀌어 이전 반복이 즉시 멈춘다
    const alive = () => session === s && s.playing && s.run === run;
    while (alive()) {
      const w = s.list[s.i];
      await Sound.word(w);
      if (!alive()) break;
      await wait(500);
      if (!alive()) break;
      await Sound.word(w);
      if (!alive()) break;
      await wait(400);
      if (!alive()) break;
      if (s.readKo && Sound.hasKo()) await Sound.ko(w.m.slice(0, 2).join(", "));
      else await wait(1200);
      if (!alive()) break;
      if (s.withEx) {
        await wait(400);
        if (!alive()) break;
        await Sound.example(w);
        if (!alive()) break;
      }
      await wait(1100);
      if (!alive()) break;
      if (s.i + 1 >= s.list.length) {
        s.playing = false;
        markDone();
        toast("끝까지 들었어요!");
        vListen();
        break;
      }
      s.i += 1;
      vListen();
    }
  }

  // ═════════════ 결과 ═════════════
  function finishSession() {
    const s = session;
    s.done = true;
    if (["pset", "gq", "lcq", "dict"].includes(s.kind) && (s.results || []).length >= 3) logToday().prac = true;
    const count = s.kind === "card" ? s.seenIds.size : s.kind === "sort" ? 0 : s.results.length;
    if (count >= 5) markDone();
    if (s.type === "test" && s.day) {
      const score = Math.round((s.results.filter((r) => r.ok).length / s.results.length) * 100);
      const prev = S.tests[s.day];
      S.tests[s.day] = { best: Math.max(score, (prev && prev.best) || 0), last: score, at: today() };
    }
    save(true);
    vResult();
  }
  function confetti() {
    const c = document.createElement("div");
    c.className = "confetti";
    const colors = ["#2b59f0", "#ff8a1f", "#12a26b", "#f5b100", "#8a3ffc", "#e5484d"];
    c.innerHTML = Array.from({ length: 60 }, () => `<i style="left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};animation-delay:${Math.random() * 0.6}s;animation-duration:${1.8 + Math.random() * 1.4}s"></i>`).join("");
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3600);
  }
  function vResult() {
    const s = session;
    let hero = "";
    let list = "";
    let actions = "";
    if (s.kind === "sort") {
      hero = `<div class="result-hero"><div style="display:flex;justify-content:center">${ico("check")}</div><div class="score">${s.known.length}<small>개</small></div><div class="msg">아는 단어로 뺐어요</div><p class="muted">7일 뒤 복습에서 한 번만 확인할게요 · 학습할 단어 ${s.unknown.length}개</p></div>`;
      s._words = s.unknown;
      list = s.unknown.map((w) => wordItem(w)).join("");
      actions = `${s.unknown.length ? `<button class="btn block" data-card>${ico("layers")}모르는 단어 ${s.unknown.length}개 카드로 외우기</button>` : ""}<button class="btn ${s.unknown.length ? "ghost" : ""} block" style="margin-top:10px" data-home>처음 화면으로</button>`;
    } else if (s.kind === "card") {
      const total = s.res[0] + s.res[1] + s.res[2];
      const words = Array.from(s.seenIds).map((id) => BY_ID.get(id));
      hero = `<div class="result-hero"><div style="display:flex;justify-content:center">${ico("check", "")}</div><div class="score">${total}<small>개</small></div><div class="msg">카드 학습 완료!</div><p class="muted">한 번에 안 단어 ${s.res[2]} · 헷갈림 ${s.res[1]} · 모름 ${s.res[0]}</p></div>`;
      list = words.map((w) => wordItem(w)).join("");
      actions = `<button class="btn block" data-quiz>${ico("zap")}방금 외운 단어 퀴즈로 확인</button><button class="btn ghost block" style="margin-top:10px" data-home>처음 화면으로</button>`;
      s._words = words;
    } else if (s.kind === "pset") {
      const r = psetResultHtml(s);
      hero = r.hero;
      list = "";
      actions = `${r.types}<button class="btn block" style="margin-top:12px" data-pmore>${ico("play")}${PART_LABEL[s.part]} 더 풀기</button><button class="btn ghost block" style="margin-top:10px" data-home>목록으로</button>`;
      if (r.score >= 80 && r.total >= 3) setTimeout(confetti, 100);
    } else if (s.kind === "mock") {
      const r = mockResultHtml(s);
      hero = r.hero;
      const wrongN = s.pages.reduce((n, p, pi) => n + pageQs(p).filter((q, qi) => s.picks[pi][qi] !== (p.part === "p2" ? p.q.answer : q.a)).length, 0);
      actions = `<div class="card">${r.rows}</div><button class="btn block" style="margin-top:12px" data-mrevw ${wrongN ? "" : "disabled"}>${ico("alert")}틀린 문제 해설 (${wrongN})</button><button class="btn ghost block" style="margin-top:10px" data-mrev>${ico("book")}전체 해설 보기</button><a class="btn ghost block" style="margin-top:10px" href="#/practice" data-tohub>약점 연습하러 가기</a><button class="btn ghost block" style="margin-top:10px" data-home>모의고사 목록으로</button>`;
      list = "";
    } else if (s.kind === "dict") {
      const avg = Math.round(s.results.reduce((n, r) => n + r.pct, 0) / Math.max(1, s.results.length));
      hero = `<div class="result-hero"><div class="score" style="color:${avg >= 90 ? "var(--ok)" : avg >= 60 ? "var(--accent)" : "var(--bad)"}">${avg}<small>%</small></div><div class="msg">${avg >= 90 ? "귀가 트였어요!" : avg >= 60 ? "거의 다 들려요" : "천천히 다시 들어 보세요"}</div><p class="muted">${s.results.length}문장 평균 받아쓰기 정확도</p></div>`;
      list = s.results.filter((r) => r.pct < 100).map((r) => `<div class="witem" style="cursor:default"><div class="wbody"><div class="ex-en en">${esc(r.it.text)}</div><div class="ex-ko">${esc(r.it.ko)}</div></div><span class="badge ${r.pct >= 90 ? "ok" : "bad"}">${r.pct}%</span></div>`).join("");
      actions = `<button class="btn block" data-dmore>${ico("pencil")}10문장 더</button><button class="btn ghost block" style="margin-top:10px" data-home>처음 화면으로</button>`;
    } else if (s.kind === "gq") {
      const ok = s.results.filter((r) => r.ok).length;
      const total = s.results.length;
      const score = Math.round((ok / total) * 100);
      hero = `<div class="result-hero"><div class="score" style="color:${score >= 80 ? "var(--ok)" : score >= 50 ? "var(--accent)" : "var(--bad)"}">${score}<small>점</small></div><div class="msg">${score === 100 ? "완벽해요!" : score >= 80 ? "훌륭해요!" : "강의를 다시 보고 틀린 문제를 풀어 보세요"}</div><p class="muted">${esc(s.title)} · ${total}문제 중 ${ok}개 정답</p></div>`;
      const wrong = s.results.filter((r) => !r.ok);
      s._gWrong = wrong.map((r) => r.q);
      list = wrong.map((r) => `<div class="witem" style="cursor:default"><div class="wbody"><div class="ex-en en">${esc(r.q.s.replace("-------", r.q.o[r.q.a]))}</div><div class="small muted" style="margin-top:4px">${esc(r.q.exp)}</div></div></div>`).join("");
      actions = `${wrong.length ? `<button class="btn block" data-gwrong>${ico("repeat")}틀린 문제 다시 (${wrong.length})</button>` : ""}<button class="btn ${wrong.length ? "ghost" : ""} block" style="margin-top:10px" data-home>처음 화면으로</button>`;
      if (score >= 80 && total >= 5) setTimeout(confetti, 100);
    } else if (s.kind === "lcq") {
      const ok = s.results.filter((r) => r.ok).length;
      const total = s.results.length;
      const score = Math.round((ok / total) * 100);
      hero = `<div class="result-hero"><div class="score" style="color:${score >= 80 ? "var(--ok)" : score >= 50 ? "var(--accent)" : "var(--bad)"}">${score}<small>점</small></div><div class="msg">${score === 100 ? "완벽해요!" : score >= 80 ? "훌륭해요!" : score >= 50 ? "조금만 더 하면 돼요" : "표현을 듣고 다시 풀어 봐요"}</div><p class="muted">${s.title} · ${total}문제 중 ${ok}개 정답</p></div>`;
      const wrong = s.results.filter((r) => !r.ok).map((r) => r.q.item);
      s._lcWrong = wrong;
      list = wrong.map((p) => {
        const d = C.splitDialog(p.e);
        const dk = d && C.splitDialog(p.k);
        return `<div class="witem" style="align-items:flex-start;cursor:default"><div class="wbody"><div class="ex-en en">${d ? `<div><span class="muted">Q</span> ${hl(d.q)}</div><div><span class="muted">A</span> ${hl(d.a)}</div>` : hl(p.e)}</div>
          <div class="ex-ko" style="margin-top:3px">${dk ? `${esc(dk.q)}<br>${esc(dk.a)}` : esc(p.k)}</div>
          <div class="small" style="margin-top:6px"><span class="badge pos en">${esc(p.key)}</span> <span class="muted">${esc(p.keyKo)}</span></div></div>
          <button class="play" data-lsay="${p.id}" aria-label="듣기">${ico("vol")}</button></div>`;
      }).join("");
      actions = `${wrong.length ? `<button class="btn block" data-lcwrong>${ico("repeat")}틀린 문제 다시 풀기 (${wrong.length})</button>` : ""}<button class="btn ${wrong.length ? "ghost" : ""} block" style="margin-top:10px" data-lcnext>${ico("zap")}새 문제 ${LCQ_N}개 더 풀기</button><button class="btn ghost block" style="margin-top:10px" data-home>LC 표현 목록으로</button>`;
      if (score >= 80 && total >= 5) setTimeout(confetti, 100);
    } else {
      const ok = s.results.filter((r) => r.ok).length;
      const total = s.results.length;
      const score = Math.round((ok / total) * 100);
      const pass = score >= 80;
      const msg = s.type === "test" ? (pass ? "통과! 이 Day는 자신 있게 넘어가도 돼요" : "80점 이상이면 통과예요. 틀린 단어를 복습해 보세요") : score === 100 ? "완벽해요!" : score >= 80 ? "훌륭해요!" : score >= 50 ? "조금만 더 하면 돼요" : "복습이 필요해요";
      hero = `<div class="result-hero"><div class="score" style="color:${pass ? "var(--ok)" : score >= 50 ? "var(--accent)" : "var(--bad)"}">${score}<small>점</small></div><div class="msg">${msg}</div><p class="muted">${total}문제 중 ${ok}개 정답</p></div>`;
      const wrong = s.results.filter((r) => !r.ok);
      const wrongWords = Array.from(new Set(wrong.map((r) => r.q.word).filter(Boolean)));
      s._words = wrongWords;
      list = wrong.length
        ? wrong.map((r) => (r.q.word ? wordItem(r.q.word) : `<div class="witem"><div class="wbody"><div class="ww en">${esc(r.q.conf.words.map((x) => x.w).join(" / "))}</div><div class="wm">${esc(r.q.conf.point)}</div></div></div>`)).join("")
        : "";
      actions = `${wrongWords.length ? `<button class="btn block" data-card>${ico("layers")}틀린 단어 카드로 복습 (${wrongWords.length})</button>` : ""}<button class="btn ${wrongWords.length ? "ghost" : ""} block" style="margin-top:10px" data-retry>다시 풀기</button><button class="btn ghost block" style="margin-top:10px" data-home>처음 화면으로</button>`;
      if (pass && total >= 5) setTimeout(confetti, 100);
    }
    $app.innerHTML = `<div class="study"><div class="study-top"><button class="icon-btn back" data-home aria-label="닫기">${ico("x")}</button><span class="spacer"></span></div>
      ${hero}${actions}
      ${list ? `<div class="section"><div class="section-h"><h2>${s.kind === "card" ? "학습한 단어" : s.kind === "sort" ? "학습할 단어" : "틀린 문제"}</h2></div><div class="wlist">${list}</div></div>` : ""}</div>`;
    $app.querySelectorAll("[data-home]").forEach((b) => b.addEventListener("click", exitStudy));
    const q = $app.querySelector("[data-quiz]");
    if (q) q.addEventListener("click", () => startQuiz(s._words, "mix", { title: "확인 퀴즈" }));
    const c = $app.querySelector("[data-card]");
    if (c) c.addEventListener("click", () => startCard(s._words, { title: "틀린 단어 복습" }));
    const pm = $app.querySelector("[data-pmore]");
    if (pm) pm.addEventListener("click", () => startSets(s.part, pickSets(practicePool(s.part).filter((x) => !s.queue.includes(x)), s.part === "p7" ? 2 : 3), s.title));
    const mr = $app.querySelector("[data-mrev]");
    if (mr) mr.addEventListener("click", () => { s.wrongOnly = false; s.reviewing = 0; vMockReview(); window.scrollTo(0, 0); });
    const mw = $app.querySelector("[data-mrevw]");
    if (mw) mw.addEventListener("click", () => { s.wrongOnly = true; s.reviewing = mockReviewNext(s, -1, 1); vMockReview(); window.scrollTo(0, 0); });
    const th = $app.querySelector("[data-tohub]");
    if (th) th.addEventListener("click", (e) => { e.preventDefault(); session = null; studyPushed = false; location.replace("#/practice"); });
    const dm = $app.querySelector("[data-dmore]");
    if (dm) dm.addEventListener("click", () => { const src = dictSources(); const short = s.title.includes("짧은"); const all = short ? src.lc : src.p34.filter((x) => x.text.split(" ").length >= 6 && x.text.split(" ").length <= 22); startDict(C.shuffle(all).slice(0, 10), s.title); });
    const gw = $app.querySelector("[data-gwrong]");
    if (gw) gw.addEventListener("click", () => startGrammarQuiz(s._gWrong, "틀린 문법 문제"));
    const lw = $app.querySelector("[data-lcwrong]");
    if (lw) lw.addEventListener("click", () => startLcQuiz(s.type, s._lcWrong));
    const ln = $app.querySelector("[data-lcnext]");
    if (ln) ln.addEventListener("click", () => startLcQuiz(s.type, s.src));
    $app.querySelectorAll("[data-lsay]").forEach((b) => b.addEventListener("click", () => sayExpr(s._lcWrong.find((p) => p.id === b.dataset.lsay), b)));
    const rt = $app.querySelector("[data-retry]");
    if (rt) rt.addEventListener("click", () => {
      if (s.kind === "conf") startConfQuiz(s.qs.map((x) => x.conf));
      else startQuiz(s.qs.map((x) => x.word), s.type, { title: s.title, day: s.day, wrongNote: s.wrongNote });
    });
    keyHandler = (e) => { if (onControl(e)) return; if (e.key === "Escape" || e.key === "Enter") exitStudy(); };
  }

  // ═════════════ 복습 허브 ═════════════
  function vReview(r) {
    if (r.q.tab) ui.reviewTab = r.q.tab;
    const t = today();
    const P = pool();
    const due = dueWords(t);
    const wrong = WORDS.filter((w) => st(w.id) && st(w.id).wrong);
    const star = WORDS.filter((w) => st(w.id) && st(w.id).star);
    const learned = P.filter((w) => st(w.id) && st(w.id).n);
    const tab = ui.reviewTab;
    const lists = { due, wrong, star };
    const cur = lists[tab] || due;
    const desc = { due: "기억이 흐려질 때쯤 다시 보는 단어예요. 매일 비워 주세요.", wrong: "퀴즈·카드에서 틀린 단어가 자동으로 모여요. 다시 맞히면 빠져요.", star: "★ 표시한 단어예요." }[tab];
    const body = `${topBar("복습")}
      <div class="seg" style="margin-bottom:14px">${[["due", `복습 예정 ${due.length}`], ["wrong", `오답노트 ${wrong.length}`], ["star", `★ 중요 ${star.length}`]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-tab="${k}">${l}</button>`).join("")}</div>
      <p class="small muted" style="margin:0 2px 12px">${desc}</p>
      ${cur.length ? `<div class="grid2" style="margin-bottom:14px"><button class="btn" data-start="card">${ico("layers")}카드로</button><button class="btn ghost" data-start="quiz">${ico("zap")}퀴즈로</button></div><div class="wlist">${cur.slice(0, 300).map(wordItem).join("")}</div>`
        : `<div class="card empty">${ico(tab === "star" ? "star" : "check")}<b>${tab === "due" ? "오늘 복습 끝!" : tab === "wrong" ? "틀린 단어가 없어요" : "중요 표시한 단어가 없어요"}</b>${tab === "star" ? "단어 옆 ☆를 눌러 모아 보세요" : "새 단어를 학습하면 여기에 쌓여요"}</div>`}
      <div class="section"><div class="section-h"><h2>전체 범위 테스트</h2></div>
        <button class="task" data-random ${learned.length >= 4 ? "" : "disabled"}><span class="tico c-purple">${ico("shuffle")}</span><span class="spacer"><div class="tt">배운 단어 랜덤 30문제</div><div class="td">${learned.length ? `지금까지 본 ${learned.length}개 중에서` : "단어를 먼저 학습해 주세요"}</div></span>${ico("right")}</button></div>`;
    shell("review", body);
    $app.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { ui.reviewTab = b.dataset.tab; history.replaceState(null, "", "#/review"); vReview({ q: {} }); }));
    $app.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () => {
      const ws = tab === "due" ? cur.slice(0, 100) : cur.slice(0, 60);
      const title = { due: "복습", wrong: "오답노트", star: "중요 단어" }[tab];
      if (b.dataset.start === "card") startCard(ws, { title });
      else startQuiz(ws, "mix", { title, wrongNote: tab === "wrong" });
    }));
    const rnd = $app.querySelector("[data-random]");
    if (rnd) rnd.addEventListener("click", () => startQuiz(C.shuffle(learned).slice(0, 30), "mix", { title: "랜덤 테스트" }));
  }

  // ═════════════ Part 1 ═════════════
  // Part 1 사진 표현 / LC 빈출 표현 — 같은 목록 화면을 쓴다
  const LC_TIPS = {
    2: `<b>Part 2 요령</b> 질문에 직접 답하지 않는 <b>우회 응답</b>이 정답인 경우가 많아요. "글쎄요", "~에게 물어보세요", "아직 정해지지 않았어요" 같은 답을 놓치지 마세요. 질문의 단어를 그대로 반복하는 보기는 함정일 때가 많아요.`,
    3: `<b>Part 3 요령</b> 대화를 듣기 전에 문제를 먼저 읽어 두세요. 정답은 대화의 표현을 <b>다른 말로 바꿔</b> 나오고, 마지막 부분의 '다음에 할 일'·'요청 사항'이 자주 출제돼요.`,
    4: `<b>Part 4 요령</b> 첫 문장에서 <b>담화 종류</b>(안내·광고·메시지·방송)와 장소를 잡으면 절반은 풀려요. <span class="en">Please ~ / Make sure ~</span> 뒤의 요청 사항을 놓치지 마세요.`,
  };
  const EXPR = {
    part1: { title: "Part 1 사진 표현", sub: () => `사진 묘사 문제에 그대로 나오는 문장 ${D.part1.length}개`, list: () => D.part1,
      tip: () => `<b>핵심 함정</b> 사람이 없는 사진에서 <span class="en">is being + p.p.</span>(지금 ~되는 중)는 대부분 오답! 사물의 상태는 <span class="en">is/are + p.p.</span>, <span class="en">has been + p.p.</span>로 말해요.` },
    lc: { title: "LC 빈출 표현", sub: () => `Part 2~4 대화·방송에 자주 나오는 표현 ${(D.lc || []).length}개`, list: () => D.lc || [],
      tip: () => LC_TIPS[ui.lcPart] || LC_TIPS[2] },
  };
  // LC 음성: 대화는 질문(lc/NNN-q) → 쉼 → 대답(lc/NNN-a), 한 사람의 말은 lc/NNN.mp3. Part 1 은 p.au 가 파일 경로
  const lcRel = (p, tail) => (p.au ? `lc/${p.id.slice(3).padStart(3, "0")}${tail ? "-" + tail : ""}.mp3` : null);
  let exprSeq = 0;
  async function sayExpr(p, btn) {
    const my = ++exprSeq;
    const text = C.plainEx(p.e);
    if (p.id.startsWith("p1-")) return Sound.play(p.au || null, text, { btn });
    const d = C.splitDialog(text);
    if (!d) return Sound.play(lcRel(p, ""), text, { btn });
    const ok = await Sound.play(lcRel(p, "q"), d.q, { btn });
    if (!ok || my !== exprSeq) return false;
    const t = Sound.current();
    await wait(450);
    if (my !== exprSeq || t !== Sound.current()) return false;
    return Sound.play(lcRel(p, "a"), d.a, { btn });
  }
  const EXPR_PAGE = 60;
  function vPart1() { vExpr("part1"); }
  function vLc() { vExpr("lc"); }
  function vExpr(kind) {
    const cfg = EXPR[kind];
    const all = cfg.list();
    const isLc = kind === "lc";
    if (!ui.exprG) ui.exprG = {};
    if (!ui.exprMore) ui.exprMore = {};
    // LC: Part 탭(전체/2/3/4) → 그 Part 의 그룹 칩. 그룹 순서는 데이터의 lcGroups 순서
    const part = isLc && [2, 3, 4].includes(ui.lcPart) ? ui.lcPart : 0;
    const order = isLc ? (D.lcGroups || []).map((x) => x.g) : [];
    let groups = Array.from(new Set(all.filter((p) => !part || p.part === part).map((p) => p.g)));
    if (order.length) groups.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const wrongN = isLc ? all.filter((p) => S.lc[p.id] && S.lc[p.id].wrong).length : 0;
    let g = groups.includes(ui.exprG[kind]) || (ui.exprG[kind] === "wrong" && wrongN) ? ui.exprG[kind] : "all";
    let list = all.filter((p) => (!part || p.part === part) && (g === "all" || (g === "wrong" ? S.lc[p.id] && S.lc[p.id].wrong : p.g === g)));
    if (order.length) list = list.slice().sort((a, b) => order.indexOf(a.g) - order.indexOf(b.g));
    const shown = list.slice(0, Math.max(EXPR_PAGE, ui.exprMore[kind] || 0));
    const showKo = ui.exprKo !== false;
    const line = (p) => {
      const d = C.splitDialog(p.e);
      const dk = d && C.splitDialog(p.k);
      const en = d ? `<div><span class="muted">Q</span> ${hl(d.q)}</div><div><span class="muted">A</span> ${hl(d.a)}</div>` : hl(p.e);
      const ko = dk ? `<div>${esc(dk.q)}</div><div>${esc(dk.a)}</div>` : esc(p.k);
      const rec = isLc && S.lc[p.id];
      return `<div class="witem" style="align-items:flex-start;cursor:default"><div class="wbody">
        <div class="ex-en en" style="font-size:16px">${en}</div>${showKo ? `<div class="ex-ko" style="margin-top:3px">${ko}</div>` : ""}
        <div class="small" style="margin-top:6px"><span class="badge pos en">${esc(p.key)}</span> <span class="muted">${esc(p.keyKo)}</span>${rec ? ` <span class="badge ${rec.wrong ? "bad" : "ok"}">${rec.wrong ? "틀림" : "맞힘"}</span>` : ""}</div>
        ${p.tip ? `<div class="small" style="margin-top:6px;color:var(--text-2)">💡 ${esc(p.tip)}</div>` : ""}</div>
        <button class="play" data-p1="${p.id}" aria-label="듣기">${ico("vol")}</button></div>`;
    };
    let quiz = "";
    if (isLc) {
      const sum = C.lcSummary(all, S.lc);
      const nResp = list.filter(C.canRespond).length;
      const nMean = list.filter((p) => !C.splitDialog(p.e)).length;
      quiz = `<div class="grid2" style="margin-bottom:12px">
          <button class="tile" data-lcq="resp" ${nResp ? "" : "disabled"}><span class="tico c-purple">${ico("ear")}</span><b>Part 2 응답 고르기</b><span>질문 듣고 3개 중 고르기 · ${nResp}문항</span></button>
          <button class="tile" data-lcq="lcm" ${nMean ? "" : "disabled"}><span class="tico c-orange">${ico("headphones")}</span><b>듣고 해석 고르기</b><span>Part 3·4 문장 · ${nMean}문항</span></button>
        </div>
        <div class="small muted" style="margin:-2px 2px 12px">${sum.seen ? `푼 표현 ${sum.seen}/${sum.total} · 정답률 ${sum.accuracy}%${sum.wrong ? ` · 틀린 표현 ${sum.wrong}개` : ""}` : "아래에서 Part·주제를 고르면 그 범위로 퀴즈가 나와요"}</div>
        <div class="seg" style="margin-bottom:10px">${[[0, "전체"], [2, "Part 2"], [3, "Part 3"], [4, "Part 4"]].map(([v, t]) => `<button class="${part === v ? "on" : ""}" data-part="${v}">${t}</button>`).join("")}</div>`;
    }
    const body = `${topBar(cfg.title, { back: true, sub: cfg.sub() })}
      ${quiz}
      <div class="tip-box" style="margin-bottom:14px">${cfg.tip()}</div>
      <div class="row" style="margin-bottom:12px"><button class="btn sm" data-p1play>${ico("headphones")}이 목록 연속 듣기</button><span class="spacer"></span><button class="btn ghost sm" data-ko>${showKo ? "해석 가리기" : "해석 보기"}</button></div>
      <div class="chips scroll" style="margin-bottom:12px"><button class="chip ${g === "all" ? "on" : ""}" data-g="all">전체 ${list.length && g === "all" ? list.length : ""}</button>${wrongN ? `<button class="chip ${g === "wrong" ? "on" : ""}" data-g="wrong">틀린 표현 ${wrongN}</button>` : ""}${groups.map((x) => `<button class="chip ${g === x ? "on" : ""}" data-g="${esc(x)}">${esc(x)}</button>`).join("")}</div>
      <div class="wlist">${shown.map(line).join("")}</div>
      ${list.length > shown.length ? `<button class="btn ghost block" data-more style="margin-top:12px">더 보기 (${list.length - shown.length}개 남음)</button>` : ""}`;
    shell(kind, body);
    const rerender = () => { ui.exprMore[kind] = 0; vExpr(kind); };
    $app.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => { ui.exprG[kind] = b.dataset.g; rerender(); }));
    $app.querySelectorAll("[data-part]").forEach((b) => b.addEventListener("click", () => { ui.lcPart = +b.dataset.part; ui.exprG[kind] = "all"; rerender(); }));
    $app.querySelector("[data-ko]").addEventListener("click", () => { ui.exprKo = !showKo; vExpr(kind); });
    const more = $app.querySelector("[data-more]");
    if (more) more.addEventListener("click", () => { const y = window.scrollY; ui.exprMore[kind] = shown.length + EXPR_PAGE; vExpr(kind); window.scrollTo(0, y); });
    $app.querySelectorAll("[data-lcq]").forEach((b) => b.addEventListener("click", () => startLcQuiz(b.dataset.lcq, list)));
    const byId = new Map(all.map((p) => [p.id, p]));
    $app.querySelectorAll("[data-p1]").forEach((b) => b.addEventListener("click", () => { seqId += 1; sayExpr(byId.get(b.dataset.p1), b); }));
    $app.querySelector("[data-p1play]").addEventListener("click", async () => {
      const btns = Array.from($app.querySelectorAll("[data-p1]"));
      const my = ++seqId;
      for (const b of btns) {
        if (my !== seqId || !document.body.contains(b)) break;
        b.scrollIntoView({ block: "center", behavior: "smooth" });
        await sayExpr(byId.get(b.dataset.p1), b);
        if (my !== seqId) break;
        await wait(900);
      }
    });
  }

  // ═════════════ LC 실전 퀴즈 ═════════════
  // resp: Part 2 응답 고르기 (질문 → 보기 3개를 차례로 들려준다) · lcm: Part 3·4 문장을 듣고 해석 고르기
  const LCQ_N = 20;
  function startLcQuiz(type, items, count) {
    let src = items.filter(type === "resp" ? C.canRespond : (p) => !C.splitDialog(p.e));
    const everything = (D.lc || []).filter(type === "resp" ? C.canRespond : (p) => !C.splitDialog(p.e));
    if (src.length < 4) src = everything;
    if (!src.length) return toast("문제를 만들 표현이 없어요");
    const picked = C.lcPick(src, S.lc, count || LCQ_N);
    const pool = everything.length >= 8 ? everything : D.lc;
    const qs = picked.map((p) => (type === "resp" ? C.makeResponse(p) : C.makeLcMeaning(p, pool)));
    session = { kind: "lcq", type, title: type === "resp" ? "Part 2 응답 고르기" : "듣고 해석 고르기", qs, src, i: 0, answered: null, results: [], from: location.hash };
    enterStudy();
  }
  let lcqSeq = 0;
  // 문제 음성: resp 는 질문 → (A) → (B) → (C), lcm 은 문장 하나. 재생 중인 보기를 표시한다
  // 반환: 질문 음성이 실제로 재생됐는지 (자동재생이 막히면 false — 모의고사에서 한 번 더 들을 수 있게)
  async function playLcq(q, only, isCurrent) {
    const my = ++lcqSeq;
    const p = q.item;
    const cur = isCurrent || (() => !!session && Array.isArray(session.qs) && session.qs[session.i] === q);
    const replay = $app.querySelector("[data-replay]");
    if (q.type === "lcm") return Sound.play(lcRel(p, ""), q.prompt, { btn: replay });
    let heard = true;
    if (only == null) {
      heard = (await Sound.play(lcRel(p, "q"), q.prompt, { btn: replay })) === true;
      if (my !== lcqSeq || !cur()) return heard;
    }
    const opts = only == null ? q.options.map((o, i) => i) : [only];
    for (const i of opts) {
      if (only == null) await wait(650);
      if (my !== lcqSeq || !cur()) return heard;
      const btn = $app.querySelector(`[data-pick="${i}"]`);
      if (btn) btn.classList.add("playing");
      await Sound.play(lcRel(p, q.options[i].f), q.options[i].t, {});
      if (btn) btn.classList.remove("playing");
      if (my !== lcqSeq) return heard;
    }
    return heard;
  }
  function vLcQuiz() {
    const s = session;
    const q = s.qs[s.i];
    const p = q.item;
    const ans = s.answered;
    const script = S.settings.lcScript || !!ans;
    const L = "ABCD";
    let qhtml;
    if (q.type === "resp") {
      qhtml = `<button class="play lg" data-replay style="margin:14px auto 0;width:76px;height:76px" aria-label="다시 듣기">${ico("vol")}</button>
        ${script ? `<div class="qs en" style="margin-top:12px">${esc(q.prompt)}</div>${ans ? `<div class="qsub">${esc(q.promptKo)}</div>` : ""}` : `<div class="small muted" style="margin-top:10px">질문과 보기 (A)(B)(C)를 듣고 알맞은 응답을 고르세요</div>`}`;
    } else {
      qhtml = `<button class="play lg" data-replay style="margin:14px auto 0;width:76px;height:76px" aria-label="다시 듣기">${ico("vol")}</button>
        ${script ? `<div class="qs en" style="margin-top:12px">${ans ? hl(p.e) : esc(q.prompt)}</div>` : `<div class="small muted" style="margin-top:10px">문장을 듣고 알맞은 해석을 고르세요</div>`}`;
    }
    const opts = `<div class="opts">${q.options.map((o, i) => {
      let cls = "";
      if (ans) cls = i === q.answer ? "right" : i === ans.pick ? "wrong" : "dim";
      if (q.type === "resp") {
        const txt = script ? `<span class="en">${esc(o.t)}</span>${ans && o.k ? `<span class="small muted" style="display:block;font-weight:500;margin-top:2px">${esc(o.k)}</span>` : ""}` : `<span class="muted">보기 ${L[i]}</span>`;
        return `<button class="opt ${cls}" data-pick="${i}" ${ans ? "disabled" : ""}><span class="on">${L[i]}</span><span style="flex:1">${txt}</span>${ans ? `<span class="play sm" data-say="${i}" role="button" aria-label="보기 ${L[i]} 듣기">${ico("vol")}</span>` : ""}</button>`;
      }
      return `<button class="opt ${cls}" data-pick="${i}" ${ans ? "disabled" : ""}><span class="on">${i + 1}</span><span>${esc(o)}</span></button>`;
    }).join("")}</div>`;
    let fb = "";
    if (ans) {
      fb = `<div class="feedback ${ans.ok ? "ok" : "bad"}"><b class="t">${ans.ok ? "정답이에요!" : "틀렸어요"}</b>
        ${q.type === "lcm" ? `<div>${esc(p.k)}</div>` : ""}
        <div style="margin-top:6px"><b class="en">${esc(p.key)}</b> ${esc(p.keyKo)}</div>
        ${p.tip ? `<div style="margin-top:6px;color:var(--text-2)">💡 ${esc(p.tip)}</div>` : ""}</div>`;
    }
    const label = q.type === "resp" ? "Part 2 · 질문에 알맞은 응답은?" : `Part ${p.part === 4 ? 4 : 3} · 들은 문장의 뜻은?`;
    $app.innerHTML = `<div class="study">${studyTop(s.i, s.qs.length)}
      <div class="quiz-q"><div class="qk">${label}</div>${qhtml}</div>
      ${opts}${fb}
      <div class="study-foot">${ans ? `<button class="btn block" data-next>${s.i + 1 >= s.qs.length ? "결과 보기" : "다음 문제"}</button>` : `<button class="btn ghost block" data-script>${S.settings.lcScript ? "스크립트 숨기고 듣기만" : "스크립트 보면서 풀기"}</button>`}
      <div class="kbd-hint"><kbd>1</kbd>~<kbd>${q.options.length}</kbd> 선택 · <kbd>R</kbd> 다시 듣기 · <kbd>Enter</kbd> 다음</div></div></div>`;
    bindExit();
    const pick = (i) => {
      if (s.answered || i >= q.options.length) return;
      lcqSeq += 1;
      Sound.stop();
      const ok = i === q.answer;
      s.answered = { pick: i, ok };
      s.results.push({ q, ok });
      S.lc[p.id] = C.lcRecord(S.lc[p.id], ok, today());
      recordAnswer("lc", q.type === "resp" ? "p2:응답" : `p${p.part === 4 ? 4 : 3}:문장 듣기`, ok);
      (ok ? Sfx.ok : Sfx.bad)();
      vibrate(ok ? 8 : [20, 40, 20]);
      save();
      vLcQuiz();
      if (q.type === "resp") sayExpr(p, $app.querySelector("[data-replay]"));
    };
    const next = () => {
      if (!s.answered) return;
      lcqSeq += 1;
      s.i += 1;
      s.answered = null;
      if (s.i >= s.qs.length) return finishSession();
      vLcQuiz();
    };
    $app.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", (e) => {
      if (e.target.closest("[data-say]")) return;
      pick(+b.dataset.pick);
    }));
    $app.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); playLcq(q, +b.dataset.say); }));
    // 정답 표시 뒤에는 보기 버튼이 disabled 라 클릭이 안 온다 — 보기 안의 작은 재생 버튼은 부모 대신 직접 받는다
    $app.querySelectorAll(".opt[disabled] [data-say]").forEach((b) => { b.parentElement.removeAttribute("disabled"); b.parentElement.style.cursor = "default"; });
    const nx = $app.querySelector("[data-next]");
    if (nx) nx.addEventListener("click", next);
    const sc = $app.querySelector("[data-script]");
    if (sc) sc.addEventListener("click", () => { S.settings.lcScript = !S.settings.lcScript; save(); lcqSeq += 1; vLcQuiz(); });
    $app.querySelector("[data-replay]").addEventListener("click", () => (ans && q.type === "resp" ? sayExpr(p, $app.querySelector("[data-replay]")) : playLcq(q)));
    if (!ans) setTimeout(() => { if (session === s && s.qs[s.i] === q && !s.answered) playLcq(q); }, 250);
    keyHandler = (e) => {
      if (e.key === "Escape") return askExit();
      if (onControl(e)) return;
      if (s.answered && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); return next(); }
      if (!s.answered && /^[1-4]$/.test(e.key)) pick(+e.key - 1);
      if (!s.answered && /^[abcABC]$/.test(e.key) && q.type === "resp") pick("abc".indexOf(e.key.toLowerCase()));
      if (e.key === "r" || e.key === "R") $app.querySelector("[data-replay]").click();
    };
  }

  // ═════════════ 실전 문제 (Part 3·4 · Part 5 문법 · Part 6 · Part 7 · 모의고사 · 받아쓰기) ═════════════
  // 문제 데이터(js/practice.js)는 크기가 커서 실전 화면에 처음 들어갈 때 불러온다
  let PR = window.VOCA_PRACTICE || null;
  let prLoading = null;
  function loadPractice() {
    if (PR) return Promise.resolve(prIndex());
    if (!prLoading) {
      prLoading = new Promise((res, rej) => {
        const sc = document.createElement("script");
        sc.src = "js/practice.js";
        sc.onload = () => { PR = window.VOCA_PRACTICE || null; if (PR) res(prIndex()); else { prLoading = null; rej(new Error("data")); } };
        sc.onerror = () => { prLoading = null; rej(new Error("load")); };
        document.head.appendChild(sc);
      });
    }
    return prLoading;
  }
  function prIndex() {
    if (PR && !PR._by) {
      PR._by = new Map();
      for (const k of ["p1", "p3", "p4", "p6", "p7"]) (PR[k] || []).forEach((x) => PR._by.set(x.id, x));
      PR._g = new Map();
      (PR.grammar || []).forEach((t) => t.qs.forEach((q) => PR._g.set(q.id, { q, t })));
    }
    return PR;
  }
  const PART_LABEL = { p1: "Part 1", p2: "Part 2", p3: "Part 3", p4: "Part 4", p5: "Part 5", p6: "Part 6", p7: "Part 7" };
  const LV_LABEL = { 1: "쉬움", 2: "보통", 3: "어려움" };
  const LETTERS = "ABCD";
  // 실전 화면 공통: 데이터가 없으면 불러온 뒤 다시 그린다
  function needPractice(r, active) {
    if (PR) { prIndex(); return true; }
    shell(active || "practice", `${topBar("실전 문제", { back: r.name !== "practice" })}<div class="empty">${ico("clock")}<b>문제를 불러오는 중…</b></div>`);
    loadPractice().then(() => { if (route().name === r.name) render(); }).catch(() => {
      if (route().name === r.name) shell(active || "practice", `${topBar("실전 문제")}<div class="empty">${ico("alert")}<b>문제를 불러오지 못했어요</b>앱을 다시 열어 주세요</div>`);
    });
    return false;
  }
  // 기록: 세트별 결과, 유형별 정답률, 최근 LC/RC 결과(예상 점수용)
  function recordAnswer(sec, typeKey, ok) {
    C.recordType(S.qt, typeKey, ok);
    S.pr[sec] = C.pushRecent(S.pr[sec], ok);
    const l = logToday();
    l.q += 1;
    if (ok) l.ok += 1;
  }
  const secOf = (part) => (part === "p1" || part === "p2" || part === "p3" || part === "p4" ? "lc" : "rc");
  const practicePool = (part) => (PR[part] || []).filter((x) => !x.mock);

  // ── 그래픽(표·막대그래프·목록) ──
  function graphicHtml(g) {
    if (!g) return "";
    if (g.type === "table") return `<div class="gfx"><div class="gfx-t">${esc(g.title)}</div><div class="gfx-scroll"><table><thead><tr>${g.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${g.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
    if (g.type === "bars") {
      const max = Math.max(...g.items.map((i) => i.value)) || 1;
      return `<div class="gfx"><div class="gfx-t">${esc(g.title)}${g.unit ? ` <span class="muted">(${esc(g.unit)})</span>` : ""}</div><div class="bars">${g.items.map((i) => `<div class="bar-row"><span class="bl">${esc(i.label)}</span><span class="bt"><i style="width:${Math.max(4, (i.value / max) * 100)}%"></i></span><span class="bv">${esc(String(i.value))}</span></div>`).join("")}</div></div>`;
    }
    if (g.type === "list") return `<div class="gfx"><div class="gfx-t">${esc(g.title)}</div><ul>${g.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
    return "";
  }

  // ── 문항(보기 4개) ── mode: practice(채점 전) · exam · review
  function qBlock(q, j, pick, mode, opt) {
    const o = opt || {};
    const shown = mode === "review";
    const opts = q.o.map((x, i) => {
      let cls = pick === i ? "sel" : "";
      if (shown) cls = i === q.a ? "right" : i === pick ? "wrong" : "dim";
      return `<button class="opt sm ${cls}" data-q="${j}" data-o="${i}" ${shown ? "disabled" : ""}><span class="on">${LETTERS[i]}</span><span class="en">${esc(x)}</span></button>`;
    }).join("");
    const head = `<div class="pq-h"><span class="pq-n">${o.num || j + 1}</span><span class="en">${esc(q.q || "")}</span></div>${shown && q.qko ? `<div class="small muted" style="margin:-2px 0 8px 30px">${esc(q.qko)}</div>` : ""}`;
    let fb = "";
    if (shown) {
      const ok = pick === q.a;
      fb = `<div class="feedback ${ok ? "ok" : "bad"}"><b class="t">${ok ? "정답" : pick == null ? `정답 ${LETTERS[q.a]} (풀지 않음)` : `오답 · 정답 ${LETTERS[q.a]}`}</b>${q.type || q.kind ? `<span class="badge pos" style="margin-left:6px">${esc(q.type || q.kind)}</span>` : ""}<div style="margin-top:6px">${esc(q.exp || "")}</div>${o.evBtn && q.ev ? `<button class="btn ghost sm" style="margin-top:8px" data-ev="${j}">${ico("eye")}근거 위치 보기</button>` : ""}</div>`;
    }
    return `<div class="pq" id="pq-${j}">${head}<div class="opts">${opts}</div>${fb}</div>`;
  }
  function bindPicks(st, onChange) {
    $app.querySelectorAll(".pq [data-o]").forEach((b) => b.addEventListener("click", () => {
      const j = +b.dataset.q;
      st.picks[j] = +b.dataset.o;
      $app.querySelectorAll(`.pq [data-q="${j}"]`).forEach((x) => x.classList.toggle("sel", x === b));
      if (onChange) onChange();
    }));
  }

  // ── Part 3·4: 문장 단위 음성 재생 (현재 문장 표시, 문장 눌러 다시 듣기) ──
  const lineRel = (set, i) => (!set.au ? null : set.part === 1 ? `p1q/${set.id}-${i}.mp3` : `p34/${set.id}-${String(i + 1).padStart(2, "0")}.mp3`);
  let lineSeq = 0;
  let linePlaying = false;
  const playBtn = (on) => { const b = $app.querySelector("[data-play34]"); if (b) { b.classList.toggle("playing", on); b.innerHTML = ico(on ? "pause" : "play"); } };
  async function playLines(set, from, opt) {
    const o = opt || {};
    const my = ++lineSeq;
    linePlaying = true;
    playBtn(true);
    let heard = false;
    for (let i = from || 0; i < set.lines.length; i++) {
      if (my !== lineSeq || !session) return heard;
      $app.querySelectorAll(".sline.now, [data-pline].now").forEach((x) => x.classList.remove("now"));
      const el = $app.querySelector(`.sline[data-line="${i}"], [data-pline="${i}"]`);
      if (el) { el.classList.add("now"); if (o.follow) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      const prog = $app.querySelector(".lp-prog");
      if (prog) prog.textContent = `${i + 1} / ${set.lines.length}`;
      const t0 = Date.now();
      const ok = await Sound.play(lineRel(set, i), set.lines[i].en, {});
      if (my !== lineSeq) return heard;
      if (ok === true) heard = true;
      else break; // 재생이 막히거나 실패하면 멈춘다 (다음 문장을 이어서 틀지 않는다)
      // 쉐도잉: 문장 길이만큼 멈춰 따라 말할 시간을 준다
      // Part 1 은 실제 시험처럼 보기 사이를 조금 길게 띄운다
      await wait(o.shadow ? Math.min(9000, Math.max(1500, (Date.now() - t0) * 1.2)) : set.part === 1 ? 900 : 350);
      if (o.once) break;
    }
    if (my !== lineSeq) return heard;
    linePlaying = false;
    $app.querySelectorAll(".sline.now, [data-pline].now").forEach((x) => x.classList.remove("now"));
    playBtn(false);
    if (o.onEnd) o.onEnd();
    return heard;
  }
  function stopLines() {
    lineSeq += 1;
    linePlaying = false;
    Sound.stop();
    playBtn(false);
  }
  const SPK = { W: "여", M: "남", W2: "여2", M2: "남2" };
  // ── Part 1: 사진 + 보기 4문장 (풀 때는 듣기만, 채점 뒤 문장·해석·함정) ──
  function p1Html(set, st, mode) {
    const review = mode === "review";
    const showKo = ui.prKo !== false;
    const q = set.qs[0];
    const pick = st.picks[0];
    const photo = `<div class="p1photo"><img src="${esc(set.img)}" alt="Part 1 사진${st.base ? ` ${st.base}번` : ""}" data-zoom></div>`;
    const player = `<div class="lplayer"><button class="play lg ${linePlaying ? "playing" : ""}" data-play34 aria-label="재생">${ico(linePlaying ? "pause" : "play")}</button><div class="spacer"><b>${st.base ? `${st.base}번 · ` : ""}사진을 가장 잘 묘사한 문장은?</b><div class="small muted">${esc(set.kind || "")} · ${LV_LABEL[set.lv] || ""} · <span class="lp-prog">보기 4문장</span></div></div></div>`;
    if (!review) {
      return `${photo}${player}<div class="pq" id="pq-0"><div class="opts">${q.o.map((x, i) => `<button class="opt sm ${pick === i ? "sel" : ""}" data-q="0" data-o="${i}" data-pline="${i}"><span class="on">${LETTERS[i]}</span><span class="muted">보기 ${LETTERS[i]}</span></button>`).join("")}</div></div>
        <div class="small muted" style="margin-top:6px">(A)~(D) 네 문장을 듣고 사진과 맞는 것을 고르세요. 문장은 채점 뒤에 보여 드려요.</div>`;
    }
    const ok = pick === q.a;
    const lines = q.o.map((x, i) => `<div class="opt sm sline ${i === q.a ? "right" : i === pick ? "wrong" : "dim"}" data-line="${i}" role="button"><span class="on">${LETTERS[i]}</span><span class="spacer"><span class="en">${esc(x)}</span>${showKo ? `<span class="ko">${esc(q.ko[i])}</span>` : ""}</span>${ico("vol")}</div>`).join("");
    return `${photo}${player}<div class="pq" id="pq-0"><div class="opts">${lines}</div>
      <div class="feedback ${ok ? "ok" : "bad"}"><b class="t">${ok ? "정답" : pick == null ? `정답 ${LETTERS[q.a]} (풀지 않음)` : `오답 · 정답 ${LETTERS[q.a]}`}</b>${q.type ? `<span class="badge pos" style="margin-left:6px">함정: ${esc(q.type)}</span>` : ""}<div style="margin-top:6px">${esc(q.exp || "")}</div></div></div>
      <div class="row" style="justify-content:space-between;margin-top:8px"><span class="small muted">문장을 누르면 그 문장만 다시 들어요</span><button class="btn ghost sm" data-ko>${showKo ? "해석 가리기" : "해석 보기"}</button></div>`;
  }
  function p34Html(set, st, mode) {
    const review = mode === "review";
    const showKo = ui.prKo !== false;
    const hiQ = st.evQ;
    const evSet = new Set(hiQ != null ? set.qs[hiQ].ev : []);
    const label = set.part === 3 ? `${esc(set.topic || "")}${set.lines.some((l) => /2$/.test(l.sp)) ? " · 3인 대화" : ""}` : esc(set.talk || "");
    const player = `<div class="lplayer"><button class="play lg ${linePlaying ? "playing" : ""}" data-play34 aria-label="재생">${ico(linePlaying ? "pause" : "play")}</button><div class="spacer"><b>${set.part === 3 ? "대화" : "담화"} 듣기</b><div class="small muted">${label} · ${LV_LABEL[set.lv] || ""} · <span class="lp-prog">${set.lines.length}문장</span></div></div>${review ? `<button class="btn ghost sm" data-shadow>${ico("repeat")}따라 말하기</button>` : ""}</div>`;
    const script = review ? `<div class="section-h" style="margin-top:18px"><h2>스크립트</h2><button class="btn ghost sm" data-ko>${showKo ? "해석 가리기" : "해석 보기"}</button></div>
      <div class="script">${set.lines.map((l, i) => `<div class="sline ${evSet.has(i) ? "ev" : ""}" data-line="${i}"><span class="spk spk-${l.sp[0]}">${SPK[l.sp] || ""}</span><div class="spacer"><div class="en">${esc(l.en)}</div>${showKo ? `<div class="ko">${esc(l.ko)}</div>` : ""}</div></div>`).join("")}</div>
      <div class="small muted" style="margin-top:6px">문장을 누르면 그 문장부터 다시 들어요 · 근거 위치 보기를 누르면 정답 근거 문장이 표시돼요</div>` : "";
    return `${player}${graphicHtml(set.graphic)}<div class="pqs">${set.qs.map((q, j) => qBlock(q, j, st.picks[j], mode, { evBtn: true, num: st.base ? st.base + j : undefined })).join("")}</div>${script}`;
  }
  // ── Part 6 ──
  function p6Html(set, st, mode) {
    const review = mode === "review";
    const showKo = ui.prKo !== false;
    const fill = (txt) => esc(txt).replace(/\{(\d)\}/g, (m, n) => {
      const j = +n - 1, q = set.qs[j];
      const label = st.base ? st.base + j : n;
      if (!review) return `<span class="blank ${st.picks[j] != null ? "done" : ""}" data-jump="${j}">(${label}) ${st.picks[j] != null && q.kind !== "문장 삽입" ? esc(q.o[st.picks[j]]) : "______"}</span>`;
      const ok = st.picks[j] === q.a;
      return `<span class="blank ${ok ? "ok" : "bad"}">(${label}) ${esc(q.o[q.a])}</span>`;
    });
    return `<div class="doc"><div class="doc-k">${esc(set.doc)}${set.title ? ` · ${esc(set.title)}` : ""}</div>${set.paras.map((p, i) => `<p class="en">${fill(p)}</p>${review && showKo ? `<p class="ko">${esc(set.ko[i])}</p>` : ""}`).join("")}</div>
      ${review ? `<div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn ghost sm" data-ko>${showKo ? "해석 가리기" : "해석 보기"}</button></div>` : ""}
      <div class="pqs">${set.qs.map((q, j) => qBlock(Object.assign({}, q, { q: q.kind === "문장 삽입" ? "빈칸에 들어갈 알맞은 문장은?" : "" }), j, st.picks[j], mode, { num: st.base ? st.base + j : `(${q.n})` })).join("")}</div>`;
  }
  // ── Part 7 ── 근거 구절을 <mark> 로 표시
  function markEv(text, marks) {
    const ranges = marks.map((m) => { const i = text.indexOf(m.s); return i >= 0 ? [i, i + m.s.length, m.on] : null; }).filter(Boolean);
    if (!ranges.length) return esc(text);
    const cuts = Array.from(new Set([0, text.length].concat(...ranges.map((r) => [r[0], r[1]])))).sort((a, b) => a - b);
    let html = "";
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = cuts[k], b = cuts[k + 1];
      const cover = ranges.filter((r) => r[0] <= a && r[1] >= b);
      const seg = esc(text.slice(a, b));
      html += cover.length ? `<mark class="${cover.some((r) => r[2]) ? "on" : ""}">${seg}</mark>` : seg;
    }
    return html;
  }
  function p7Html(set, st, mode) {
    const review = mode === "review";
    const showKo = ui.prKo !== false;
    const docs = set.docs.map((d, di) => {
      const chat = d.doc === "문자 메시지" || d.doc === "온라인 채팅";
      const paras = d.paras.map((p, pi) => {
        const marks = review ? set.qs.flatMap((q, j) => (q.ev || []).filter((e) => e.d === di && e.p === pi).map((e) => ({ s: e.s, on: st.evQ === j }))) : [];
        const body = review ? markEv(p, marks) : esc(p);
        if (chat) {
          const m = /^([^\[]+) \[([^\]]+)\]: ([\s\S]*)$/.exec(p);
          if (m) return `<div class="chat"><div class="chat-h"><b>${esc(m[1])}</b> <span class="muted">${esc(m[2])}</span></div><div class="en">${review ? markEv(m[3], marks) : esc(m[3])}</div>${review && showKo ? `<div class="ko">${esc(d.ko[pi].replace(/^[^\[\]:]*\[[^\]]*\]\s*:\s*/, ""))}</div>` : ""}</div>`;
        }
        return `<p class="en">${body}</p>${review && showKo ? `<p class="ko">${esc(d.ko[pi])}</p>` : ""}`;
      }).join("");
      return `<div class="doc"><div class="doc-k">${set.docs.length > 1 ? `지문 ${di + 1} · ` : ""}${esc(d.doc)}${d.title ? ` · ${esc(d.title)}` : ""}</div>${(d.meta || []).length ? `<div class="doc-meta en">${d.meta.map(esc).join("<br>")}</div>` : ""}${paras}${graphicHtml(d.graphic)}</div>`;
    }).join("");
    return `<div class="p7"><div class="p7-docs">${docs}${review ? `<div class="row" style="justify-content:flex-end"><button class="btn ghost sm" data-ko>${showKo ? "해석 가리기" : "해석 보기"}</button></div>` : ""}</div>
      <div class="p7-qs pqs">${set.qs.map((q, j) => qBlock(q, j, st.picks[j], mode, { evBtn: true, num: st.base ? st.base + j : undefined })).join("")}</div></div>`;
  }
  function setHtml(part, set, st, mode) {
    return part === "p1" ? p1Html(set, st, mode) : part === "p6" ? p6Html(set, st, mode) : part === "p7" ? p7Html(set, st, mode) : p34Html(set, st, mode);
  }
  function bindSetCommon(part, set, st, rerender) {
    const ko = $app.querySelector("[data-ko]");
    if (ko) ko.addEventListener("click", () => { ui.prKo = ui.prKo === false; rerender(); });
    $app.querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", () => {
      const j = +b.dataset.ev;
      st.evQ = st.evQ === j ? null : j;
      rerender();
      const t = $app.querySelector(part === "p7" ? "mark.on" : ".sline.ev");
      if (t) t.scrollIntoView({ block: "center", behavior: "smooth" });
    }));
    $app.querySelectorAll("[data-jump]").forEach((b) => b.addEventListener("click", () => {
      const t = document.getElementById(`pq-${b.dataset.jump}`);
      if (t) t.scrollIntoView({ block: "center", behavior: "smooth" });
    }));
    if (part === "p1") {
      const pb = $app.querySelector("[data-play34]");
      if (pb) pb.addEventListener("click", () => (pb.classList.contains("playing") ? stopLines() : playLines(set, 0)));
      $app.querySelectorAll(".sline").forEach((el) => el.addEventListener("click", () => playLines(set, +el.dataset.line, { once: true })));
      const im = $app.querySelector("[data-zoom]");
      if (im) im.addEventListener("click", () => modal(`<img src="${esc(set.img)}" alt="" style="width:100%;border-radius:10px;display:block"><button class="btn ghost block" data-close style="margin-top:10px">닫기</button>`));
    }
    if (part === "p3" || part === "p4") {
      const pb = $app.querySelector("[data-play34]");
      if (pb) pb.addEventListener("click", () => (pb.classList.contains("playing") ? stopLines() : playLines(set, 0, { follow: false })));
      $app.querySelectorAll(".sline").forEach((el) => el.addEventListener("click", () => playLines(set, +el.dataset.line, { follow: true })));
      const sh = $app.querySelector("[data-shadow]");
      if (sh) sh.addEventListener("click", () => playLines(set, 0, { shadow: true, follow: true }));
    }
  }

  // ═════════════ 실전 홈 ═════════════
  function vPractice(r) {
    if (!needPractice(r)) return;
    const pred = C.predictScore(S.pr);
    const nLc = (S.pr.lc || []).length, nRc = (S.pr.rc || []).length;
    const solved = (part) => practicePool(part).filter((x) => S.prac[x.id]).length;
    const tile = (go, icon, cls, title, sub) => `<a class="tile" href="${go}"><span class="tico ${cls}">${ico(icon)}</span><b>${title}</b><span>${sub}</span></a>`;
    const btnTile = (attr, icon, cls, title, sub) => `<button class="tile" ${attr}><span class="tico ${cls}">${ico(icon)}</span><b>${title}</b><span>${sub}</span></button>`;
    const weak = C.weakTypes(S.qt).slice(0, 5);
    const gTotal = (PR.grammar || []).reduce((n, t) => n + t.qs.filter((q) => !q.mock).length, 0);
    const gDone = Object.keys(S.gq).filter((k) => PR._g.has(k)).length;
    const body = `${topBar("실전 문제", { sub: `Part ${(PR.p1 || []).length ? 1 : 2}~7 · 하프 모의고사 · 예상 점수` })}
      <section class="score-card">
        <div class="eyebrow">예상 점수 (추정)</div>
        ${pred ? `<div class="big">${pred.total}<small>점</small></div><div class="meta"><div><b>${pred.lc}</b>LC</div><div><b>${pred.rc}</b>RC</div><div><b>${pred.nLc + pred.nRc}</b>최근 문제</div></div>`
          : `<div class="big" style="font-size:22px">LC·RC 각 30문제를 풀면<br>예상 점수를 알려 드려요</div><div class="meta"><div><b>${Math.min(nLc, 30)}/30</b>LC</div><div><b>${Math.min(nRc, 30)}/30</b>RC</div></div>`}
        <a class="btn block" href="#/mock" style="margin-top:14px">${ico("clock")}하프 모의고사 (${(PR.mocks || []).length}회)</a>
      </section>
      <div class="section-h"><h2>LC 듣기</h2></div>
      <div class="grid2">
        ${practicePool("p1").length ? tile("#/sets/p1", "camera", "c-gold", "Part 1 사진 묘사", `${solved("p1")} / ${practicePool("p1").length}문제`) : ""}
        ${btnTile('data-pgo="p2"', "ear", "c-purple", "Part 2 응답", `질문 듣고 3지선다 · ${(D.lc || []).filter(C.canRespond).length}문항`)}
        ${tile("#/sets/p3", "headphones", "c-blue", "Part 3 대화", `${solved("p3")} / ${practicePool("p3").length}세트`)}
        ${tile("#/sets/p4", "vol", "c-green", "Part 4 담화", `${solved("p4")} / ${practicePool("p4").length}세트`)}
        ${tile("#/dict", "pencil", "c-orange", "받아쓰기", "듣고 쓰기 · 따라 말하기")}
      </div>
      <div class="section-h"><h2>RC 읽기</h2></div>
      <div class="grid2">
        ${tile("#/grammar", "book", "c-blue", "Part 5 문법", `${(PR.grammar || []).length}개 주제 · ${gDone}/${gTotal}문제`)}
        ${btnTile('data-pgo="p5w"', "zap", "c-purple", "Part 5 어휘 20제", "외운 단어로 실전 문제")}
        ${tile("#/sets/p6", "layers", "c-orange", "Part 6 장문 빈칸", `${solved("p6")} / ${practicePool("p6").length}지문`)}
        ${tile("#/sets/p7", "list", "c-green", "Part 7 독해", `${solved("p7")} / ${practicePool("p7").length}세트`)}
      </div>
      <div class="section-h"><h2>표현 · 특훈</h2></div>
      <div class="grid2">
        ${(D.lc || []).length ? tile("#/lc", "ear", "c-purple", "LC 빈출 표현", `Part 2~4 표현 ${D.lc.length}개`) : ""}
        ${tile("#/part1", "camera", "c-green", "Part 1 사진 표현", `사진 묘사 필수 ${D.part1.length}문장`)}
        ${tile("#/conf", "split", "c-gold", "혼동 어휘", `헷갈리는 단어 ${D.conf.length}세트`)}
        ${btnTile('data-pgo="para"', "swap", "c-orange", "Part 7 동의어 20제", "문맥 속 바꿔 쓰기")}
        ${btnTile('data-pgo="listen"', "headphones", "c-blue", "단어 듣기 모드", "출퇴근길 자동 재생")}
      </div>
      <div class="section-h"><h2>약점 분석</h2><span class="small muted">5문제 이상 푼 유형</span></div>
      ${weak.length ? `<div class="card">${weak.map((w) => `<div class="weak"><div class="spacer"><b>${PART_LABEL[w.part] || w.part} · ${esc(w.type)}</b><div class="small muted">${w.ok}/${w.n} 정답</div></div><div class="wbar"><i style="width:${w.pct}%;background:${w.pct >= 80 ? "var(--ok)" : w.pct >= 60 ? "var(--accent)" : "var(--bad)"}"></i></div><b class="wpct">${w.pct}%</b>${["p1", "p2", "p3", "p4", "p5", "p6", "p7"].includes(w.part) ? `<button class="btn ghost sm" data-weak="${esc(w.key)}">연습</button>` : ""}</div>`).join("")}</div>`
        : `<div class="empty" style="padding:20px">${ico("gauge")}<b>아직 데이터가 부족해요</b>문제를 풀면 유형별 정답률과 약점을 알려 드려요</div>`}
      <p class="small muted" style="margin-top:14px">모든 문제는 이 앱에서 새로 만든 실전형 문제입니다(기출 문제 아님). 예상 점수는 최근 정답률로 계산한 참고용 추정치예요.</p>`;
    shell("practice", body);
    $app.querySelectorAll("[data-pgo]").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.pgo === "p2") return startLcQuiz("resp", D.lc || []);
      if (b.dataset.pgo === "para" || b.dataset.pgo === "listen") return homeGo(b.dataset.pgo, C.todayPlan(pool(), S.words, S.profile.daily, today()), []);
      const P = pool();
      const seen = P.filter((w) => st(w.id) && st(w.id).n);
      startQuiz(C.shuffle(seen.length >= 20 ? seen : P.slice(0, 200)).slice(0, 20), "part5", { title: "Part 5 어휘 20제" });
    }));
    $app.querySelectorAll("[data-weak]").forEach((b) => b.addEventListener("click", () => practiceWeak(b.dataset.weak)));
  }
  // 약점 유형 연습: 그 유형 문제가 있는 세트를 모아 3세트, 문법은 해당 주제로
  function practiceWeak(key) {
    const [part, type] = key.split(":");
    if (part === "p2") return startLcQuiz("resp", D.lc || []);
    if (type === "문장 듣기") return startLcQuiz("lcm", (D.lc || []).filter((x) => x.part === (part === "p4" ? 4 : 3)));
    if (part === "p5") {
      const t = (PR.grammar || []).find((x) => x.title === type);
      if (t) return go(`#/grammar/${t.id}`);
      const P = pool();
      const seen = P.filter((w) => st(w.id) && st(w.id).n);
      return startQuiz(C.shuffle(seen.length >= 20 ? seen : P.slice(0, 200)).slice(0, 20), "part5", { title: "Part 5 어휘 20제" });
    }
    const sets = practicePool(part).filter((s) => s.qs.some((q) => (q.type || q.kind) === type));
    if (!sets.length) return toast("연습할 세트가 없어요");
    startSets(part, pickSets(sets, 3), `${PART_LABEL[part]} · ${type} 집중`);
  }
  // 안 푼 세트 → 틀린 문제가 있던 세트 → 오래전에 푼 세트 순으로 고른다
  function pickSets(sets, n) {
    const rank = (x) => { const r = S.prac[x.id]; return !r ? 0 : r.ok < r.n ? 1 : 2; };
    const lv = C.levelsFor(target());
    const fit = sets.filter((x) => lv.includes(x.lv));
    if (fit.length >= n * 3) sets = fit;
    return C.shuffle(sets).sort((a, b) => rank(a) - rank(b) || ((S.prac[a.id] || {}).last || 0) - ((S.prac[b.id] || {}).last || 0)).slice(0, n);
  }

  // ═════════════ 세트 목록 (Part 3·4·6·7) ═════════════
  const SET_TITLE = { p1: "Part 1 사진 묘사", p3: "Part 3 대화", p4: "Part 4 담화", p6: "Part 6 장문 빈칸", p7: "Part 7 독해" };
  const catOf = (part, s) => (part === "p1" ? s.kind : part === "p3" ? s.topic : part === "p4" ? s.talk : part === "p6" ? s.doc : { single: "단일 지문", double: "이중 지문", triple: "삼중 지문" }[s.kind]);
  function vSets(r) {
    if (!needPractice(r)) return;
    const part = ["p1", "p3", "p4", "p6", "p7"].includes(r.arg) && (r.arg !== "p1" || (PR.p1 || []).length) ? r.arg : "p3";
    const all = practicePool(part);
    if (!ui.setF) ui.setF = {};
    const f = ui.setF[part] || { cat: "all", lv: 0 };
    const cats = Array.from(new Set(all.map((s) => catOf(part, s))));
    const list = all.filter((s) => (f.cat === "all" || (f.cat === "new" ? !S.prac[s.id] : f.cat === "wrong" ? S.prac[s.id] && S.prac[s.id].ok < S.prac[s.id].n : catOf(part, s) === f.cat)) && (!f.lv || s.lv === f.lv));
    const desc = { p1: "사진을 먼저 보고 사람의 동작·사물의 상태·위치를 미리 떠올리세요. 사람이 없는 사진에서 'is being p.p.'(지금 ~되는 중)는 거의 항상 오답이에요.", p3: "대화를 듣기 전에 문제를 먼저 읽어 두세요. 채점 후 스크립트에서 정답 근거 문장을 보여 드려요.", p4: "첫 문장에서 담화 종류와 장소를 잡으세요. 채점 후 문장마다 다시 듣고 따라 말할 수 있어요.", p6: "빈칸 앞뒤만 보지 말고 문맥(시제·흐름)을 보세요. 문장 삽입은 앞뒤 문장과의 연결이 핵심이에요.", p7: "문제를 먼저 읽고 지문에서 근거를 찾으세요. 채점 후 근거 문장을 지문에 표시해 드려요." }[part];
    const preview = (s) => part === "p1" ? s.setting : part === "p3" || part === "p4" ? s.lines[0].en : part === "p6" ? s.paras.find((p) => p.length > 30) || s.paras[0] : s.docs[0].paras[0];
    const row = (s) => {
      const rec = S.prac[s.id];
      return `<button class="witem" data-set="${s.id}" style="align-items:flex-start">${part === "p1" ? `<img class="p1thumb" src="${esc(s.img)}" alt="" loading="lazy">` : ""}<div class="wbody"><div class="small" style="font-weight:700;color:var(--text-2)">${esc(catOf(part, s))} · ${LV_LABEL[s.lv]}${part === "p7" ? ` · ${s.docs.map((d) => d.doc).join(" + ")}` : ""} · ${s.qs.length}문제</div><div class="wm en" style="margin-top:2px">${esc(preview(s).replace(/\{\d\}/g, "____"))}</div></div>${rec ? `<span class="badge ${rec.ok === rec.n ? "ok" : "bad"}">${rec.ok}/${rec.n}</span>` : ""}</button>`;
    };
    const solvedN = all.filter((s) => S.prac[s.id]).length;
    const body = `${topBar(SET_TITLE[part], { back: true, sub: part === "p1" ? `${all.length}문제 · 푼 문제 ${solvedN}` : `${all.length}${part === "p6" ? "지문" : "세트"} · 푼 세트 ${solvedN}` })}
      <div class="tip-box" style="margin-bottom:12px">${desc}</div>
      <button class="btn block" data-run style="margin-bottom:12px" ${list.length ? "" : "disabled"}>${ico("play")}${part === "p1" ? "6문제" : part === "p7" ? "2세트" : "3세트"} 이어 풀기</button>
      <div class="seg" style="margin-bottom:10px">${[[0, "전체"], [1, "쉬움"], [2, "보통"], [3, "어려움"]].map(([v, t]) => `<button class="${f.lv === v ? "on" : ""}" data-lv="${v}">${t}</button>`).join("")}</div>
      <div class="chips scroll" style="margin-bottom:12px">${[["all", "전체"], ["new", "안 푼 것"], ["wrong", "틀린 것"]].concat(cats.map((c) => [c, c])).map(([v, t]) => `<button class="chip ${f.cat === v ? "on" : ""}" data-cat="${esc(v)}">${esc(t)}</button>`).join("")}</div>
      ${list.length ? `<div class="wlist">${list.map(row).join("")}</div>` : `<div class="empty">${ico("check")}<b>조건에 맞는 세트가 없어요</b></div>`}`;
    shell("practice", body);
    const set = (patch) => { ui.setF[part] = Object.assign({}, f, patch); vSets(r); };
    $app.querySelectorAll("[data-lv]").forEach((b) => b.addEventListener("click", () => set({ lv: +b.dataset.lv })));
    $app.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => set({ cat: b.dataset.cat })));
    $app.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => startSets(part, [PR._by.get(b.dataset.set)], SET_TITLE[part])));
    const run = $app.querySelector("[data-run]");
    if (run) run.addEventListener("click", () => startSets(part, pickSets(list, part === "p1" ? 6 : part === "p7" ? 2 : 3), SET_TITLE[part]));
  }

  // ═════════════ 세트 풀기 (연습 모드: 풀기 → 채점 → 해설·스크립트) ═════════════
  function startSets(part, sets, title) {
    if (!sets.length) return toast("풀 세트가 없어요");
    session = { kind: "pset", part, title, queue: sets, i: 0, st: { picks: [], graded: false, evQ: null }, results: [], from: location.hash };
    enterStudy();
  }
  function vPset() {
    const s = session;
    const set = s.queue[s.i];
    const st = s.st;
    const mode = st.graded ? "review" : "practice";
    const all = st.picks.filter((x) => x != null).length === set.qs.length;
    const nQ = s.queue.reduce((n, x) => n + x.qs.length, 0);
    const done = s.queue.slice(0, s.i).reduce((n, x) => n + x.qs.length, 0);
    const answeredNow = st.graded ? set.qs.length : st.picks.filter((x) => x != null).length;
    const jump = (s.part === "p6" || s.part === "p7") ? `<div class="jumpbar"><button data-jumpto=".doc">${ico("book")}지문</button><button data-jumpto=".pqs">${ico("list")}문제</button></div>` : "";
    $app.innerHTML = `<div class="study ${s.part === "p7" ? "wide-study" : ""}">${studyTop(Math.max(0, done + answeredNow - 1), nQ)}${jump}
      <div class="small muted" style="margin:0 2px 8px;font-weight:700">${esc(s.title)} · ${s.i + 1}/${s.queue.length}${s.part === "p1" ? "문제" : "세트"}</div>
      ${setHtml(s.part, set, st, mode)}
      <div class="study-foot">${st.graded ? `<button class="btn block" data-next>${s.i + 1 >= s.queue.length ? "결과 보기" : s.part === "p1" ? "다음 문제" : "다음 세트"}</button>` : `<button class="btn block" data-grade ${all ? "" : "disabled"}>${all ? "채점하기" : `${set.qs.length - st.picks.filter((x) => x != null).length}문제 남음`}</button>`}</div></div>`;
    bindExit();
    const rerender = () => { const y = window.scrollY; vPset(); window.scrollTo(0, y); };
    bindSetCommon(s.part, set, st, rerender);
    $app.querySelectorAll("[data-jumpto]").forEach((b) => b.addEventListener("click", () => { const t = $app.querySelector(b.dataset.jumpto); if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 60, behavior: "smooth" }); }));
    if (!st.graded) bindPicks(st, () => {
      if (s.part === "p6") return rerender();
      const g = $app.querySelector("[data-grade]");
      const n = st.picks.filter((x) => x != null).length;
      const cnt = $app.querySelector(".study-top .cnt");
      if (cnt) cnt.textContent = `${Math.min(done + Math.max(1, n), nQ)} / ${nQ}`;
      const bar = $app.querySelector(".study-top .bar i");
      if (bar) bar.style.width = `${Math.round(((done + n) / nQ) * 100)}%`;
      if (g) { g.disabled = n < set.qs.length; g.textContent = n < set.qs.length ? `${set.qs.length - n}문제 남음` : "채점하기"; }
    });
    const gb = $app.querySelector("[data-grade]");
    if (gb) gb.addEventListener("click", () => {
      stopLines();
      st.graded = true;
      let ok = 0;
      set.qs.forEach((q, j) => {
        const good = st.picks[j] === q.a;
        if (good) ok += 1;
        recordAnswer(secOf(s.part), `${s.part}:${q.type || q.kind}`, good);
        s.results.push({ part: s.part, set, q, ok: good });
      });
      S.prac[set.id] = { ok, n: set.qs.length, last: today() };
      (ok === set.qs.length ? Sfx.ok : Sfx.bad)();
      save();
      // 처음 틀린 문제의 근거를 바로 보여 준다
      const firstWrong = set.qs.findIndex((q, j) => st.picks[j] !== q.a);
      st.evQ = firstWrong >= 0 ? firstWrong : null;
      vPset();
      window.scrollTo(0, 0);
    });
    const nx = $app.querySelector("[data-next]");
    if (nx) nx.addEventListener("click", () => {
      stopLines();
      s.i += 1;
      s.st = { picks: [], graded: false, evQ: null };
      if (s.i >= s.queue.length) return finishSession();
      vPset();
      window.scrollTo(0, 0);
    });
    keyHandler = (e) => {
      if (e.key === "Escape") return askExit();
      if (onControl(e)) return;
      if (st.graded && e.key === "Enter") { e.preventDefault(); return nx && nx.click(); }
      if (!st.graded && e.key === "Enter" && gb && !gb.disabled) { e.preventDefault(); return gb.click(); }
      if (!st.graded && /^[1-4]$/.test(e.key)) {
        const j = set.qs.findIndex((q, k) => st.picks[k] == null);
        const btn = j >= 0 && $app.querySelector(`.pq [data-q="${j}"][data-o="${+e.key - 1}"]`);
        if (btn) { btn.click(); const nx2 = document.getElementById(`pq-${j + 1}`); if (nx2) nx2.scrollIntoView({ block: "center", behavior: "smooth" }); }
        return;
      }
      if ((e.key === " " || e.key === "p") && (s.part === "p1" || s.part === "p3" || s.part === "p4")) { e.preventDefault(); const pb = $app.querySelector("[data-play34]"); if (pb) pb.click(); }
    };
    // Part 3·4: 처음 열면 문제를 읽을 시간을 조금 준 뒤 자동 재생
    if (!st.graded && (s.part === "p1" || s.part === "p3" || s.part === "p4") && !st.autoplayed) {
      st.autoplayed = true;
      setTimeout(() => { if (session === s && s.queue[s.i] === set && !st.graded) playLines(set, 0); }, s.part === "p1" ? 900 : 1500);
    }
  }
  function psetResultHtml(s) {
    const ok = s.results.filter((r) => r.ok).length;
    const total = s.results.length;
    const score = total ? Math.round((ok / total) * 100) : 0;
    const byType = {};
    s.results.forEach((r) => { const k = r.q.type || r.q.kind; byType[k] = byType[k] || { ok: 0, n: 0 }; byType[k].n += 1; if (r.ok) byType[k].ok += 1; });
    const hero = `<div class="result-hero"><div class="score" style="color:${score >= 80 ? "var(--ok)" : score >= 50 ? "var(--accent)" : "var(--bad)"}">${score}<small>점</small></div><div class="msg">${score === 100 ? "완벽해요!" : score >= 80 ? "훌륭해요!" : score >= 50 ? "조금만 더 하면 돼요" : "해설과 근거를 다시 보세요"}</div><p class="muted">${esc(s.title)} · ${total}문제 중 ${ok}개 정답</p></div>`;
    const types = `<div class="card">${Object.keys(byType).map((k) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${byType[k].ok} / ${byType[k].n}</span></div>`).join("")}</div>`;
    return { hero, types, score, total };
  }

  // ═════════════ Part 5 문법 ═════════════
  function vGrammar(r) {
    if (!needPractice(r)) return;
    if (r.arg) return vGrammarTopic(r);
    const cats = Array.from(new Set(PR.grammar.map((t) => t.cat)));
    const prog = (t) => { const qs = t.qs.filter((q) => !q.mock); const done = qs.filter((q) => S.gq[q.id]); return { n: qs.length, done: done.length, ok: done.filter((q) => !S.gq[q.id].wrong).length }; };
    const body = `${topBar("Part 5 문법", { back: true, sub: `${PR.grammar.length}개 주제 · 핵심 강의 + 실전 문제` })}
      <button class="btn block" data-mix style="margin-bottom:6px">${ico("shuffle")}문법 랜덤 20제</button>
      <button class="btn ghost block" data-wrong style="margin-bottom:14px">${ico("repeat")}틀린 문법 문제 다시 (${Object.keys(S.gq).filter((k) => S.gq[k].wrong && PR._g.has(k)).length})</button>
      ${cats.map((c) => `<div class="section-h"><h2>${esc(c)}</h2></div><div class="wlist">${PR.grammar.filter((t) => t.cat === c).map((t) => { const p = prog(t); return `<a class="witem" href="#/grammar/${t.id}"><div class="wbody"><div class="ww" style="font-size:16px">${esc(t.title)}</div><div class="wm">${p.done ? `${p.done}/${p.n}문제 · 정답 ${p.ok}` : `${p.n}문제`}</div></div>${p.done === p.n && p.n ? `<span class="badge ok">완료</span>` : ""}${ico("right")}</a>`; }).join("")}</div>`).join("")}`;
    shell("practice", body);
    $app.querySelector("[data-mix]").addEventListener("click", () => {
      const qs = PR.grammar.flatMap((t) => t.qs.filter((q) => !q.mock));
      startGrammarQuiz(C.lcPick(qs, Object.fromEntries(Object.entries(S.gq)), 20), "문법 랜덤 20제");
    });
    $app.querySelector("[data-wrong]").addEventListener("click", () => {
      const qs = PR.grammar.flatMap((t) => t.qs.filter((q) => S.gq[q.id] && S.gq[q.id].wrong));
      if (!qs.length) return toast("틀린 문법 문제가 없어요");
      startGrammarQuiz(C.shuffle(qs).slice(0, 30), "틀린 문법 문제");
    });
  }
  function vGrammarTopic(r) {
    const t = PR.grammar.find((x) => x.id === r.arg);
    if (!t) return go("#/grammar");
    const qs = t.qs.filter((q) => !q.mock);
    const body = `${topBar(esc(t.title), { back: true, sub: `${esc(t.cat)} · 문제 ${qs.length}개` })}
      ${t.lesson.map((l, i) => `<div class="card lesson"><div class="lesson-h"><span class="pq-n">${i + 1}</span><b>${esc(l.h)}</b></div><p>${esc(l.t)}</p>${l.ex.map((e) => `<div class="lesson-ex"><div class="en">${hl(e.en)}</div><div class="ko">${esc(e.ko)}</div></div>`).join("")}</div>`).join("")}
      <div class="tip-box" style="margin-top:12px"><b>함정 주의</b> ${esc(t.trap)}</div>
      <button class="btn block" data-start style="margin-top:14px">${ico("zap")}문제 ${qs.length}개 풀기</button>`;
    shell("practice", body);
    $app.querySelector("[data-start]").addEventListener("click", () => startGrammarQuiz(C.shuffle(qs), t.title));
  }
  function startGrammarQuiz(qs, title) {
    if (!qs.length) return toast("문제가 없어요");
    session = { kind: "gq", title, qs, i: 0, answered: null, results: [], from: location.hash };
    enterStudy();
  }
  function vGq() {
    const s = session;
    const q = s.qs[s.i];
    const t = PR._g.get(q.id).t;
    const ans = s.answered;
    const opts = q.o.map((o, i) => {
      let cls = "";
      if (ans) cls = i === q.a ? "right" : i === ans.pick ? "wrong" : "dim";
      return `<button class="opt ${cls}" data-pick="${i}" ${ans ? "disabled" : ""}><span class="on">${LETTERS[i]}</span><span class="en">${esc(o)}</span></button>`;
    }).join("");
    $app.innerHTML = `<div class="study">${studyTop(s.i, s.qs.length)}
      <div class="quiz-q"><div class="qk">Part 5 · ${esc(t.title)}${q.lv ? ` · ${LV_LABEL[q.lv]}` : ""}</div><div class="qs en">${esc(q.s).replace("-------", '<b style="color:var(--brand);letter-spacing:.05em">_______</b>')}</div></div>
      <div class="opts">${opts}</div>
      ${ans ? `<div class="feedback ${ans.ok ? "ok" : "bad"}"><b class="t">${ans.ok ? "정답이에요!" : `틀렸어요 · 정답 ${LETTERS[q.a]}`}</b>${esc(q.exp)}<div style="margin-top:8px"><a href="#/grammar/${t.id}" class="small" data-lesson>${ico("book")} '${esc(t.title)}' 강의 보기</a></div></div>` : ""}
      <div class="study-foot">${ans ? `<button class="btn block" data-next>${s.i + 1 >= s.qs.length ? "결과 보기" : "다음 문제"}</button>` : ""}<div class="kbd-hint"><kbd>1</kbd>~<kbd>4</kbd> 선택 · <kbd>Enter</kbd> 다음</div></div></div>`;
    bindExit();
    const pick = (i) => {
      if (s.answered) return;
      const ok = i === q.a;
      s.answered = { pick: i, ok };
      s.results.push({ q, ok });
      S.gq[q.id] = C.lcRecord(S.gq[q.id], ok, today());
      recordAnswer("rc", `p5:${t.title}`, ok);
      (ok ? Sfx.ok : Sfx.bad)();
      save();
      vGq();
    };
    const next = () => { if (!s.answered) return; s.i += 1; s.answered = null; if (s.i >= s.qs.length) return finishSession(); vGq(); };
    $app.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => pick(+b.dataset.pick)));
    const nx = $app.querySelector("[data-next]");
    if (nx) nx.addEventListener("click", next);
    const ls = $app.querySelector("[data-lesson]");
    if (ls) ls.addEventListener("click", (e) => {
      e.preventDefault();
      modal(`<h3>${esc(t.title)}</h3><div style="max-height:60vh;overflow-y:auto">${t.lesson.map((l) => `<div style="margin-bottom:10px"><b>${esc(l.h)}</b><p class="small" style="margin:4px 0;color:var(--text-2)">${esc(l.t)}</p>${l.ex.map((x) => `<div class="small en">${hl(x.en)}</div><div class="small muted">${esc(x.ko)}</div>`).join("")}</div>`).join("")}<div class="tip-box small"><b>함정</b> ${esc(t.trap)}</div></div><button class="btn block" data-close style="margin-top:12px">문제로 돌아가기</button>`);
    });
    keyHandler = (e) => {
      if (e.key === "Escape") return askExit();
      if (onControl(e)) return;
      if (s.answered && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); return next(); }
      if (!s.answered && /^[1-4]$/.test(e.key)) pick(+e.key - 1);
    };
  }

  // ═════════════ 받아쓰기 ═════════════
  // 재료: LC 빈출 표현의 한 사람 문장·대답 + Part 3·4 문장 (문장이 짧은 것부터)
  function dictSources() {
    const lc = (D.lc || []).map((p) => {
      const d = C.splitDialog(C.plainEx(p.e));
      if (d) return { text: d.a, rel: lcRel(p, "a"), ko: (C.splitDialog(p.k) || {}).a || "" };
      return { text: C.plainEx(p.e), rel: lcRel(p, ""), ko: p.k };
    });
    const p34 = PR ? practicePool("p3").concat(practicePool("p4")).flatMap((set) => set.lines.map((l, i) => ({ text: l.en, rel: lineRel(set, i), ko: l.ko }))) : [];
    return { lc, p34 };
  }
  function vDict(r) {
    if (!needPractice(r)) return;
    const src = dictSources();
    const body = `${topBar("받아쓰기", { back: true, sub: "듣고 쓰면 들리는 단어와 안 들리는 단어가 구분돼요" })}
      <div class="tip-box" style="margin-bottom:14px"><b>이렇게 하세요</b> 문장을 듣고 들리는 대로 쓰세요. 대소문자·문장부호는 채점하지 않아요. 틀린 단어는 빨간색으로 표시되고, 따라 말하기로 입에 붙일 수 있어요.</div>
      <div class="grid2">
        <button class="tile" data-src="short"><span class="tico c-blue">${ico("ear")}</span><b>짧은 문장</b><span>LC 빈출 표현 ${src.lc.length}개 중 10문장</span></button>
        <button class="tile" data-src="long"><span class="tico c-purple">${ico("headphones")}</span><b>긴 문장</b><span>Part 3·4 대화 문장 ${src.p34.length}개 중 10문장</span></button>
      </div>`;
    shell("practice", body);
    $app.querySelectorAll("[data-src]").forEach((b) => b.addEventListener("click", () => {
      const list = b.dataset.src === "short" ? src.lc : src.p34.filter((x) => x.text.split(" ").length >= 6 && x.text.split(" ").length <= 22);
      startDict(C.shuffle(list).slice(0, 10), b.dataset.src === "short" ? "받아쓰기 · 짧은 문장" : "받아쓰기 · 긴 문장");
    }));
  }
  function startDict(items, title) {
    if (!items.length) return toast("문장이 없어요");
    session = { kind: "dict", title, items, i: 0, res: null, results: [], from: location.hash };
    enterStudy();
  }
  function vDictSession() {
    const s = session;
    const it = s.items[s.i];
    const res = s.res;
    $app.innerHTML = `<div class="study">${studyTop(s.i, s.items.length)}
      <div class="quiz-q"><div class="qk">${esc(s.title)}</div><button class="play lg" data-say style="margin:12px auto 0;width:76px;height:76px" aria-label="듣기">${ico("vol")}</button>
        <div class="row" style="justify-content:center;gap:8px;margin-top:10px"><button class="btn ghost sm" data-slow>${ico("repeat")}천천히</button></div></div>
      ${res ? `<div class="card dict-res"><div class="en" style="font-size:18px;line-height:1.6">${res.tokens.map((t) => `<span class="${t.st === "miss" ? "miss" : ""}">${esc(t.w)}</span>`).join(" ")}</div><div class="ko" style="margin-top:6px">${esc(it.ko)}</div><div class="small muted" style="margin-top:8px">내가 쓴 문장: <span class="en">${esc(s.typed || "(비어 있음)")}</span></div><div class="row" style="margin-top:10px"><b style="font-size:20px;color:${res.pct >= 90 ? "var(--ok)" : res.pct >= 60 ? "var(--accent)" : "var(--bad)"}">${res.pct}%</b><span class="muted small" style="margin-left:6px">${res.ok}/${res.total} 단어</span><span class="spacer"></span><button class="btn ghost sm" data-shadow>${ico("repeat")}따라 말하기</button></div></div>`
        : `<textarea id="dict-in" class="spell-input en" rows="3" style="height:auto;min-height:96px;text-align:left;font-size:17px" placeholder="들리는 대로 쓰세요" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>`}
      <div class="study-foot">${res ? `<button class="btn block" data-next>${s.i + 1 >= s.items.length ? "결과 보기" : "다음 문장"}</button>` : `<button class="btn block" data-check>확인</button>`}<div class="kbd-hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> 확인 · <kbd>Ctrl</kbd>+<kbd>Space</kbd> 다시 듣기</div></div></div>`;
    bindExit();
    const say = (rate) => Sound.play(it.rel, it.text, { btn: $app.querySelector("[data-say]"), rate });
    $app.querySelector("[data-say]").addEventListener("click", () => say());
    $app.querySelector("[data-slow]").addEventListener("click", () => say(0.8));
    const input = document.getElementById("dict-in");
    const check = () => {
      if (s.res) return;
      s.typed = input ? input.value.trim() : "";
      s.res = C.dictDiff(it.text, s.typed);
      s.results.push({ ok: s.res.pct >= 90, pct: s.res.pct, it });
      const l = logToday();
      l.q += 1;
      if (s.res.pct >= 90) l.ok += 1;
      save();
      vDictSession();
    };
    const next = () => { if (!s.res) return; s.i += 1; s.res = null; s.typed = ""; if (s.i >= s.items.length) return finishSession(); vDictSession(); };
    const ck = $app.querySelector("[data-check]");
    if (ck) ck.addEventListener("click", check);
    const nx = $app.querySelector("[data-next]");
    if (nx) nx.addEventListener("click", next);
    const sh = $app.querySelector("[data-shadow]");
    if (sh) sh.addEventListener("click", async () => {
      await say(0.9);
      await wait(2500);
      if (session === s && s.items[s.i] === it && s.res) say();
    });
    if (input) {
      setTimeout(() => input.focus(), 50);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); check(); }
        else if (e.key === " " && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); say(); }
      });
      setTimeout(() => { if (session === s && s.items[s.i] === it && !s.res) say(); }, 300);
    }
    keyHandler = (e) => {
      if (e.key === "Escape") return askExit();
      if (onControl(e)) return;
      if (s.res && e.key === "Enter") { e.preventDefault(); next(); }
    };
  }

  // ═════════════ 하프 모의고사 ═════════════
  // LC(Part 2·3·4) → RC(Part 5·6·7). 풀 때는 해설 없이, 끝나면 예상 점수·파트별 분석·전체 해설
  const RC_MIN = 37;
  function mockPages(m) {
    const pages = [];
    (m.p1 || []).forEach((id) => pages.push({ part: "p1", set: PR._by.get(id) }));
    m.p2.forEach((id) => { const it = D.lcAll.find((p) => p.id === id); if (it) pages.push({ part: "p2", item: it, q: C.makeResponse(it, C.rng(parseInt(id.slice(3), 10) * 7919 + m.n * 104729)) }); });
    m.p3.forEach((id) => pages.push({ part: "p3", set: PR._by.get(id) }));
    m.p4.forEach((id) => pages.push({ part: "p4", set: PR._by.get(id) }));
    (m.p5w || []).forEach((id) => { const w = BY_ID.get(id); const q = w && (w.mq || w.q); if (q) pages.push({ part: "p5", word: w, q: { s: q.s, o: q.o, a: q.a, exp: q.k, type: "어휘" } }); });
    (m.p5g || []).forEach((id) => { const g = PR._g.get(id); if (g) pages.push({ part: "p5", g: g.t, q: Object.assign({ type: g.t.title }, g.q) }); });
    m.p6.forEach((id) => pages.push({ part: "p6", set: PR._by.get(id) }));
    m.p7.forEach((id) => pages.push({ part: "p7", set: PR._by.get(id) }));
    // Part 5 는 어휘·문법을 섞는다 (고정 시드)
    const p5 = pages.filter((p) => p.part === "p5");
    const mixed = C.shuffle(p5, C.rng(m.n * 7));
    let k = 0;
    return pages.map((p) => (p.part === "p5" ? mixed[k++] : p)).filter((p) => !("set" in p) || p.set);
  }
  const pageQs = (p) => (p.set ? p.set.qs : [p.q]);
  function vMock(r) {
    if (!needPractice(r)) return;
    const mocks = PR.mocks || [];
    const card = (m) => {
      const pages = mockPages(m);
      const nLc = pages.filter((p) => secOf(p.part) === "lc").reduce((n, p) => n + pageQs(p).length, 0);
      const nRc = pages.filter((p) => secOf(p.part) === "rc").reduce((n, p) => n + pageQs(p).length, 0);
      const rec = S.mock[m.n];
      const run = S.mockRun && S.mockRun.n === m.n ? S.mockRun : null;
      const runInfo = run ? `<div class="tip-box" style="margin-top:10px;font-size:14px">풀던 모의고사가 있어요 · ${run.picks.flat().filter((x) => x != null).length}문제 답함${run.rcUsed != null ? ` · RC 남은 시간 ${Math.max(0, RC_MIN - Math.floor(run.rcUsed / 60000))}분` : ""}</div><div class="row" style="gap:8px;margin-top:10px"><button class="btn block" data-resume="${m.n}" style="flex:2">이어서 풀기</button><button class="btn ghost" data-mock="${m.n}" style="flex:1">처음부터</button></div>` : "";
      if (run) return `<div class="card" style="margin-top:10px"><div class="row"><div class="spacer"><b style="font-size:17px">하프 모의고사 ${m.n}회</b><div class="small muted">LC ${nLc}문제 · RC ${nRc}문제 (RC ${RC_MIN}분)</div></div></div>${runInfo}</div>`;
      return `<div class="card" style="margin-top:10px"><div class="row"><div class="spacer"><b style="font-size:17px">하프 모의고사 ${m.n}회</b><div class="small muted">LC ${nLc}문제 · RC ${nRc}문제 (RC ${RC_MIN}분)</div></div>${rec ? (rec.n > 1 ? `<div style="text-align:right"><b style="font-size:20px;color:var(--brand)">${rec.first}</b><div class="small muted">첫 응시 · 재응시 ${rec.total}점 (${rec.n}회째)</div></div>` : `<div style="text-align:right"><b style="font-size:20px;color:var(--brand)">${rec.total}</b><div class="small muted">LC ${rec.lc} · RC ${rec.rc}</div></div>`) : ""}</div>
        <button class="btn ${rec ? "ghost" : ""} block" style="margin-top:10px" data-mock="${m.n}">${rec ? "다시 응시하기" : "응시하기"}</button></div>`;
    };
    const body = `${topBar("하프 모의고사", { back: true, sub: `실제 시험의 절반 분량 · Part ${(PR.p1 || []).length >= 12 ? 1 : 2}~7` })}
      <div class="tip-box">실제 시험처럼 <b>해설 없이</b> 끝까지 풀고, 마지막에 <b>LC·RC 예상 점수</b>와 파트별 정답률, 전체 해설을 보여 드려요. LC 음성은 한 번만 재생돼요(실전 모드). 점수는 <b>첫 응시</b>가 기준이고, 다시 풀면 '재응시'로 따로 표시돼요.${(PR.p1 || []).length >= 12 ? "" : " Part 1(사진)은 아직 포함되지 않아요."}</div>
      ${mocks.map(card).join("")}`;
    shell("practice", body);
    $app.querySelectorAll("[data-resume]").forEach((b) => b.addEventListener("click", () => startMock(mocks.find((x) => x.n === +b.dataset.resume), true)));
    $app.querySelectorAll("[data-mock]").forEach((b) => b.addEventListener("click", () => {
      const m = mocks.find((x) => x.n === +b.dataset.mock);
      modal(`<h3>하프 모의고사 ${m.n}회</h3><p class="muted">LC → RC 순서로 진행하고, 해설은 끝난 뒤에 보여 드려요. 중간에 나가도 답안이 저장돼서 이어서 풀 수 있어요${S.mockRun && S.mockRun.n === m.n ? " (처음부터 시작하면 풀던 답안은 지워져요)" : ""}. 조용한 곳에서 이어폰을 끼고 시작하세요.</p>${S.mock[m.n] ? `<div class="tip-box" style="font-size:14px">이미 푼 모의고사예요 (첫 응시 ${S.mock[m.n].first || S.mock[m.n].total}점). 다시 풀면 <b>재응시</b>로 표시되고 예상 점수에는 반영되지 않아요.</div>` : ""}
        <div class="row" style="margin-top:14px;gap:8px"><button class="btn ghost" data-close style="flex:1">취소</button><button class="btn" data-go-mock style="flex:1">시작</button></div>`, (box) => {
        box.querySelector("[data-go-mock]").addEventListener("click", () => { closeModal(); delete S.mockRun; startMock(m); });
      });
    }));
  }
  function startMock(m, resume) {
    const pages = mockPages(m);
    const r = resume && S.mockRun && S.mockRun.n === m.n ? S.mockRun : null;
    const picks = pages.map((p, pi) => pageQs(p).map((_, qi) => (r && r.picks[pi] && Number.isInteger(r.picks[pi][qi]) ? r.picks[pi][qi] : null)));
    session = { kind: "mock", m, pages, i: r ? Math.min(r.i, pages.length - 1) : 0, picks, played: {}, heard: {}, rcStart: r && r.rcUsed != null ? Date.now() - r.rcUsed : null, from: location.hash, title: `하프 모의고사 ${m.n}회` };
    saveMockRun(session);
    enterStudy();
  }
  // 진행 중인 모의고사를 저장 (전화·앱 종료 뒤 이어서 풀기)
  function saveMockRun(s) {
    S.mockRun = { n: s.m.n, i: s.i, picks: s.picks, rcUsed: s.rcStart ? Date.now() - s.rcStart : null, at: today() };
    save();
  }
  function mockTimer(s) {
    if (!s.rcStart) return "";
    const left = Math.max(0, RC_MIN * 60 - Math.floor((Date.now() - s.rcStart) / 1000));
    return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  }
  function vMockSession() {
    const s = session;
    if (s.reviewing != null) return vMockReview();
    const p = s.pages[s.i];
    const sec = secOf(p.part);
    if (sec === "rc" && !s.rcStart) { s.rcStart = Date.now(); saveMockRun(s); }
    const firstNum = s.pages.slice(0, s.i).reduce((n, x) => n + pageQs(x).length, 0) + 1;
    const st = { picks: s.picks[s.i], graded: false, base: firstNum };
    const total = s.pages.reduce((n, x) => n + pageQs(x).length, 0);
    let inner;
    if (p.part === "p2") {
      inner = `<div class="quiz-q"><div class="qk">Part 2 · ${firstNum}번</div><button class="play lg" data-replay style="margin:12px auto 0;width:76px;height:76px" aria-label="듣기">${ico("vol")}</button><div class="small muted" style="margin-top:8px">질문과 보기 (A)(B)(C)가 한 번 재생돼요</div></div>
        <div class="opts">${p.q.options.map((o, i) => `<button class="opt ${st.picks[0] === i ? "sel" : ""}" data-pick="${i}"><span class="on">${LETTERS[i]}</span><span class="muted">보기 ${LETTERS[i]}</span></button>`).join("")}</div>`;
    } else if (p.part === "p5") {
      inner = `<div class="quiz-q"><div class="qk">Part 5 · ${firstNum}번</div><div class="qs en">${esc(p.q.s).replace("-------", '<b style="color:var(--brand)">_______</b>')}</div></div>
        <div class="opts">${p.q.o.map((o, i) => `<button class="opt ${st.picks[0] === i ? "sel" : ""}" data-pick="${i}"><span class="on">${LETTERS[i]}</span><span class="en">${esc(o)}</span></button>`).join("")}</div>`;
    } else {
      inner = `<div class="small muted" style="margin:0 2px 8px;font-weight:700">${PART_LABEL[p.part]} · ${firstNum}~${firstNum + p.set.qs.length - 1}번</div>${setHtml(p.part, p.set, st, "exam")}`;
    }
    const answered = s.picks.reduce((n, a) => n + a.filter((x) => x != null).length, 0);
    const rcIdx = s.pages.map((pg, pi) => (secOf(pg.part) === "rc" ? pi : -1)).filter((x) => x >= 0);
    const rcTotal = rcIdx.reduce((n, pi) => n + s.picks[pi].length, 0);
    const rcAnswered = rcIdx.reduce((n, pi) => n + s.picks[pi].filter((x) => x != null).length, 0);
    const canPrev = s.i > 0 && sec === "rc" && secOf(s.pages[s.i - 1].part) === "rc";
    $app.innerHTML = `<div class="study ${p.part === "p7" ? "wide-study" : ""}"><div class="study-top"><button class="icon-btn back" data-exit aria-label="닫기">${ico("x")}</button><div class="bar"><i style="width:${Math.round((answered / total) * 100)}%"></i></div><span class="cnt">${sec === "rc" ? `${ico("clock")} <b data-timer>${mockTimer(s)}</b>` : "LC"}</span></div>
      ${inner}
      <div class="study-foot"><div class="row" style="gap:8px">${canPrev ? `<button class="btn ghost" data-prev style="flex:1">이전</button>` : ""}<button class="btn" data-next style="flex:2">${s.i + 1 >= s.pages.length ? "제출하기" : sec === "lc" && secOf(s.pages[s.i + 1].part) === "rc" ? "RC 시작 (37분)" : "다음"}</button></div>
        ${sec === "rc" ? `<button class="btn ghost sm block" data-sheet style="margin-top:8px">답안지 보기 (RC ${rcAnswered}/${rcTotal})</button>` : ""}</div></div>`;
    $app.querySelector("[data-exit]").addEventListener("click", () => askExit());
    $app.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => { if (s.submitted) return; st.picks[0] = +b.dataset.pick; $app.querySelectorAll("[data-pick]").forEach((x) => x.classList.toggle("sel", x === b)); saveMockRun(s); }));
    if (p.set) bindPicks(st, () => { saveMockRun(s); if (p.part === "p6") { const y = window.scrollY; vMockSession(); window.scrollTo(0, y); } });
    const goPage = (i) => {
      if (s.submitted) return;
      if (s.rcStart && Date.now() - s.rcStart >= RC_MIN * 60 * 1000) { toast("시간이 끝났어요. 답안을 제출할게요"); return submitMock(); }
      stopLines(); lcqSeq += 1; Sound.stop(); s.i = i; saveMockRun(s); vMockSession(); window.scrollTo(0, 0); };
    const trySubmit = () => {
      const left = s.picks.reduce((n, a) => n + a.filter((x) => x == null).length, 0);
      if (!left) return submitMock();
      confirmBox("제출할까요?", `아직 ${left}문제를 풀지 않았어요. 제출하면 안 푼 문제는 오답으로 처리돼요.`, "제출하기").then((ok) => { if (ok) submitMock(); });
    };
    $app.querySelector("[data-next]").addEventListener("click", () => {
      if (s.i + 1 >= s.pages.length) return trySubmit();
      goPage(s.i + 1);
    });
    const pv = $app.querySelector("[data-prev]");
    if (pv) pv.addEventListener("click", () => goPage(s.i - 1));
    const sh = $app.querySelector("[data-sheet]");
    if (sh) sh.addEventListener("click", () => {
      let n = 0;
      const cells = s.pages.map((pg, pi) => pageQs(pg).map((q, qi) => { n += 1; return secOf(pg.part) === "rc" ? `<button class="sheet-c ${s.picks[pi][qi] != null ? "on" : ""} ${pi === s.i ? "cur" : ""}" data-pg="${pi}">${n}</button>` : ""; }).join("")).join("");
      modal(`<h3>답안지 <span class="small muted">RC ${rcAnswered}/${rcTotal} · 남은 시간 ${mockTimer(s)}</span></h3><div class="sheet">${cells}</div><div class="row" style="gap:8px;margin-top:12px"><button class="btn ghost" data-close style="flex:1">닫기</button><button class="btn" data-submit style="flex:1">제출하기</button></div>`, (box) => {
        box.querySelectorAll("[data-pg]").forEach((b) => b.addEventListener("click", () => { closeModal(); goPage(+b.dataset.pg); }));
        box.querySelector("[data-submit]").addEventListener("click", () => { closeModal(); trySubmit(); });
      });
    });
    // 음성: 페이지마다 한 번만 자동 재생 (실전 모드)
    if (!s.heard) s.heard = {};
    const here = () => session === s && s.pages[s.i] === p && !s.submitted;
    const playPage = async () => {
      const ok = p.part === "p2" ? await playLcq(p.q, null, here) : await playLines(p.set, 0);
      if (ok) s.heard[s.i] = true;
    };
    if (sec === "lc" && !s.played[s.i]) {
      s.played[s.i] = true;
      setTimeout(() => { if (here()) playPage(); }, p.part === "p2" ? 400 : 1200);
    }
    // 실전 모드: 한 번 들은 뒤에는 다시 듣기 없음 (자동재생이 막혀 못 들었을 때만 직접 재생)
    const rp = $app.querySelector("[data-replay]") || $app.querySelector("[data-play34]");
    if (rp) rp.addEventListener("click", (e) => {
      e.stopImmediatePropagation();
      if (s.heard[s.i]) return toast("실전 모드에서는 다시 들을 수 없어요");
      playPage();
    }, true);
    clearInterval(s.tick);
    if (sec === "rc") s.tick = setInterval(() => {
      if (session !== s || s.reviewing != null) return clearInterval(s.tick);
      const el = $app.querySelector("[data-timer]");
      if (el) el.textContent = mockTimer(s);
      if (Math.floor((Date.now() - s.rcStart) / 1000) % 15 === 0) saveMockRun(s);
      if (s.submitted) return clearInterval(s.tick);
      if (Date.now() - s.rcStart >= RC_MIN * 60 * 1000 && !document.getElementById("modal")) { clearInterval(s.tick); toast("시간이 끝났어요. 답안을 제출할게요"); submitMock(); }
    }, 1000);
    keyHandler = (e) => { if (e.key === "Escape") return askExit(); };
  }
  function submitMock() {
    const s = session;
    if (s.submitted) return;
    s.submitted = true;
    delete S.mockRun;
    closeModal();
    clearInterval(s.tick);
    stopLines();
    const stat = { lc: [0, 0], rc: [0, 0] };
    const parts = {};
    // 재응시: 이미 본 문제라 점수가 부풀려진다 → 예상 점수·유형별 정답률에는 넣지 않고 학습량(오늘 푼 문제 수)만 센다
    const prev = S.mock[s.m.n];
    s.pages.forEach((p, pi) => pageQs(p).forEach((q, qi) => {
      const ans = p.part === "p2" ? p.q.answer : q.a;
      const ok = s.picks[pi][qi] === ans;
      const sec = secOf(p.part);
      stat[sec][1] += 1;
      if (ok) stat[sec][0] += 1;
      parts[p.part] = parts[p.part] || [0, 0];
      parts[p.part][1] += 1;
      if (ok) parts[p.part][0] += 1;
      if (!prev) recordAnswer(sec, `${p.part}:${p.part === "p2" ? "응답" : q.type || q.kind || "어휘"}`, ok);
      else { const l = logToday(); l.q += 1; if (ok) l.ok += 1; }
    }));
    const est = C.estimateTotal(stat.lc[0] / Math.max(1, stat.lc[1]), stat.rc[0] / Math.max(1, stat.rc[1]));
    const attempt = prev ? (prev.n || 1) + 1 : 1;
    const first = prev ? prev.first || prev.total : est.total;
    S.mock[s.m.n] = Object.assign({}, est, { at: today(), best: Math.max(est.total, (prev && prev.best) || 0), n: attempt, first });
    s.result = { est, stat, parts, attempt, first };
    logToday().prac = true;
    markDone();
    save(true);
    s.done = true;
    vResult();
  }
  function mockResultHtml(s) {
    const { est, stat, parts, attempt, first } = s.result;
    const gap = target() - est.total;
    const retake = attempt > 1;
    const hero = `<div class="result-hero">${retake ? `<span class="badge bad" style="margin-bottom:6px">재응시 · ${attempt}회째</span>` : ""}<div class="eyebrow muted">${retake ? "다시 푼 점수 (참고용)" : "예상 점수 (추정)"}</div><div class="score" style="color:var(--brand)">${est.total}<small>점</small></div><div class="msg">LC ${est.lc} · RC ${est.rc}</div><p class="muted">LC ${stat.lc[0]}/${stat.lc[1]} · RC ${stat.rc[0]}/${stat.rc[1]} 정답</p>
      ${retake ? `<div class="tip-box" style="margin-top:12px;text-align:left"><b>이미 풀어 본 문제라 실제보다 높게 나올 수 있어요.</b> 첫 응시 점수 <b>${first}점</b>이 더 정확한 기준이에요. 이번 결과는 예상 점수와 약점 분석에 넣지 않았어요. 틀린 문제 해설을 다시 보는 복습용으로 활용하세요.</div>` : ""}
      <div class="tip-box" style="margin-top:12px;text-align:left">${gap <= 0 ? `<b>목표 ${target()}점 달성 수준이에요!</b> 남은 모의고사로 실력을 굳히고, 틀린 문제 해설을 꼭 보세요.` : `<b>목표 ${target()}점까지 약 ${gap}점</b> ${est.lc < est.rc ? "LC" : "RC"}가 상대적으로 약해요. 아래 파트별 정답률에서 낮은 파트부터 연습하세요.`}</div></div>`;
    const rows = Object.keys(parts).map((k) => { const [o, n] = parts[k]; const pct = Math.round((o / n) * 100); return `<div class="weak"><div class="spacer"><b>${PART_LABEL[k]}</b><div class="small muted">${o}/${n}</div></div><div class="wbar"><i style="width:${pct}%;background:${pct >= 80 ? "var(--ok)" : pct >= 60 ? "var(--accent)" : "var(--bad)"}"></i></div><b class="wpct">${pct}%</b></div>`; }).join("");
    return { hero, rows };
  }
  // 모의고사 해설: 페이지를 하나씩 리뷰 모드로
  // 해설 페이지 이동 (틀린 문제만 보기면 다 맞힌 페이지는 건너뛴다)
  function mockReviewNext(s, from, dir) {
    const wrongPage = (pi) => pageQs(s.pages[pi]).some((q, qi) => s.picks[pi][qi] !== (s.pages[pi].part === "p2" ? s.pages[pi].q.answer : q.a));
    for (let i = from + dir; i >= 0 && i < s.pages.length; i += dir) if (!s.wrongOnly || wrongPage(i)) return i;
    return -1;
  }
  function vMockReview() {
    const s = session;
    const pi = s.reviewing;
    const p = s.pages[pi];
    const st = { picks: s.picks[pi], graded: true, evQ: s.evQ, base: s.pages.slice(0, pi).reduce((n, x) => n + pageQs(x).length, 0) + 1 };
    let inner;
    if (p.part === "p2") {
      const q = { q: p.q.prompt, qko: p.q.promptKo, o: p.q.options.map((o) => o.t), a: p.q.answer, exp: `${p.item.key} = ${p.item.keyKo}${p.item.tip ? ` · ${p.item.tip}` : ""}`, type: "응답" };
      inner = qBlock(q, 0, st.picks[0], "review");
    } else if (p.part === "p5") inner = qBlock(Object.assign({}, p.q, { q: p.q.s }), 0, st.picks[0], "review");
    else inner = setHtml(p.part, p.set, st, "review");
    $app.innerHTML = `<div class="study ${p.part === "p7" ? "wide-study" : ""}"><div class="study-top"><button class="icon-btn back" data-back-res aria-label="결과로">${ico("x")}</button><div class="bar"><i style="width:${Math.round(((pi + 1) / s.pages.length) * 100)}%"></i></div><span class="cnt">${pi + 1} / ${s.pages.length}</span></div>
      <div class="small muted" style="margin:0 2px 8px;font-weight:700">해설 · ${PART_LABEL[p.part]}${s.wrongOnly ? " · 틀린 문제만" : ""}</div>${inner}
      <div class="study-foot"><div class="row" style="gap:8px"><button class="btn ghost" data-rprev style="flex:1" ${mockReviewNext(s, pi, -1) >= 0 ? "" : "disabled"}>이전</button><button class="btn" data-rnext style="flex:2">${mockReviewNext(s, pi, 1) < 0 ? "결과로" : "다음"}</button></div></div></div>`;
    const rerender = () => { const y = window.scrollY; s.evQ = st.evQ; vMockReview(); window.scrollTo(0, y); };
    if (p.set) bindSetCommon(p.part, p.set, st, rerender);
    if (p.part === "p2") $app.querySelector(".pq-h").insertAdjacentHTML("beforeend", ` <button class="play sm" data-p2say>${ico("vol")}</button>`);
    const ps = $app.querySelector("[data-p2say]");
    if (ps) ps.addEventListener("click", () => sayExpr(p.item, ps));
    const goR = (i) => { stopLines(); s.evQ = null; if (i >= s.pages.length || i < 0) { s.reviewing = null; return vResult(); } s.reviewing = i; vMockReview(); window.scrollTo(0, 0); };
    $app.querySelector("[data-rprev]").addEventListener("click", () => { const i = mockReviewNext(s, pi, -1); if (i >= 0) goR(i); });
    $app.querySelector("[data-rnext]").addEventListener("click", () => goR(mockReviewNext(s, pi, 1)));
    $app.querySelector("[data-back-res]").addEventListener("click", () => { stopLines(); s.reviewing = null; vResult(); });
    keyHandler = (e) => { if (e.key === "ArrowRight") goR(mockReviewNext(s, pi, 1)); if (e.key === "ArrowLeft") { const i = mockReviewNext(s, pi, -1); if (i >= 0) goR(i); } if (e.key === "Escape") { stopLines(); s.reviewing = null; vResult(); } };
  }

  // ═════════════ 혼동 어휘 ═════════════
  function vConf() {
    const body = `${topBar("혼동 어휘", { back: true, sub: "Part 5에서 자주 헷갈리는 단어 60세트" })}
      <button class="btn block" data-cq style="margin-bottom:14px">${ico("zap")}혼동 어휘 퀴즈 풀기</button>
      ${D.conf.map((c, idx) => `<div class="card" style="margin-top:10px"><div class="small muted" style="font-weight:700">${idx + 1}</div>
        ${c.words.map((x) => `<div class="kv"><span class="k en" style="min-width:110px">${esc(x.w)}</span><span class="badge pos">${POS_KO[x.pos] || x.pos}</span><span class="v">${esc(x.m)}</span></div>`).join("")}
        <div class="tip-box" style="margin-top:10px;font-size:14px">${esc(c.point)}</div></div>`).join("")}`;
    shell("conf", body);
    $app.querySelector("[data-cq]").addEventListener("click", () => startConfQuiz(D.conf.slice(0, 20).length ? C.shuffle(D.conf).slice(0, 20) : []));
  }

  // ═════════════ 검색 ═════════════
  function vSearch() {
    const body = `${topBar("단어 검색", { back: true })}
      <div class="search-box">${ico("search")}<input id="sq" type="search" placeholder="영어 또는 한국어 뜻으로 검색" value="${esc(ui.searchQ)}" autocomplete="off" autocapitalize="off" spellcheck="false" /></div>
      <div id="sres" style="margin-top:14px"></div>`;
    shell("search", body);
    const input = document.getElementById("sq");
    const run = () => {
      ui.searchQ = input.value;
      const res = C.search(WORDS, input.value, 60);
      document.getElementById("sres").innerHTML = input.value.trim()
        ? res.length ? `<div class="small muted" style="margin:0 2px 8px">${res.length}개</div><div class="wlist">${res.map(wordItem).join("")}</div>` : `<div class="empty">${ico("search")}<b>검색 결과가 없어요</b>철자를 확인하거나 다른 뜻으로 찾아보세요</div>`
        : `<div class="empty">${ico("book")}<b>${NWORDS}개 토익 단어에서 찾아요</b>파생어·동의어·한국어 뜻으로도 검색돼요</div>`;
    };
    input.addEventListener("input", run);
    run();
    setTimeout(() => input.focus(), 50);
  }

  // ═════════════ 통계 ═════════════
  function vStats() {
    const t = today();
    const P = pool();
    const sum = C.summarize(P, S.words);
    const streak = C.streak(S.log, t);
    let best = 0, run = 0;
    const keys = Object.keys(S.log).map(Number).sort((a, b) => a - b);
    for (let i = 0; i < keys.length; i++) {
      if (S.log[keys[i]].done) { run = i && keys[i - 1] === keys[i] - 1 && S.log[keys[i - 1]].done ? run + 1 : 1; best = Math.max(best, run); }
      else run = 0;
    }
    const finish = C.projectFinish(P, S.words, S.log, t, S.profile.daily, S.profile.start);
    const exam = C.parseYmd(S.profile.examDate);
    // 최근 28일 (월요일 시작 정렬)
    const start = t - 27;
    const firstDow = (C.dayToDate(start).getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push('<i style="visibility:hidden"></i>');
    for (let d = start; d <= t; d++) {
      const l = S.log[d];
      const n = l ? (l.new || 0) + (l.rev || 0) + (l.q || 0) : 0;
      const lv = n === 0 ? "" : n < 20 ? "l1" : n < 60 ? "l2" : "l3";
      cells.push(`<i class="${lv} ${d === t ? "today" : ""}" title="${C.ymd(d)} · ${n}개"></i>`);
    }
    // 최근 7일 막대
    const days7 = [];
    for (let d = t - 6; d <= t; d++) days7.push({ d, l: S.log[d] || {} });
    const max7 = Math.max(10, ...days7.map((x) => (x.l.new || 0) + (x.l.rev || 0)));
    const W = 300, H = 120, bw = 26;
    const bars = days7.map((x, i) => {
      const nw = x.l.new || 0, rv = x.l.rev || 0;
      const h1 = (nw / max7) * (H - 24), h2 = (rv / max7) * (H - 24);
      const cx = 20 + i * ((W - 40) / 6);
      const wd = ["일", "월", "화", "수", "목", "금", "토"][C.dayToDate(x.d).getDay()];
      return `<rect x="${cx - bw / 2}" y="${H - 18 - h1}" width="${bw}" height="${h1}" rx="4" fill="var(--brand)"/><rect x="${cx - bw / 2}" y="${H - 18 - h1 - h2 - (h1 && h2 ? 2 : 0)}" width="${bw}" height="${h2}" rx="4" fill="var(--accent)"/><text x="${cx}" y="${H - 3}" text-anchor="middle" font-size="11" fill="var(--text-3)">${x.d === t ? "오늘" : wd}</text>`;
    }).join("");
    const testsDone = Object.keys(S.tests).length;
    const passed = Object.values(S.tests).filter((x) => x.best >= 80).length;
    const body = `${topBar("학습 통계", { sub: `목표 ${target()}점 · ${C.scoreBand(target()).label}` })}
      <div class="grid2">
        <div class="card"><div class="stat-num">${sum.mastered.toLocaleString()}</div><div class="stat-lbl">암기 완료 / ${P.length.toLocaleString()}</div></div>
        <div class="card"><div class="stat-num">${sum.seen.toLocaleString()}</div><div class="stat-lbl">학습한 단어</div></div>
        <div class="card"><div class="stat-num">${streak}<span style="font-size:16px">일</span></div><div class="stat-lbl">연속 학습 · 최고 ${best}일</div></div>
        <div class="card"><div class="stat-num">${sum.accuracy == null ? "–" : sum.accuracy + "%"}</div><div class="stat-lbl">정답률</div></div>
      </div>
      <div class="card" style="margin-top:12px"><div class="row"><span class="tico c-blue" style="width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center">${ico("cal")}</span>
        <div class="spacer"><b>${sum.seen >= P.length ? "목표 범위 1회독 완료!" : `이 속도면 ${fmtDate(finish)}에 1회독 완료`}</b>
        <div class="small muted">${exam != null ? (finish <= exam - 3 ? `시험(${fmtDate(exam)}) 전에 여유 있게 끝나요 👍` : S.profile.daily >= 80 || finish > exam + 14 ? `시험(${fmtDate(exam)}) 전에는 쉬운 단어부터 보고, 실전 문제에 시간을 더 쓰세요` : `시험(${fmtDate(exam)})에 맞추려면 하루 학습량을 늘려 보세요`) : "설정에서 시험일을 정하면 맞춰서 알려 드려요"}</div></div></div></div>
      <div class="section"><div class="section-h"><h2>난이도별 진도</h2></div><div class="card">${progressBlock(P)}</div></div>
      <div class="section"><div class="section-h"><h2>최근 7일</h2></div><div class="card"><svg class="chart-7" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="최근 7일 학습량">${bars}</svg>
        <div class="legend"><span><i style="background:var(--brand)"></i>새 단어</span><span><i style="background:var(--accent)"></i>복습</span></div></div></div>
      <div class="section"><div class="section-h"><h2>학습 달력 (4주)</h2></div><div class="card"><div class="heat heat-wrap">${["월", "화", "수", "목", "금", "토", "일"].map((x) => `<span class="small muted" style="text-align:center">${x}</span>`).join("")}${cells.join("")}</div></div></div>
      ${(() => {
        const pred = C.predictScore(S.pr);
        const weak = C.weakTypes(S.qt).slice(0, 3);
        const nPr = (S.pr.lc || []).length + (S.pr.rc || []).length;
        if (!nPr) return "";
        return `<div class="section"><div class="section-h"><h2>실전 문제</h2><a class="small" href="#/practice">실전으로 →</a></div><div class="card">
          <div class="row"><div class="spacer"><div class="stat-num">${pred ? pred.total : "–"}<span class="muted" style="font-size:16px">${pred ? `점 (LC ${pred.lc} · RC ${pred.rc})` : ""}</span></div><div class="stat-lbl">${pred ? "예상 점수 (최근 정답률로 추정)" : "LC·RC 각 30문제를 풀면 예상 점수가 나와요"}</div></div></div>
          ${weak.length ? `<div style="margin-top:12px">${weak.map((w) => `<div class="weak"><div class="spacer"><b>${PART_LABEL[w.part] || w.part} · ${esc(w.type)}</b></div><div class="wbar"><i style="width:${w.pct}%;background:${w.pct >= 80 ? "var(--ok)" : w.pct >= 60 ? "var(--accent)" : "var(--bad)"}"></i></div><b class="wpct">${w.pct}%</b></div>`).join("")}</div>` : ""}</div></div>`;
      })()}
      <div class="section"><div class="section-h"><h2>Day 테스트</h2></div><div class="card"><div class="row"><div class="spacer"><div class="stat-num">${passed}<span class="muted" style="font-size:16px"> / ${NDAYS}</span></div><div class="stat-lbl">통과한 Day (80점 이상) · 응시 ${testsDone}</div></div></div>
        <div class="heat" style="grid-template-columns:repeat(10,1fr);margin-top:12px">${DAYS.map((d) => { const x = S.tests[d.day]; return `<a href="#/day/${d.day}" title="DAY ${d.day}${x ? ` · ${x.best}점` : ""}" style="aspect-ratio:1;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:${x ? (x.best >= 80 ? "var(--ok)" : "var(--accent)") : "var(--bg-sunk)"};color:${x ? "#fff" : "var(--text-3)"}">${d.day}</a>`; }).join("")}</div></div></div>`;
    shell("stats", body);
  }

  // ═════════════ 설정 ═════════════
  function vSettings() {
    const p = S.profile;
    const s = S.settings;
    const sw = (k, label, desc) => `<label class="set-row"><span class="sl"><b>${label}</b>${desc ? `<span>${desc}</span>` : ""}</span><span class="switch"><input type="checkbox" data-set="${k}" ${s[k] ? "checked" : ""}/><span></span></span></label>`;
    const body = `${topBar("설정")}
      <div class="set-title">학습 계획</div>
      <div class="set-group">
        <a class="set-row" href="#/onboarding"><span class="sl"><b>목표 점수 · 시험일 · 하루 학습량</b><span>${p.target}점 · ${p.examDate ? `시험 ${fmtDate(C.parseYmd(p.examDate))}` : "시험일 미정"} · 하루 ${p.daily}개</span></span>${ico("right")}</a>
        <button class="set-row" data-place><span class="sl"><b>어휘 진단 ${S.profile.placed ? "다시 하기" : "하기"}</b><span>${(S.profile.skip || []).length ? `지금 ${S.profile.skip.map((t) => C.TIER_NAMES[t]).join("·")} 단어를 건너뛰는 중` : "3분 테스트로 아는 단어를 건너뛰어요"}</span></span>${ico("gauge")}</button>
        ${(S.profile.skip || []).length ? `<button class="set-row" data-unskip><span class="sl"><b>건너뛴 단어 다시 포함</b><span>${S.profile.skip.map((t) => C.TIER_NAMES[t]).join("·")} 단어를 오늘의 학습에 다시 넣어요</span></span>${ico("repeat")}</button>` : ""}
        ${Notify.available() ? `${sw("remind", "매일 학습 알림", "정한 시간에 오늘의 단어를 알려 드려요")}
        <label class="set-row"><span class="sl"><b>알림 시간</b></span><input type="time" class="field" data-remind-at value="${esc(s.remindAt)}" style="width:130px;height:40px" ${s.remind ? "" : "disabled"} /></label>` : ""}
      </div>
      <div class="set-title">소리</div>
      <div class="set-group">
        ${sw("autoWord", "단어 발음 자동 재생", "카드·상세 화면에서 단어가 나오면 바로 들려줘요")}
        ${sw("autoEx", "예문 자동 재생", "카드를 뒤집으면 예문을 읽어 줘요")}
        <div class="set-row"><span class="sl"><b>재생 속도</b></span><div class="seg">${[0.8, 1, 1.2].map((r) => `<button class="${s.rate === r ? "on" : ""}" data-rate="${r}">${r}x</button>`).join("")}</div></div>
        ${sw("sfx", "효과음", "정답·오답 소리")}
      </div>
      <div class="set-title">화면</div>
      <div class="set-group">
        <div class="set-row"><span class="sl"><b>테마</b></span><div class="seg">${[["system", "자동"], ["light", "밝게"], ["dark", "어둡게"]].map(([k, l]) => `<button class="${s.theme === k ? "on" : ""}" data-theme="${k}">${l}</button>`).join("")}</div></div>
        ${sw("showKo", "예문 해석 보기", "끄면 영어 예문만 보여요")}
      </div>
      <div class="set-title">데이터</div>
      <div class="set-group">
        <button class="set-row" data-export><span class="sl"><b>학습 기록 백업</b><span>파일로 저장해 다른 기기로 옮길 수 있어요</span></span>${ico("download")}</button>
        <button class="set-row" data-import><span class="sl"><b>백업 불러오기</b></span>${ico("upload")}</button>
        <button class="set-row" data-reset><span class="sl"><b style="color:var(--bad)">학습 기록 초기화</b><span>모든 진도와 기록을 지워요</span></span>${ico("trash")}</button>
      </div>
      ${CONFIG.premium.enabled ? `<div class="set-title">프리미엄</div><div class="set-group"><a class="set-row" href="#/premium"><span class="sl"><b>${S.premium ? "프리미엄 이용 중" : `프리미엄으로 전체 ${NDAYS}일 열기`}</b></span>${ico("crown")}</a></div>` : ""}
      <div class="set-title">정보</div>
      <div class="set-group">
        <div class="set-row"><span class="sl"><b>버전</b></span><span class="sv">1.0.0 · 데이터 ${esc(D.version)}</span></div>
        <a class="set-row" href="#/licenses"><span class="sl"><b>오픈소스 라이선스</b></span>${ico("right")}</a>
        <a class="set-row" href="privacy.html" target="_blank" rel="noopener"><span class="sl"><b>개인정보 처리방침</b><span>학습 기록은 기기에만 저장돼요</span></span>${ico("right")}</a>
      </div>
      <p class="small muted" style="text-align:center;margin-top:20px">${BRAND.name} · TOEIC is a registered trademark of ETS. 이 앱은 ETS와 관련이 없습니다.</p>
      <input type="file" id="importFile" accept="application/json,.json" hidden />`;
    shell("settings", body);
    $app.querySelectorAll("[data-set]").forEach((c) => c.addEventListener("change", async () => {
      s[c.dataset.set] = c.checked;
      if (c.dataset.set === "remind") {
        const ok = await Notify.apply();
        if (s.remind && !ok) { s.remind = false; toast("알림 권한을 허용해야 알림을 받을 수 있어요"); }
        else toast(s.remind ? `매일 ${s.remindAt}에 알려 드릴게요` : "학습 알림을 껐어요");
        save();
        return vSettings();
      }
      save();
    }));
    const ra = $app.querySelector("[data-remind-at]");
    if (ra) ra.addEventListener("change", async () => { if (!ra.value) return; s.remindAt = ra.value; save(); await Notify.apply(); toast(`매일 ${s.remindAt}에 알려 드릴게요`); });
    $app.querySelectorAll("[data-rate]").forEach((b) => b.addEventListener("click", () => { s.rate = +b.dataset.rate; save(); vSettings(); }));
    $app.querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => { s.theme = b.dataset.theme; applyTheme(); save(); vSettings(); }));
    $app.querySelector("[data-export]").addEventListener("click", exportData);
    $app.querySelector("[data-place]").addEventListener("click", startPlacement);
    const us = $app.querySelector("[data-unskip]");
    if (us) us.addEventListener("click", () => { S.profile.skip = []; save(true); toast("건너뛴 단어를 다시 포함했어요"); vSettings(); });
    const file = document.getElementById("importFile");
    $app.querySelector("[data-import]").addEventListener("click", () => file.click());
    file.addEventListener("change", () => importData(file.files[0]));
    $app.querySelector("[data-reset]").addEventListener("click", async () => {
      if (!(await confirmBox("학습 기록을 모두 지울까요?", "진도·오답노트·통계가 모두 사라지고 되돌릴 수 없어요. 먼저 백업을 권해요.", "모두 지우기", true))) return;
      const keep = { settings: S.settings, premium: S.premium };
      S = Object.assign(DEFAULT_STATE(), keep);
      save(true);
      toast("초기화했어요");
      go("#/onboarding");
    });
  }
  function applyTheme() {
    const t = S.settings.theme;
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }
  async function exportData() {
    const json = JSON.stringify({ app: "vocafit-toeic", exportedAt: new Date().toISOString(), state: S });
    const name = `vocafit-toeic-backup-${C.ymd(today())}.json`;
    const P = capPlugins();
    if (P && P.Filesystem && P.Share) {
      try {
        const r = await P.Filesystem.writeFile({ path: name, data: json, directory: "CACHE", encoding: "utf8" });
        await P.Share.share({ title: "보카핏 토익 백업", text: "학습 기록 백업 파일", url: r.uri, dialogTitle: "백업 파일 저장·보내기" });
        toast("백업 파일을 만들었어요");
      } catch (e) {
        if (!/cancel/i.test(String(e && e.message))) toast("백업 파일을 만들지 못했어요");
      }
      return;
    }
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast("백업 파일을 저장했어요");
  }
  function importData(f) {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const j = JSON.parse(rd.result);
        if (j.app !== "vocafit-toeic" || !j.state || !j.state.words) throw new Error("bad");
        if (!(await confirmBox("백업을 불러올까요?", "지금 기기의 학습 기록을 백업 파일 내용으로 바꿔요.", "불러오기"))) return;
        const keepPremium = S.premium; // 구매 여부는 백업 파일로 바꿀 수 없다
        S = sanitize(j.state);
        S.premium = keepPremium;
        save(true);
        applyTheme();
        toast("백업을 불러왔어요");
        go("#/home");
      } catch (e) {
        toast("올바른 백업 파일이 아니에요");
      }
    };
    rd.readAsText(f);
  }
  function vLicenses() {
    const body = `${topBar("오픈소스 라이선스", { back: true })}
      <div class="card"><b>CMU Pronouncing Dictionary</b><p class="small muted">발음기호 생성에 사용. Copyright (C) 1993-2015 Carnegie Mellon University. BSD 2-Clause License.</p>
      <b>Kokoro-82M</b><p class="small muted">모든 단어·예문·문장 음성 합성에 사용. Copyright hexgrad. Apache License 2.0.</p>
      <b>Pretendard</b><p class="small muted">앱 글꼴. Copyright 2021 Kil Hyung-jin. SIL Open Font License 1.1.</p>
      <b>Lucide Icons</b><p class="small muted">아이콘 모양 참고. ISC License.</p></div>`;
    shell("settings", body);
  }
  function vPremium() {
    const body = `${topBar("프리미엄", { back: true })}
      <div class="paywall-hero">${ico("crown")}<h2 style="margin:10px 0 4px">${NDAYS}일 전체 코스 열기</h2><p class="muted">Day ${CONFIG.premium.freeDays + 1}~${NDAYS} · ${NWORDS}개 단어와 문제 전부</p></div>
      <div class="card"><div class="feature-list">
        <div><span class="tico c-blue">${ico("book")}</span><span><b>단어 ${NWORDS}개 + 예문 음성</b>고득점 단어까지 전부</span></div>
        <div><span class="tico c-purple">${ico("trophy")}</span><span><b>Part 5 어휘 문제 ${NWORDS}개</b>단어마다 해설</span></div>
        <div><span class="tico c-green">${ico("headphones")}</span><span><b>듣기 모드 · Part 1 · 혼동 어휘</b></span></div></div></div>
      <button class="price-card on" style="margin-top:14px"><span class="spacer"><b>${CONFIG.premium.price}</b><div class="small muted">${CONFIG.premium.priceNote}</div></span>${ico("check")}</button>
      <button class="btn block" style="margin-top:14px" data-buy>${S.premium ? "이용 중" : "구매하기"}</button>
      <button class="btn ghost block" style="margin-top:10px" data-restore>구매 복원</button>`;
    shell("settings", body);
    $app.querySelector("[data-buy]").addEventListener("click", purchasePremium);
    $app.querySelector("[data-restore]").addEventListener("click", restorePremium);
  }
  async function restorePremium() {
    try {
      if (window.VocafitIAP && window.VocafitIAP.restore) {
        const ok = await window.VocafitIAP.restore();
        S.premium = !!ok;
        save(true);
        toast(ok ? "구매 내역을 복원했어요" : "복원할 구매 내역이 없어요");
        if (ok) go("#/days");
      } else toast("스토어 앱에서 복원할 수 있어요");
    } catch (e) { toast("구매 내역을 확인하지 못했어요"); }
  }
  // 인앱결제 연결 지점: 네이티브 앱에서 window.VocafitIAP.purchase() 가 있으면 사용
  async function purchasePremium() {
    try {
      if (window.VocafitIAP && window.VocafitIAP.purchase) {
        const ok = await window.VocafitIAP.purchase();
        if (ok) { S.premium = true; save(true); toast("프리미엄이 열렸어요!"); return go("#/days"); }
      } else toast("스토어 앱에서 구매할 수 있어요");
    } catch (e) { toast("결제를 완료하지 못했어요"); }
  }

  // ═════════════ 시작 ═════════════
  applyTheme();
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", () => { if (S.settings.theme === "system") render(); });
  }
  if ("serviceWorker" in navigator && location.protocol === "https:" && !window.Capacitor) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  // 학습 시간 기록 (화면이 보일 때만, 1분 단위)
  setInterval(() => { if (!document.hidden && S.profile) { logToday().sec += 60; save(); } }, 60000);
  // 안드로이드 하드웨어 뒤로가기 (@capacitor/app)
  (function () {
    const P = capPlugins();
    if (!P || !P.App) return;
    P.App.addListener("backButton", ({ canGoBack }) => {
      if (document.getElementById("modal")) return closeModal();
      if (session && !session.done) return askExit();
      if (session && session.done) return exitStudy();
      if (route().name === "home" || !canGoBack) return P.App.minimizeApp ? P.App.minimizeApp() : P.App.exitApp();
      history.back();
    });
  })();
  // 개발·테스트용 훅
  window.__vocafit = { get state() { return S; }, Core: C, render, sanitize };
  render();
})();
