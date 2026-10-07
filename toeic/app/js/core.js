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
  // '아는 단어 빼기': 이미 아는 단어는 7일 뒤 한 번 확인하도록 상자 3에 둔다
  function markKnown(st, today) {
    const s = Object.assign(newState(), st || {});
    if (s.n && s.b >= 3) return s;
    s.b = 3;
    s.n = Math.max(1, s.n);
    s.ok += 1;
    s.last = today;
    s.due = today + INTERVALS[3];
    if (!s.first) { s.first = today; s.known = true; }
    delete s.wrong;
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
        if (st.first === today && !st.known) introducedToday += 1;
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
  // 뜻 나열 구분자: 일본어·중국어는 '、', 그 밖은 ', '
  function listSep() {
    return typeof document !== "undefined" && /^(ja|zh)/.test(document.documentElement.lang || "") ? "、" : ", ";
  }
  function meaningText(w, n) {
    return w.m.slice(0, n || 2).join(listSep());
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
    if (type === "part5" && !word.q) type = "meaning"; // 모의고사 전용 문제가 있는 단어(mq)는 뜻 문제로
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

  // ───────────── Part 7 패러프레이징 (문맥상 바꿔 쓸 수 있는 말) ─────────────
  function canParaphrase(w) {
    return !!(w.para && w.para.length && w.para[0] && starred(w.ex).length >= 1);
  }
  function makeParaphrase(word, all, rand) {
    const r = rand || Math.random;
    const ans = word.para[0];
    const own = new Set([word.w.toLowerCase()].concat((word.para || []).map((x) => x.toLowerCase())));
    const pickFrom = (list) => shuffle(list, r).map((w) => w.para[0]).filter((x) => x && !own.has(x.toLowerCase()));
    const same = pickFrom(all.filter((w) => w.id !== word.id && w.pos === word.pos && canParaphrase(w)));
    const other = pickFrom(all.filter((w) => w.id !== word.id && w.pos !== word.pos && canParaphrase(w)));
    const ds = [];
    for (const x of same.concat(other)) {
      if (!ds.some((y) => y.toLowerCase() === x.toLowerCase())) ds.push(x);
      if (ds.length >= 3) break;
    }
    const opts = shuffle([ans].concat(ds), r);
    return { type: "para", word, prompt: word.ex, key: starred(word.ex).join(" … "), options: opts, answer: opts.indexOf(ans) };
  }

  // ───────────── 어휘 진단 ─────────────
  // 난이도마다 고르게 뽑아 '뜻 고르기'로 묻고, 맞힌 비율(찍기 보정)로 아는 단어 수를 추정한다
  function placementSample(words, perTier, rand) {
    const r = rand || Math.random;
    const out = [];
    for (const t of [1, 2, 3]) {
      const ws = words.filter((w) => w.tier === t);
      // Day 전체에 고르게: 무작위로 섞은 뒤 Day 가 겹치지 않게 우선 선택
      const seen = new Set();
      const picked = [];
      for (const w of shuffle(ws, r)) {
        if (picked.length >= perTier) break;
        if (seen.has(w.d) && picked.length < Math.min(perTier, 20)) continue;
        seen.add(w.d);
        picked.push(w);
      }
      for (const w of shuffle(ws, r)) { if (picked.length >= perTier) break; if (!picked.includes(w)) picked.push(w); }
      out.push(...picked);
    }
    return shuffle(out, r);
  }
  // results: [{tier, ok, skipped}] → 난이도별 아는 비율 (4지선다 찍기 보정: 맞힘 - 틀림/3)
  function placementScore(results) {
    const by = { 1: [], 2: [], 3: [] };
    results.forEach((x) => by[x.tier] && by[x.tier].push(x));
    const p = {};
    for (const t of [1, 2, 3]) {
      const xs = by[t];
      if (!xs.length) { p[t] = 0; continue; }
      const ok = xs.filter((x) => x.ok).length;
      const wrong = xs.filter((x) => !x.ok && !x.skipped).length;
      p[t] = clamp((ok - wrong / 3) / xs.length, 0, 1);
    }
    return p;
  }
  function estimateKnown(p, words) {
    let n = 0;
    for (const t of [1, 2, 3]) n += (p[t] || 0) * words.filter((w) => w.tier === t).length;
    return Math.round(n / 10) * 10;
  }
  // 진단 결과로 건너뛸 난이도 추천: 기본 85% 이상 → 기본 건너뛰기, 핵심도 85% 이상 → 핵심까지
  function recommendSkip(p) {
    if ((p[1] || 0) >= 0.85 && (p[2] || 0) >= 0.85) return [1, 2];
    if ((p[1] || 0) >= 0.85) return [1];
    return [];
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
    // 영어 단어와 뜻(앱 언어로 번역된 뜻 포함)을 함께 찾는다. 한국어 검색어는 영어와 겹치지 않으니 예전과 같은 결과
    const lo = (x) => String(x).toLowerCase();
    const scored = [];
    for (const w of words) {
      let score = 0;
      const ww = w.w.toLowerCase();
      if (ww === s) score = 100;
      else if (ww.startsWith(s)) score = 80;
      else if (ww.includes(s)) score = 50;
      else if ((w.der || []).some((d) => d.w.toLowerCase().startsWith(s))) score = 40;
      else if ((w.para || []).some((p) => p.toLowerCase().includes(s))) score = 20;
      if (w.m.some((m) => lo(m) === s)) score = Math.max(score, 100);
      else if (w.m.some((m) => lo(m).includes(s))) score = Math.max(score, 60);
      else if ((w.der || []).some((d) => lo(d.m).includes(s))) score = Math.max(score, 20);
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
  // ───────────── LC 실전 퀴즈 ─────────────
  // "Q: 질문 / A: 대답" 한 줄을 질문과 대답으로 나눈다 (해석 k 도 같은 형식)
  function splitDialog(s) {
    const m = /^Q: (.+?) \/ A: (.+)$/.exec(s || "");
    return m ? { q: m[1].trim(), a: m[2].trim() } : null;
  }
  function canRespond(item) {
    return !!(splitDialog(item.e) && Array.isArray(item.x) && item.x.length === 2);
  }
  // Part 2 응답 고르기: 질문을 듣고 보기 3개(정답 + 그 문항 전용 오답 2개) 중 고르기. f 는 음성 파일 꼬리(a/x1/x2)
  function makeResponse(item, rand) {
    const d = splitDialog(plainEx(item.e));
    const dk = splitDialog(item.k) || { q: "", a: "" };
    const xk = item.xk || [];
    const opts = shuffle([
      { t: d.a, k: dk.a, f: "a" },
      { t: item.x[0], k: xk[0] || "", f: "x1" },
      { t: item.x[1], k: xk[1] || "", f: "x2" },
    ], rand || Math.random);
    return { type: "resp", item, prompt: d.q, promptKo: dk.q, options: opts, answer: opts.findIndex((o) => o.f === "a") };
  }
  // Part 3·4 듣고 해석 고르기: 한 사람의 말을 듣고 한국어 해석 4개 중 고르기 (같은 Part 의 다른 문장 해석이 오답)
  function makeLcMeaning(item, all, rand) {
    const r = rand || Math.random;
    const cands = all.filter((x) => x.id !== item.id && !splitDialog(x.e) && x.k !== item.k);
    const same = shuffle(cands.filter((x) => x.part === item.part && x.g !== item.g), r);
    const near = shuffle(cands.filter((x) => x.g === item.g), r);
    const ds = [];
    for (const x of near.slice(0, 1).concat(same, shuffle(cands, r))) {
      if (!ds.includes(x.k)) ds.push(x.k);
      if (ds.length >= 3) break;
    }
    const opts = shuffle([item.k].concat(ds), r);
    return { type: "lcm", item, prompt: plainEx(item.e), options: opts, answer: opts.indexOf(item.k) };
  }
  // 출제 순서: 지난번에 틀린 것 → 안 푼 것 → 맞힌 것(오래전에 푼 것부터). 같은 순위 안에서는 무작위
  function lcPick(items, states, n, rand) {
    const rank = (it) => {
      const s = states[it.id];
      if (!s) return [1, 0];
      return s.wrong ? [0, 0] : [2, s.last || 0];
    };
    return shuffle(items, rand || Math.random)
      .map((it, i) => ({ it, i, r: rank(it) }))
      .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.i - b.i)
      .slice(0, n)
      .map((x) => x.it);
  }
  function lcRecord(state, ok, today) {
    const s = Object.assign({ ok: 0, ng: 0, last: 0 }, state || {});
    if (ok) s.ok += 1;
    else s.ng += 1;
    s.last = today;
    s.wrong = !ok;
    return s;
  }
  function lcSummary(items, states) {
    let seen = 0, wrong = 0, ok = 0, ng = 0;
    for (const it of items) {
      const s = states[it.id];
      if (!s) continue;
      seen += 1;
      if (s.wrong) wrong += 1;
      ok += s.ok || 0;
      ng += s.ng || 0;
    }
    return { total: items.length, seen, wrong, accuracy: ok + ng ? Math.round((ok / (ok + ng)) * 100) : null };
  }

  // ───────────── 실전 문제 (Part 3~7 · 모의고사) ─────────────
  // 정답 비율(0~1) → 토익 환산 점수 추정 (LC/RC 각 5~495, 5점 단위). 공개된 환산 경향을 단순화한 근사치라 '예상'으로만 쓴다
  const SCORE_TABLE = {
    lc: [[0, 5], [0.2, 60], [0.3, 110], [0.4, 165], [0.5, 225], [0.6, 285], [0.7, 340], [0.8, 395], [0.9, 450], [0.95, 475], [1, 495]],
    rc: [[0, 5], [0.2, 50], [0.3, 95], [0.4, 145], [0.5, 200], [0.6, 255], [0.7, 310], [0.8, 365], [0.9, 425], [0.95, 460], [1, 495]],
  };
  function scaleScore(ratio, sec) {
    const t = SCORE_TABLE[sec];
    const r = clamp(Number(ratio) || 0, 0, 1);
    for (let i = 1; i < t.length; i++) {
      if (r <= t[i][0]) {
        const [x0, y0] = t[i - 1], [x1, y1] = t[i];
        return Math.round((y0 + ((r - x0) / (x1 - x0)) * (y1 - y0)) / 5) * 5;
      }
    }
    return 495;
  }
  function estimateTotal(lcRatio, rcRatio) {
    const lc = scaleScore(lcRatio, "lc"), rc = scaleScore(rcRatio, "rc");
    return { lc, rc, total: lc + rc };
  }
  // 최근 결과(1/0 배열)로 예상 점수. LC·RC 각각 최소 n 개가 쌓여야 낸다
  function predictScore(pr, n) {
    const need = n || 30;
    const lc = (pr && pr.lc) || [], rc = (pr && pr.rc) || [];
    if (lc.length < need || rc.length < need) return null;
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    return Object.assign(estimateTotal(avg(lc), avg(rc)), { nLc: lc.length, nRc: rc.length });
  }
  function pushRecent(arr, ok, max) {
    const a = (arr || []).concat(ok ? 1 : 0);
    return a.slice(-(max || 120));
  }
  // 문제 유형별 정답률 기록 ("p7:추론" → { ok, n })
  function recordType(qt, key, ok) {
    const o = Object.assign({ ok: 0, n: 0 }, qt[key] || {});
    o.n += 1;
    if (ok) o.ok += 1;
    qt[key] = o;
    return o;
  }
  // 약점: 5문제 이상 푼 유형 중 정답률이 낮은 순
  function weakTypes(qt, minN) {
    const m = minN || 5;
    return Object.keys(qt || {})
      .map((k) => { const [part, type] = k.split(":"); const o = qt[k]; return { key: k, part, type, ok: o.ok, n: o.n, pct: Math.round((o.ok / o.n) * 100) }; })
      .filter((x) => x.n >= m)
      .sort((a, b) => a.pct - b.pct || b.n - a.n);
  }
  // 받아쓰기 채점: 단어 단위 LCS 로 맞은 단어·빠진 단어·틀린 단어를 표시한다
  function dictTokens(s) {
    return (s || "").replace(/\*/g, "").split(/\s+/).filter(Boolean);
  }
  function dictWordKey(w) {
    return w.toLowerCase().replace(/[^a-z0-9$%]/g, ""); // 아포스트로피·문장부호는 무시 (I'll = ill)
  }
  function dictDiff(expected, given) {
    const E = dictTokens(expected), G = dictTokens(given);
    const ek = E.map(dictWordKey), gk = G.map(dictWordKey);
    const L = Array.from({ length: E.length + 1 }, () => new Array(G.length + 1).fill(0));
    for (let i = E.length - 1; i >= 0; i--)
      for (let j = G.length - 1; j >= 0; j--)
        L[i][j] = ek[i] && ek[i] === gk[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = [];
    let i = 0, j = 0;
    while (i < E.length) {
      if (!ek[i]) { out.push({ w: E[i], st: "ok" }); i++; continue; }
      if (j < G.length && ek[i] === gk[j]) { out.push({ w: E[i], st: "ok" }); i++; j++; }
      else if (j < G.length && L[i][j + 1] >= L[i + 1][j]) j++;
      else { out.push({ w: E[i], st: "miss" }); i++; }
    }
    const words = out.filter((x) => dictWordKey(x.w));
    const ok = words.filter((x) => x.st === "ok").length;
    return { tokens: out, ok, total: words.length, pct: words.length ? Math.round((ok / words.length) * 100) : 100 };
  }

  // ───────────── 오늘의 실전 과제 ─────────────
  // 시험일·단어 진도로 정한다: 초반엔 문법·Part 2 위주 → 이후 파트를 돌아가며 → 시험 2주 전부터 하프 모의고사(3일마다)·2세트씩
  const PRACTICE_LABEL = { p5g: ["Part 5 문법", "제", 10, 5], p2: ["Part 2 응답", "문제", 10, 5], p3: ["Part 3 대화", "세트", 1, 4], p4: ["Part 4 담화", "세트", 1, 4], p6: ["Part 6 장문 빈칸", "지문", 1, 4], p7: ["Part 7 독해", "세트", 1, 6] };
  function practiceTask(o) {
    const dday = o.dday;
    const late = dday != null && dday >= 0 && dday <= 14;
    if (late && o.mocksLeft > 0 && (o.lastMockDay == null || o.today - o.lastMockDay >= 3)) return { kind: "mock", n: 1, label: "하프 모의고사 1회", min: 60 };
    const early = (o.seenRatio || 0) < 0.25 && (dday == null || dday > 28);
    const rot = early ? ["p5g", "p2", "p5g", "p3"] : ["p3", "p5g", "p7", "p4", "p6", "p2", "p7"];
    const i = (((o.dayIndex || 0) % rot.length) + rot.length) % rot.length;
    const kind = rot[i];
    const [name, unit, base, perMin] = PRACTICE_LABEL[kind];
    const n = late ? base * 2 : base;
    const min = unit === "세트" || unit === "지문" ? n * perMin : perMin * (n / base);
    return { kind, n, label: `${name} ${n}${unit}`, min };
  }
  // 목표 점수에 맞는 실전 문제 난이도
  function levelsFor(target) {
    return target <= 650 ? [1, 2] : target <= 800 ? [1, 2, 3] : [2, 3];
  }
  // 오늘 진행률: 새 단어(45%) · 복습(35%) · 실전 과제(20%)
  function todayProgress(o) {
    const newP = o.daily > 0 ? Math.min(1, (o.introduced || 0) / o.daily) : 1;
    const revTotal = (o.reviewed || 0) + (o.due || 0);
    const revP = revTotal ? (o.reviewed || 0) / revTotal : 1;
    return Math.round((newP * 0.45 + revP * 0.35 + (o.practiced ? 0.2 : 0)) * 100);
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
    INTERVALS, MASTER_BOX, newState, grade, applyQuiz, markKnown, status, isDue, listSep,
    todayPlan, streak,
    rng, shuffle, meaningText, distractors, starred, cloze, plainEx, makeQuestion, makeTest,
    canParaphrase, makeParaphrase, placementSample,
    practiceTask, levelsFor, todayProgress,
    scaleScore, estimateTotal, predictScore, pushRecent, recordType, weakTypes, dictDiff,
    splitDialog, canRespond, makeResponse, makeLcMeaning, lcPick, lcRecord, lcSummary, placementScore, estimateKnown, recommendSkip,
    normEn, checkSpelling, editDistance, spellHint,
    search, summarize, projectFinish, clamp,
  };
});
