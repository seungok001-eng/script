/* 보카핏 토익 — 화면 (바닐라 JS, 빌드 없음). 로직은 core.js, 데이터는 data.js */
(function () {
  "use strict";
  const D = window.VOCA_DATA;
  const C = window.Core;
  const BRAND = { name: "보카핏 토익", short: "보카핏", en: "VocaFit TOEIC" };
  // 유료화 스위치: enabled=true 로 바꾸면 freeDays 이후 Day는 프리미엄(인앱결제 연결 지점: purchasePremium)
  const CONFIG = { premium: { enabled: false, freeDays: 5, price: "₩9,900", priceNote: "평생 이용 · 1회 결제" } };
  const STORE_KEY = "vocafit.v1";

  const WORDS = D.words;
  const BY_ID = new Map(WORDS.map((w) => [w.id, w]));
  const DAYS = D.days;
  const POS_KO = { n: "명사", v: "동사", adj: "형용사", adv: "부사", phr: "숙어", prep: "전치사", conj: "접속사" };
  const POS_SHORT = { n: "명", v: "동", adj: "형", adv: "부", phr: "숙", prep: "전", conj: "접" };
  const $app = document.getElementById("app");

  // ═════════════ 저장소 ═════════════
  const DEFAULT_STATE = () => ({
    v: 1,
    profile: null, // { target, examDate, daily, start }
    settings: { theme: "system", autoWord: true, autoEx: false, rate: 1, showKo: true, readKo: true, hideMeaning: false, sfx: true, remind: false, remindAt: "21:00" },
    words: {},
    log: {},
    tests: {},
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
    }
    const ts = (src && src.tests) || {};
    for (const k of Object.keys(ts)) {
      const dn = +k;
      if (!(dn >= 1 && dn <= 30) || !ts[k]) continue;
      d.tests[dn] = { best: num(ts[k].best, 0, 0, 100), last: num(ts[k].last, 0, 0, 100), at: num(ts[k].at, 0, 0, 1e6) };
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
  function pool() { return C.poolFor(WORDS, target()); }
  function inPool(w) { return C.tiersFor(target()).includes(w.tier); }
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
    // src(앱 안 mp3)를 재생하고 끝나면 resolve. 파일이 없거나 실패하면 기기 음성(TTS)으로 대신 읽는다
    function play(src, text, opt) {
      stop();
      const my = token;
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
        el.playbackRate = S.settings.rate;
        const p = el.play();
        if (p && p.catch) p.catch((err) => fin(err && err.name === "NotAllowedError" ? "blocked" : false));
      });
    }
    function word(w, btn) { return play(w.au ? `audio/w/${w.id}.mp3` : null, w.w, { btn }); }
    function example(w, btn) { return play(w.exAu ? `audio/s/${w.id}.mp3` : null, C.plainEx(w.ex), { btn }); }
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
  let ui = { dayFilter: "all", dayAll: false, p1g: "all", reviewTab: "due", searchQ: "" };
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
    const views = { onboarding: vOnboarding, home: vHome, days: vDays, day: vDay, word: vWord, study: vStudy, review: vReview, part1: vPart1, conf: vConf, search: vSearch, stats: vStats, settings: vSettings, licenses: vLicenses, premium: vPremium };
    const v = views[r.name] || vHome;
    v(r);
    window.scrollTo(0, 0);
  }

  // 공통 껍데기 (사이드바 + 하단 탭)
  const NAV = [
    ["home", "홈", "home"],
    ["days", "단어장", "book"],
    ["review", "복습", "repeat"],
    ["stats", "통계", "chart"],
    ["settings", "설정", "gear"],
  ];
  function shell(active, body, wide) {
    const links = NAV.map(([k, label, ic]) => `<a href="#/${k}" class="side-link ${active === k ? "on" : ""}">${ico(ic)}${label}</a>`).join("");
    const tabs = NAV.map(([k, label, ic]) => `<a href="#/${k}" class="tab ${active === k ? "on" : ""}" aria-label="${label}">${ico(ic)}${label}</a>`).join("");
    $app.innerHTML = `<div class="shell">
      <nav class="side" aria-label="메뉴"><div class="side-brand">${logoSvg(30)}<span>${BRAND.name}</span></div>${links}
        <a href="#/search" class="side-link ${active === "search" ? "on" : ""}">${ico("search")}단어 검색</a>
        <a href="#/part1" class="side-link ${active === "part1" ? "on" : ""}">${ico("camera")}Part 1 사진 표현</a>
        <a href="#/conf" class="side-link ${active === "conf" ? "on" : ""}">${ico("split")}혼동 어휘</a>
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
          <div><span class="tico c-blue">${ico("target")}</span><span><b>목표 점수 맞춤 단어 1,200개</b>30일 주제별 · 기본/핵심/고득점 3단계</span></div>
          <div><span class="tico c-green">${ico("headphones")}</span><span><b>모든 단어·예문 원어민 음성</b>미국·영국 발음으로 토익 LC까지 대비</span></div>
          <div><span class="tico c-orange">${ico("repeat")}</span><span><b>잊을 때쯤 다시 나오는 복습</b>1·3·7·14·30일 간격 반복 + 오답노트</span></div>
          <div><span class="tico c-purple">${ico("zap")}</span><span><b>Part 5 실전 문제 1,200개</b>단어마다 출제 포인트와 해설</span></div>
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
        </div>`;
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
    const heroTitle = plan.remaining === 0 ? "범위 1회독 완료! 복습으로 굳혀요" : newDone ? "오늘 새 단어 완료!" : `오늘의 단어 ${plan.newWords.length}개`;
    const heroSub = nextWord ? `DAY ${pad(nextWord.d)} · ${esc(DAYS[nextWord.d - 1].title)}` : `${hi}`;
    const body = `
      <div class="top"><h1>${hi}</h1><a class="icon-btn" href="#/search" aria-label="검색">${ico("search")}</a></div>
      <section class="hero">
        <div class="ring">${ring(pct, 76, 7)}</div>
        <div class="eyebrow">목표 ${target()}점 · ${C.scoreBand(target()).label}</div>
        <div class="big">${heroTitle}</div>
        <div class="eyebrow">${heroSub}</div>
        <div class="meta">
          <div><b>${sum.mastered.toLocaleString()}</b>암기 완료</div>
          <div><b>${streak}일</b>연속 학습</div>
          <div><b>${dday != null ? (dday >= 0 ? "D-" + dday : "종료") : "–"}</b>시험까지</div>
        </div>
        ${!newDone ? `<button class="btn block" data-go="new">${ico("play")}오늘의 학습 시작</button>` : plan.due.length ? `<button class="btn block" data-go="due">${ico("repeat")}복습 ${plan.due.length}개 시작</button>` : `<button class="btn block" data-go="quiz-today" ${introduced.length ? "" : "disabled"}>${ico("zap")}오늘 단어 퀴즈</button>`}
      </section>
      <div class="section"><div class="section-h"><h2>오늘 할 일</h2><span class="small muted">${fmtDate(t)}</span></div>
        <button class="task ${newDone ? "done" : ""}" data-go="new"><span class="tico c-blue">${ico("layers")}</span><span class="spacer"><div class="tt">새 단어 외우기</div><div class="td">${newDone ? `오늘 ${plan.introducedToday}개 완료 · 더 하고 싶다면 단어장에서` : `카드로 뜻 확인 → 모르는 단어는 다시`}</div></span><span class="tn">${newDone ? ico("check") : plan.newWords.length}</span></button>
        <button class="task ${plan.due.length ? "" : "done"}" data-go="due"><span class="tico c-orange">${ico("repeat")}</span><span class="spacer"><div class="tt">복습하기</div><div class="td">${plan.due.length ? "잊어버리기 전에 다시 볼 단어" : "오늘 복습할 단어가 없어요"}</div></span><span class="tn">${plan.due.length || ico("check")}</span></button>
        <button class="task ${introduced.length ? "" : "done"}" data-go="quiz-today"><span class="tico c-purple">${ico("zap")}</span><span class="spacer"><div class="tt">오늘 단어 확인 퀴즈</div><div class="td">${introduced.length ? `오늘 본 ${introduced.length}개 · 뜻/단어/예문/Part 5 섞어서` : "새 단어를 외우면 열려요"}</div></span><span class="tn">${introduced.length || "–"}</span></button>
        <button class="task ${wrong ? "" : "done"}" data-go="wrong"><span class="tico c-red">${ico("alert")}</span><span class="spacer"><div class="tt">오답노트</div><div class="td">${wrong ? "틀린 단어만 다시 풀어요" : "아직 틀린 단어가 없어요"}</div></span><span class="tn">${wrong || "–"}</span></button>
      </div>
      <div class="section"><div class="section-h"><h2>토익 파트별 특훈</h2></div>
        <div class="grid2">
          <a class="tile" href="#/part1"><span class="tico c-green">${ico("camera")}</span><b>Part 1 사진 표현</b><span>사진 묘사 필수 120문장</span></a>
          <a class="tile" href="#/conf"><span class="tico c-gold">${ico("split")}</span><b>Part 5 혼동 어휘</b><span>헷갈리는 단어 60세트</span></a>
          <button class="tile" data-go="listen"><span class="tico c-blue">${ico("headphones")}</span><b>듣기 모드</b><span>출퇴근길 자동 재생</span></button>
          <button class="tile" data-go="part5"><span class="tico c-purple">${ico("trophy")}</span><b>Part 5 실전 20제</b><span>배운 단어로 실전 문제</span></button>
        </div>
      </div>
      <div class="section"><div class="section-h"><h2>진도</h2><a href="#/stats">자세히</a></div>
        <div class="card">${progressBlock(P)}</div>
      </div>`;
    shell("home", body);
    $app.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => homeGo(b.dataset.go, plan, introduced)));
  }
  function progressBlock(P) {
    const tiers = C.tiersFor(target());
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
    if (what === "part5") {
      const seen = P.filter((w) => st(w.id) && st(w.id).n);
      const base = seen.length >= 10 ? seen : P.slice(0, 80);
      return startQuiz(C.shuffle(base).slice(0, 20), "part5", { title: "Part 5 실전 20제" });
    }
  }

  // ═════════════ 단어장 (Day 목록) ═════════════
  function vDays() {
    const P = pool();
    const plan = C.todayPlan(P, S.words, S.profile.daily, today());
    const curDay = plan.newWords[0] ? plan.newWords[0].d : 0;
    const cards = DAYS.map((d) => {
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
    }).join("");
    const body = `${topBar("단어장", { sub: `목표 ${target()}점 · ${C.scoreBand(target()).label} · ${P.length.toLocaleString()}개`, right: `<a class="icon-btn" href="#/search" aria-label="검색">${ico("search")}</a>` })}
      <div class="chips scroll" style="margin-bottom:14px">
        <a class="chip" href="#/part1">${ico("camera")}Part 1 사진 표현</a>
        <a class="chip" href="#/conf">${ico("split")}혼동 어휘</a>
        <a class="chip" href="#/review?tab=star">${ico("star")}중요 단어</a>
        <a class="chip" href="#/review?tab=wrong">${ico("alert")}오답노트</a>
      </div>
      <div class="grid2 grid-days">${cards}</div>`;
    shell("days", body, true);
  }

  // ═════════════ Day 상세 ═════════════
  function vDay(r) {
    const d = +r.arg;
    const day = DAYS[d - 1];
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
      ["card", "카드 암기", "layers", "c-blue"],
      ["meaning", "뜻 고르기", "list", "c-green"],
      ["word", "단어 고르기", "shuffle", "c-orange"],
      ["listen-q", "듣고 고르기", "ear", "c-purple"],
      ["spell", "철자 쓰기", "pencil", "c-gold"],
      ["cloze", "예문 빈칸", "bulb", "c-blue"],
      ["part5", "Part 5 실전", "trophy", "c-purple"],
      ["listen", "듣기 모드", "headphones", "c-green"],
      ["test", "Day 테스트", "flag", "c-red"],
    ];
    const items = list.map((w) => wordItem(w)).join("") || `<div class="empty">${ico("search")}<b>해당하는 단어가 없어요</b>필터를 바꿔 보세요</div>`;
    const hiddenCount = all.length - mine.length;
    const body = `${topBar(`DAY ${pad(d)}`, { back: true, sub: esc(day.title) + " · " + esc(day.titleEn), right: `${d > 1 ? `<a class="icon-btn" href="#/day/${d - 1}" aria-label="이전 Day">${ico("left")}</a>` : ""}${d < 30 ? `<a class="icon-btn" href="#/day/${d + 1}" aria-label="다음 Day">${ico("right")}</a>` : ""}` })}
      <div class="card"><div class="row"><div class="spacer"><div class="stat-num">${sum.mastered}<span class="muted" style="font-size:16px"> / ${mine.length}</span></div><div class="stat-lbl">암기 완료 · 학습 중 ${sum.learning}</div></div>
        ${test ? `<div style="text-align:right"><div class="stat-num" style="color:${test.best >= 80 ? "var(--ok)" : "var(--accent)"}">${test.best}<span style="font-size:16px">점</span></div><div class="stat-lbl">테스트 최고점</div></div>` : ""}</div>
        <div class="stack-bar" style="margin-top:12px"><i style="width:${mine.length ? (sum.mastered / mine.length) * 100 : 0}%;background:var(--ok)"></i><i style="width:${mine.length ? (sum.learning / mine.length) * 100 : 0}%;background:var(--accent)"></i></div></div>
      <div class="section"><div class="section-h"><h2>학습 방법</h2></div>
        <div class="grid3">${modes.map(([k, l, ic, c]) => `<button class="tile" data-mode="${k}" style="align-items:center;text-align:center;padding:14px 8px"><span class="tico ${c}">${ico(ic)}</span><b style="font-size:13.5px">${l}</b></button>`).join("")}</div>
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
      ${o.noQuiz ? "" : `<div class="card blk" id="p5"><div class="blk-h">Part 5 실전 문제</div><div class="en" style="font-size:16px;line-height:1.6">${esc(w.q.s).replace("-------", '<b style="letter-spacing:.1em">_______</b>')}</div>
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
    Sound.stop();
    session = null;
    if (studyPushed) { studyPushed = false; history.back(); }
    else location.replace("#/home");
  }
  function askExit() {
    if (!session || session.done) return exitStudy();
    confirmBox("학습을 그만할까요?", "지금까지 한 내용은 저장돼요.", "그만하기").then((ok) => { if (ok) exitStudy(); });
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
    if (session.done) return vResult();
    if (session.kind === "card") return vCard();
    if (session.kind === "quiz") return vQuiz();
    if (session.kind === "listen") return vListen();
    if (session.kind === "conf") return vQuiz();
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
        ? `<div class="grade3"><button class="btn g-no" data-g="0">모르겠어요<small>다시 보기</small></button><button class="btn g-mid" data-g="1">헷갈려요<small>${dueLabel(C.INTERVALS[Math.max(1, ((st0 && st0.b) || 0) - 1)])}</small></button><button class="btn g-yes" data-g="2">알아요<small>${s.seenIds.has(w.id) ? "내일 복습" : dueLabel(C.INTERVALS[Math.min(((st0 && st0.b) || 0) + 1, 6)])}</small></button></div>`
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
    introduceIfNew(w);
    const before = st(w.id);
    let ns = C.grade(before, g, t);
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

  // ═════════════ 퀴즈 ═════════════
  const QUIZ_TITLES = { meaning: "알맞은 뜻은?", word: "알맞은 단어는?", listen: "듣고 알맞은 뜻 고르기", spell: "영어로 쓰세요", cloze: "빈칸에 알맞은 말은?", part5: "Part 5 · 빈칸에 알맞은 것은?", conf: "혼동 어휘 · 빈칸에 알맞은 것은?" };
  function startQuiz(words, type, opt) {
    if (!words.length) return toast("문제를 만들 단어가 없어요");
    const all = pool().length > 60 ? pool() : WORDS;
    let qs;
    if (type === "test") qs = C.makeTest(words, all, Math.min(20, words.length));
    else if (type === "mix") {
      const types = ["meaning", "word", "cloze", "part5", "listen"];
      qs = C.shuffle(words).slice(0, 30).map((w, i) => {
        let tp = types[i % types.length];
        if (tp === "cloze" && C.starred(w.ex).length !== 1) tp = "meaning";
        return C.makeQuestion(tp, w, all);
      });
    } else {
      let ws = C.shuffle(words);
      if (type === "cloze") ws = ws.filter((w) => C.starred(w.ex).length === 1);
      qs = ws.slice(0, 30).map((w) => C.makeQuestion(type, w, all));
    }
    if (!qs.length) return toast(type === "cloze" ? "예문 빈칸 문제를 만들 수 있는 단어가 없어요" : "문제를 만들 단어가 없어요");
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
    else if (q.type === "cloze") qhtml = `<div class="qs en">${esc(q.prompt).replace(/_____/g, '<b style="color:var(--brand)">_____</b>')}</div>${S.settings.showKo ? `<div class="qsub">${esc(q.sub)}</div>` : ""}`;
    else if (q.type === "part5" || q.type === "conf") qhtml = `<div class="qs en">${esc(q.prompt).replace("-------", '<b style="color:var(--brand);letter-spacing:.05em">_______</b>')}</div>`;
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
        return `<button class="opt ${cls}" data-pick="${i}" ${ans ? "disabled" : ""}><span class="on">${i + 1}</span><span class="${q.type === "word" || q.type === "cloze" || q.type === "part5" || q.type === "conf" ? "en" : ""}">${esc(o)}</span></button>`;
      }).join("")}</div>`;
    }
    let fb = "";
    if (ans) {
      const expl = q.type === "part5" || q.type === "conf" ? q.explain : "";
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
    const l = logToday();
    l.q += 1;
    if (a.ok) l.ok += 1;
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
    if (a.ok && q.type !== "part5" && q.type !== "conf" && q.type !== "spell") {
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
    const count = s.kind === "card" ? s.seenIds.size : s.results.length;
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
    if (s.kind === "card") {
      const total = s.res[0] + s.res[1] + s.res[2];
      const words = Array.from(s.seenIds).map((id) => BY_ID.get(id));
      hero = `<div class="result-hero"><div style="display:flex;justify-content:center">${ico("check", "")}</div><div class="score">${total}<small>개</small></div><div class="msg">카드 학습 완료!</div><p class="muted">한 번에 안 단어 ${s.res[2]} · 헷갈림 ${s.res[1]} · 모름 ${s.res[0]}</p></div>`;
      list = words.map((w) => wordItem(w)).join("");
      actions = `<button class="btn block" data-quiz>${ico("zap")}방금 외운 단어 퀴즈로 확인</button><button class="btn ghost block" style="margin-top:10px" data-home>처음 화면으로</button>`;
      s._words = words;
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
      ${list ? `<div class="section"><div class="section-h"><h2>${s.kind === "card" ? "학습한 단어" : "틀린 문제"}</h2></div><div class="wlist">${list}</div></div>` : ""}</div>`;
    $app.querySelectorAll("[data-home]").forEach((b) => b.addEventListener("click", exitStudy));
    const q = $app.querySelector("[data-quiz]");
    if (q) q.addEventListener("click", () => startQuiz(s._words, "mix", { title: "확인 퀴즈" }));
    const c = $app.querySelector("[data-card]");
    if (c) c.addEventListener("click", () => startCard(s._words, { title: "틀린 단어 복습" }));
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
  function vPart1() {
    const groups = Array.from(new Set(D.part1.map((p) => p.g)));
    const g = ui.p1g;
    const list = D.part1.filter((p) => g === "all" || p.g === g);
    const body = `${topBar("Part 1 사진 표현", { back: true, sub: "사진 묘사 문제에 그대로 나오는 문장 120개" })}
      <div class="tip-box" style="margin-bottom:14px"><b>핵심 함정</b> 사람이 없는 사진에서 <span class="en">is being + p.p.</span>(지금 ~되는 중)는 대부분 오답! 사물의 상태는 <span class="en">is/are + p.p.</span>, <span class="en">has been + p.p.</span>로 말해요.</div>
      <div class="row" style="margin-bottom:12px"><button class="btn sm" data-p1play>${ico("headphones")}이 목록 연속 듣기</button><span class="spacer"></span></div>
      <div class="chips scroll" style="margin-bottom:12px"><button class="chip ${g === "all" ? "on" : ""}" data-g="all">전체</button>${groups.map((x) => `<button class="chip ${g === x ? "on" : ""}" data-g="${esc(x)}">${esc(x)}</button>`).join("")}</div>
      <div class="wlist">${list.map((p) => `<div class="witem" style="align-items:flex-start;cursor:default"><div class="wbody">
        <div class="ex-en en" style="font-size:16px">${hl(p.e)}</div><div class="ex-ko" style="margin-top:3px">${esc(p.k)}</div>
        <div class="small" style="margin-top:6px"><span class="badge pos en">${esc(p.key)}</span> <span class="muted">${esc(p.keyKo)}</span></div>
        ${p.tip ? `<div class="small" style="margin-top:6px;color:var(--text-2)">💡 ${esc(p.tip)}</div>` : ""}</div>
        <button class="play" data-p1="${p.id}" aria-label="듣기">${ico("vol")}</button></div>`).join("")}</div>`;
    shell("part1", body);
    $app.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => { ui.p1g = b.dataset.g; vPart1(); }));
    const byId = new Map(D.part1.map((p) => [p.id, p]));
    $app.querySelectorAll("[data-p1]").forEach((b) => b.addEventListener("click", () => { seqId += 1; const p = byId.get(b.dataset.p1); Sound.play(p.au ? `audio/${p.au}` : null, C.plainEx(p.e), { btn: b }); }));
    $app.querySelector("[data-p1play]").addEventListener("click", async () => {
      const btns = Array.from($app.querySelectorAll("[data-p1]"));
      const my = ++seqId;
      for (const b of btns) {
        if (my !== seqId || !document.body.contains(b)) break;
        b.scrollIntoView({ block: "center", behavior: "smooth" });
        const p = byId.get(b.dataset.p1);
        await Sound.play(p.au ? `audio/${p.au}` : null, C.plainEx(p.e), { btn: b });
        if (my !== seqId) break;
        await wait(900);
      }
    });
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
        : `<div class="empty">${ico("book")}<b>1,200개 토익 단어에서 찾아요</b>파생어·동의어·한국어 뜻으로도 검색돼요</div>`;
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
        <div class="small muted">${exam != null ? (finish <= exam - 3 ? `시험(${fmtDate(exam)}) 전에 여유 있게 끝나요 👍` : `시험(${fmtDate(exam)})에 맞추려면 하루 학습량을 늘려 보세요`) : "설정에서 시험일을 정하면 맞춰서 알려 드려요"}</div></div></div></div>
      <div class="section"><div class="section-h"><h2>난이도별 진도</h2></div><div class="card">${progressBlock(P)}</div></div>
      <div class="section"><div class="section-h"><h2>최근 7일</h2></div><div class="card"><svg class="chart-7" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="최근 7일 학습량">${bars}</svg>
        <div class="legend"><span><i style="background:var(--brand)"></i>새 단어</span><span><i style="background:var(--accent)"></i>복습</span></div></div></div>
      <div class="section"><div class="section-h"><h2>학습 달력 (4주)</h2></div><div class="card"><div class="heat heat-wrap">${["월", "화", "수", "목", "금", "토", "일"].map((x) => `<span class="small muted" style="text-align:center">${x}</span>`).join("")}${cells.join("")}</div></div></div>
      <div class="section"><div class="section-h"><h2>Day 테스트</h2></div><div class="card"><div class="row"><div class="spacer"><div class="stat-num">${passed}<span class="muted" style="font-size:16px"> / 30</span></div><div class="stat-lbl">통과한 Day (80점 이상) · 응시 ${testsDone}</div></div></div>
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
      ${CONFIG.premium.enabled ? `<div class="set-title">프리미엄</div><div class="set-group"><a class="set-row" href="#/premium"><span class="sl"><b>${S.premium ? "프리미엄 이용 중" : "프리미엄으로 전체 30일 열기"}</b></span>${ico("crown")}</a></div>` : ""}
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
      <b>Kokoro-82M</b><p class="small muted">일부 단어·예문 음성 합성에 사용. Copyright hexgrad. Apache License 2.0.</p>
      <b>Pretendard</b><p class="small muted">앱 글꼴. Copyright 2021 Kil Hyung-jin. SIL Open Font License 1.1.</p>
      <b>Lucide Icons</b><p class="small muted">아이콘 모양 참고. ISC License.</p></div>`;
    shell("settings", body);
  }
  function vPremium() {
    const body = `${topBar("프리미엄", { back: true })}
      <div class="paywall-hero">${ico("crown")}<h2 style="margin:10px 0 4px">30일 전체 코스 열기</h2><p class="muted">Day ${CONFIG.premium.freeDays + 1}~30 · 1,200개 단어와 문제 전부</p></div>
      <div class="card"><div class="feature-list">
        <div><span class="tico c-blue">${ico("book")}</span><span><b>단어 1,200개 + 예문 음성</b>고득점 단어까지 전부</span></div>
        <div><span class="tico c-purple">${ico("trophy")}</span><span><b>Part 5 실전 문제 1,200개</b>단어마다 해설</span></div>
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
