/* 토익 보카 — 순수 로직 (화면과 무관). 브라우저에서는 window.Core, Node 테스트에서는 require 로 쓴다. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ───────────── 날짜 (기기 현지 시간 기준 '하루' 번호) ─────────────
  const DAY_MS = 86400000;
  function dayNum(d) {
    const t = d ? new Date(d) : new Date();
    return Math.floor((t.getTime() - t.getTimezoneOffset() * 60000) / DAY_MS);
  }
  function dayToDate(n) {
    const d = new Date(n * DAY_MS);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  function ymd(n) {
    const d = dayToDate(n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function parseYmd(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return null;
    return dayNum(new Date(+m[1], +m[2] - 1, +m[3], 12));
  }

  // ───────────── 목표 점수 → 학습 범위 ─────────────
  // tier 1 = 기본(600점대 필수) · 2 = 핵심(700~800) · 3 = 고득점(850+)
  const TIER_NAMES = { 1: "기본", 2: "핵심", 3: "고득점" };
  const SCORE_OPTIONS = [550, 600, 650, 700, 750, 800, 850, 900, 950];
  function tiersFor(target) {
    if (target <= 650) return [1];
    if (target <= 800) return [1, 2];
    return [1, 2, 3];
  }
  function scoreBand(target) {
    if (target <= 650) return { label: "기본 완성", desc: "토익 필수 기초 어휘" };
    if (target <= 800) return { label: "핵심 완성", desc: "기본 + 실전 핵심 어휘" };
    return { label: "고득점 완성", desc: "기본 + 핵심 + 고난도 어휘 전부" };
  }
  function poolFor(words, target) {
    const tiers = tiersFor(target);
    return words.filter((w) => tiers.includes(w.tier));
  }
  // 하루 학습량 추천: 시험일이 있으면 시험 3일 전까지 끝내도록, 없으면 목표별 기본값
  function recommendDaily(poolSize, examDay, today) {
    if (examDay != null) {
      const left = examDay - today - 3;
      if (left <= 0) return Math.min(80, poolSize);
      const n = Math.ceil(poolSize / left);
      return clamp(roundTo(n, 5, true), 10, 80);
    }
    if (poolSize <= 500) return 20;
    if (poolSize <= 900) return 30;
    return 40;
  }
  function roundTo(n, step, up) {
    return (up ? Math.ceil(n / step) : Math.round(n / step)) * step;
  }
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  // ───────────── 간격 반복 (라이트너 상자) ─────────────
  // 상자 b: 0 = 오늘 다시, 1~6 = 다음 복습까지 INTERVALS[b]일. b ≥ 4(2주 이상 기억) → '암기 완료'
  const INTERVALS = [0, 1, 3, 7, 14, 30, 60];
  const MASTER_BOX = 4;
  function newState() {
    return { b: 0, due: 0, n: 0, ok: 0, ng: 0, last: 0 };
  }
  // g: 0 = 모르겠어요, 1 = 헷갈려요, 2 = 알아요
  function grade(st, g, today) {
    const s = Object.assign(newState(), st || {});
    s.n += 1;
    s.last = today;
    if (!s.first) s.first = today;
    if (g >= 2) {
      s.b = Math.min(s.b + 1, INTERVALS.length - 1);
      s.ok += 1;
    } else if (g === 1) {
      s.b = Math.max(1, s.b - 1);
    } else {
      s.b = 0;
      s.ng += 1;
      s.wrong = true;
    }
    s.due = today + (s.b === 0 ? 0 : INTERVALS[s.b]);
    return s;
  }
  // 퀴즈 결과 반영: 복습할 때가 된 단어를 맞히면 한 단계 올리고, 틀리면 오답노트 + 내일 다시
  function applyQuiz(st, correct, today) {
    const s = Object.assign(newState(), st || {});
    if (correct) {
      if (s.n === 0 || s.due <= today) return grade(s, 2, today);
      s.ok += 1;
      s.last = today;
      return s;
    }
    s.n += 1;
    s.ng += 1;
    s.last = today;
    if (!s.first) s.first = today;
    s.wrong = true;
    s.b = Math.min(s.b, 1);
    s.due = today + (s.b === 0 ? 0 : 1);
    return s;
  }
  function status(st) {
    if (!st || !st.n) return "new";
    if (st.b >= MASTER_BOX) return "mastered";
    return "learning";
  }
  function isDue(st, today) {
    return !!(st && st.n && st.due <= today);
  }

  // ───────────── 오늘의 학습 ─────────────
  // 새 단어: 범위 안에서 Day 순서대로 아직 안 본 단어를 하루 분량만큼.
  // introducedToday = 오늘 처음 본 단어 수 (이미 다 했으면 0개)
  function todayPlan(pool, states, daily, today) {
    let introducedToday = 0;
    const fresh = [];
    const due = [];
    for (const w of pool) {
      const st = states[w.id];
      if (!st || !st.n) fresh.push(w);
      else {
        if (st.first === today) introducedToday += 1;
        if (st.due <= today && st.first !== today) due.push(w);
      }
    }
    due.sort((a, b) => (states[a.id].due - states[b.id].due) || (states[a.id].b - states[b.id].b));
    const left = Math.max(0, daily - introducedToday);
    return { newWords: fresh.slice(0, left), due, introducedToday, remaining: fresh.length };
  }

  // ───────────── 연속 학습일 ─────────────
  function streak(log, today) {
    let n = 0;
    let d = log[today] && log[today].done ? today : today - 1;
    while (log[d] && log[d].done) {
      n += 1;
      d -= 1;
    }
    return n;
  }

  // ───────────── 문제 만들기 ─────────────
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    const a = arr.slice();
    const r = rand || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function meaningText(w, n) {
    return w.m.slice(0, n || 2).join(", ");
  }
  // 오답 보기: 같은 품사 우선, 뜻이 겹치지 않는 단어
  function distractors(word, all, k, rand, key) {
    const get = key || ((w) => w.w);
    const mine = new Set(word.m);
    const used = new Set([get(word).toLowerCase()]);
    const ok = (w) => w.id !== word.id && !w.m.some((x) => mine.has(x)) && !used.has(get(w).toLowerCase());
    const same = shuffle(all.filter((w) => w.pos === word.pos && ok(w)), rand);
    const other = shuffle(all.filter((w) => w.pos !== word.pos && ok(w)), rand);
    const out = [];
    for (const w of same.concat(other)) {
      const g = get(w).toLowerCase();
      if (used.has(g)) continue;
      used.add(g);
      out.push(w);
      if (out.length >= k) break;
    }
    return out;
  }
  // 예문에서 *강조* 부분
  function starred(ex) {
    const m = (ex || "").match(/\*([^*]+)\*/g) || [];
    return m.map((x) => x.slice(1, -1));
  }
  function cloze(ex) {
    return (ex || "").replace(/\*([^*]+)\*/g, "_____");
  }
  function plainEx(ex) {
    return (ex || "").replace(/\*/g, "");
  }

  // type: meaning(영→한) · word(한→영) · listen(듣고 뜻) · spell(철자) · cloze(예문 빈칸) · part5
  function makeQuestion(type, word, all, rand) {
    const r = rand || Math.random;
    if (type === "part5") {
      const q = word.q;
      return { type, word, prompt: q.s, options: q.o.slice(), answer: q.a, explain: q.k };
    }
    if (type === "spell") {
      return { type, word, prompt: meaningText(word, 3), answerText: word.w };
    }
    if (type === "cloze") {
      const ans = starred(word.ex).join(" … ");
      const ds = distractors(word, all.filter((w) => starred(w.ex).length === 1), 3, r, (w) => starred(w.ex).join(" … "));
      const opts = shuffle([ans].concat(ds.map((w) => starred(w.ex)[0])), r);
      return { type, word, prompt: cloze(word.ex), sub: word.exKo, options: opts, answer: opts.indexOf(ans) };
    }
    if (type === "word") {
      const ds = distractors(word, all, 3, r);
      const opts = shuffle([word].concat(ds), r);
      return { type, word, prompt: meaningText(word, 3), options: opts.map((w) => w.w), answer: opts.indexOf(word) };
    }
    // meaning / listen
    const ds = distractors(word, all, 3, r, (w) => meaningText(w));
    const opts = shuffle([word].concat(ds), r);
    return { type, word, prompt: word.w, options: opts.map((w) => meaningText(w)), answer: opts.indexOf(word) };
  }

  // 시험: 단어마다 유형을 섞는다 (뜻·단어·예문 빈칸·Part 5)
  function makeTest(words, all, count, seed) {
    const r = rng(seed || Date.now());
    const picked = shuffle(words, r).slice(0, count || 20);
    const types = ["meaning", "word", "cloze", "part5"];
    return picked.map((w, i) => {
      let t = types[i % types.length];
      if (t === "cloze" && starred(w.ex).length !== 1) t = "meaning";
      return makeQuestion(t, w, all, r);
    });
  }

  // ───────────── 철자 채점 ─────────────
  function normEn(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[’‘`]/g, "'")
      .replace(/\bone's\b|\bsomeone's\b|\byour\b/g, "one's")
      .replace(/[^a-z0-9' ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function checkSpelling(given, answer) {
    const g = normEn(given);
    const a = normEn(answer);
    if (!g) return { ok: false, close: false };
    if (g === a) return { ok: true, close: false };
    return { ok: false, close: editDistance(g, a) <= Math.max(1, Math.floor(a.length / 6)) };
  }
  function editDistance(a, b) {
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[b.length];
  }
  // 철자 힌트: 첫 글자 + 글자 수 (공백·하이픈은 그대로)
  function spellHint(answer, reveal) {
    let shown = 0;
    return answer
      .split("")
      .map((ch, i) => {
        if (/[^A-Za-zÀ-ſ]/.test(ch)) return ch;
        const start = i === 0 || /[\s-]/.test(answer[i - 1]);
        if (start || shown < (reveal || 0)) {
          if (!start) shown += 1;
          return ch;
        }
        return "_";
      })
      .join("");
  }

  // ───────────── 검색 ─────────────
  function search(words, q, limit) {
    const s = (q || "").trim().toLowerCase();
    if (!s) return [];
    const isKo = /[가-힣]/.test(s);
    const scored = [];
    for (const w of words) {
      let score = 0;
      if (isKo) {
        if (w.m.some((m) => m === s)) score = 100;
        else if (w.m.some((m) => m.includes(s))) score = 60;
        else if ((w.der || []).some((d) => d.m.includes(s))) score = 20;
      } else {
        const ww = w.w.toLowerCase();
        if (ww === s) score = 100;
        else if (ww.startsWith(s)) score = 80;
        else if (ww.includes(s)) score = 50;
        else if ((w.der || []).some((d) => d.w.toLowerCase().startsWith(s))) score = 40;
        else if ((w.para || []).some((p) => p.toLowerCase().includes(s))) score = 20;
      }
      if (score) scored.push([score, w]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].w.length - b[1].w.length);
    return scored.slice(0, limit || 50).map((x) => x[1]);
  }

  // ───────────── 진도 요약 ─────────────
  function summarize(pool, states) {
    const out = { total: pool.length, seen: 0, mastered: 0, learning: 0, ok: 0, ng: 0 };
    for (const w of pool) {
      const st = states[w.id];
      if (!st || !st.n) continue;
      out.seen += 1;
      if (st.b >= MASTER_BOX) out.mastered += 1;
      else out.learning += 1;
      out.ok += st.ok || 0;
      out.ng += st.ng || 0;
    }
    out.accuracy = out.ok + out.ng ? Math.round((out.ok / (out.ok + out.ng)) * 100) : null;
    return out;
  }
  // 지금 속도로 범위를 다 보는 날 (최근 7일 새 단어 평균)
  function projectFinish(pool, states, log, today, daily, start) {
    // 최근 7일(시작한 지 7일이 안 됐으면 시작일부터) 하루 평균 새 단어 수
    const span = Math.max(1, Math.min(7, start != null ? today - start + 1 : 7));
    let recent = 0;
    for (let d = today - span + 1; d <= today; d++) recent += (log[d] && log[d].new) || 0;
    const pace = recent > 0 ? recent / span : daily;
    const left = pool.filter((w) => !(states[w.id] && states[w.id].n)).length;
    if (!left) return today;
    return today + Math.ceil(left / Math.max(1, pace));
  }

  return {
    DAY_MS, dayNum, dayToDate, ymd, parseYmd,
    TIER_NAMES, SCORE_OPTIONS, tiersFor, scoreBand, poolFor, recommendDaily,
    INTERVALS, MASTER_BOX, newState, grade, applyQuiz, status, isDue,
    todayPlan, streak,
    rng, shuffle, meaningText, distractors, starred, cloze, plainEx, makeQuestion, makeTest,
    normEn, checkSpelling, editDistance, spellHint,
    search, summarize, projectFinish, clamp,
  };
});
