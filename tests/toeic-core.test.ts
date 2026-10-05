import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const C = require("../toeic/app/js/core.js");

const W = (id: string, w: string, pos: string, tier: number, m: string[], ex = `We *${w}* it.`) => ({
  id, d: 1, w, pos, tier, m, ex, exKo: "", q: { s: "A ------- B", o: [w, "x", "y", "z"], a: 0, k: "해설" },
});
const SAMPLE = [
  W("01-01", "applicant", "n", 1, ["지원자"]),
  W("01-02", "candidate", "n", 1, ["후보자"]),
  W("01-03", "submit", "v", 1, ["제출하다"]),
  W("01-04", "eligible", "adj", 3, ["자격이 있는"]),
  W("01-05", "proficient", "adj", 2, ["능숙한"]),
  W("01-06", "recruit", "v", 2, ["모집하다"]),
  W("01-07", "hire", "v", 1, ["고용하다"]),
];

test("tiersFor: 목표 점수별 학습 범위", () => {
  assert.deepEqual(C.tiersFor(600), [1]);
  assert.deepEqual(C.tiersFor(650), [1]);
  assert.deepEqual(C.tiersFor(700), [1, 2]);
  assert.deepEqual(C.tiersFor(800), [1, 2]);
  assert.deepEqual(C.tiersFor(850), [1, 2, 3]);
  assert.equal(C.poolFor(SAMPLE, 600).length, 4);
  assert.equal(C.poolFor(SAMPLE, 990).length, SAMPLE.length);
});

test("recommendDaily: 시험일이 가까우면 하루 학습량이 늘고 10~80 사이로 제한된다", () => {
  const today = 20000;
  const far = C.recommendDaily(1200, today + 63, today); // 60일 → 20개
  const near = C.recommendDaily(1200, today + 23, today); // 20일 → 60개
  assert.ok(near > far);
  assert.ok(far >= 10 && near <= 80);
  assert.equal(far % 5, 0);
  assert.equal(C.recommendDaily(1200, today + 2, today), 80);
  assert.equal(C.recommendDaily(476, null, today), 20);
});

test("grade: 라이트너 상자 — 알아요는 한 칸 위, 모름은 처음으로 + 오답 표시", () => {
  const t = 100;
  let s = C.grade(undefined, 2, t);
  assert.equal(s.b, 1);
  assert.equal(s.due, t + 1);
  assert.equal(s.first, t);
  s = C.grade(s, 2, t + 1);
  assert.equal(s.b, 2);
  assert.equal(s.due, t + 1 + 3);
  s = C.grade(s, 0, t + 4);
  assert.equal(s.b, 0);
  assert.equal(s.due, t + 4);
  assert.equal(s.wrong, true);
  assert.equal(s.first, t, "처음 본 날은 유지");
  s = C.grade(s, 1, t + 4);
  assert.equal(s.b, 1);
  assert.equal(s.due, t + 5);
  for (let i = 0; i < 10; i++) s = C.grade(s, 2, t + 10 + i);
  assert.equal(s.b, C.INTERVALS.length - 1, "상자는 끝에서 멈춘다");
  assert.equal(C.status(s), "mastered");
});

test("applyQuiz: 복습 시기가 아닌 정답은 상자를 올리지 않는다", () => {
  const t = 200;
  const s1 = C.grade(undefined, 2, t); // b=1, due t+1
  const s2 = C.applyQuiz(s1, true, t);
  assert.equal(s2.b, 1);
  assert.equal(s2.ok, s1.ok + 1);
  const s3 = C.applyQuiz(s1, true, t + 1); // 복습일 → 승급
  assert.equal(s3.b, 2);
  const s4 = C.applyQuiz(s3, false, t + 2);
  assert.equal(s4.b, 1);
  assert.equal(s4.wrong, true);
  assert.equal(s4.due, t + 3);
});

test("todayPlan: 하루 분량에서 오늘 이미 본 단어를 빼고, 복습할 단어를 고른다", () => {
  const t = 300;
  const states: Record<string, unknown> = {
    "01-01": C.grade(undefined, 2, t), // 오늘 처음 → 새 단어 1개 소진
    "01-02": Object.assign(C.grade(undefined, 2, t - 3), {}), // due = t-2 → 복습
  };
  const plan = C.todayPlan(SAMPLE, states, 3, t);
  assert.equal(plan.introducedToday, 1);
  assert.equal(plan.newWords.length, 2);
  assert.ok(!plan.newWords.some((w: { id: string }) => w.id === "01-01"));
  assert.deepEqual(plan.due.map((w: { id: string }) => w.id), ["01-02"]);
  assert.equal(plan.remaining, SAMPLE.length - 2);
});

test("streak: 오늘 안 했어도 어제까지 이어진 연속 기록을 센다", () => {
  const log = { 10: { done: true }, 11: { done: true }, 12: { done: true }, 8: { done: true } };
  assert.equal(C.streak(log, 12), 3);
  assert.equal(C.streak(log, 13), 3);
  assert.equal(C.streak(log, 14), 0);
});

test("makeQuestion: 보기 4개, 정답 1개, 중복 없음", () => {
  const r = C.rng(42);
  for (const type of ["meaning", "word", "listen", "cloze"]) {
    const q = C.makeQuestion(type, SAMPLE[0], SAMPLE, r);
    assert.equal(q.options.length, 4, type);
    assert.equal(new Set(q.options).size, 4, type);
    assert.ok(q.answer >= 0 && q.answer < 4, type);
  }
  const p5 = C.makeQuestion("part5", SAMPLE[0], SAMPLE, r);
  assert.equal(p5.options[p5.answer], "applicant");
  const cl = C.makeQuestion("cloze", SAMPLE[2], SAMPLE, r);
  assert.equal(cl.options[cl.answer], "submit");
  assert.ok(cl.prompt.includes("_____"));
});

test("makeTest: 요청한 수만큼, 유형을 섞어서", () => {
  const qs = C.makeTest(SAMPLE, SAMPLE, 5, 7);
  assert.equal(qs.length, 5);
  assert.ok(new Set(qs.map((q: { type: string }) => q.type)).size >= 3);
});

test("checkSpelling: 대소문자·악센트·one's 관대, 한두 글자 오타는 '아깝다'", () => {
  assert.equal(C.checkSpelling("Resume", "résumé").ok, true);
  assert.equal(C.checkSpelling(" at your earliest convenience ", "at one's earliest convenience").ok, true);
  assert.equal(C.checkSpelling("accomodate", "accommodate").close, true);
  assert.equal(C.checkSpelling("apple", "accommodate").close, false);
  assert.equal(C.checkSpelling("", "hire").ok, false);
});

test("spellHint: 단어 첫 글자만 보이고 공백·하이픈은 유지", () => {
  assert.equal(C.spellHint("fill a position"), "f___ a p_______");
  assert.equal(C.spellHint("entry-level"), "e____-l____");
  assert.equal(C.spellHint("hire", 2), "hir_");
});

test("search: 영어 앞부분·한국어 뜻으로 찾는다", () => {
  assert.equal(C.search(SAMPLE, "app")[0].w, "applicant");
  assert.equal(C.search(SAMPLE, "제출")[0].w, "submit");
  assert.equal(C.search(SAMPLE, "").length, 0);
});

test("날짜: ymd ↔ parseYmd 왕복", () => {
  const n = C.parseYmd("2026-10-03");
  assert.equal(C.ymd(n), "2026-10-03");
  assert.equal(C.parseYmd("bad"), null);
});

test("실제 데이터: 계획한 모든 단어 · 문제 정답 위치 · 예문 강조 표시", () => {
  const path = new URL("../toeic/app/js/data.js", import.meta.url);
  if (!fs.existsSync(path)) return;
  const src = fs.readFileSync(path, "utf8");
  const data = JSON.parse(src.slice(src.indexOf("=") + 1).trim().replace(/;$/, ""));
  const plan = JSON.parse(fs.readFileSync(new URL("../toeic/data/plan.json", import.meta.url), "utf8"));
  // 데이터가 들어온 Day 는 계획한 40단어가 빠짐없이 있어야 한다 (계획이 작성보다 앞설 수는 있다)
  const released = data.days.filter((d: { count: number }) => d.count > 0);
  for (const d of released) assert.equal(d.count, plan[d.day - 1].words.length, `DAY ${d.day} 단어 수`);
  const total = released.reduce((n: number, d: { count: number }) => n + d.count, 0);
  assert.ok(total >= 1200);
  assert.equal(data.words.length, total);
  assert.equal(new Set(data.words.map((w: { id: string }) => w.id)).size, total);
  assert.equal(new Set(data.words.map((w: { w: string }) => w.w.toLowerCase())).size, total, "표제어 중복 없음");
  for (const w of data.words) {
    assert.ok(C.starred(w.ex).length >= 1, `${w.w}: 예문 강조`);
    assert.equal(w.q.o.length, 4, `${w.w}: 보기`);
    assert.ok(w.q.a >= 0 && w.q.a < 4, `${w.w}: 정답`);
    assert.ok(w.q.s.includes("-------"), `${w.w}: 빈칸`);
  }
  assert.equal(data.days.length, plan.length);
});

test("어휘 진단: 난이도별로 고르게 뽑고, 찍기 보정 점수와 건너뛸 난이도를 계산한다", () => {
  const words = [];
  for (let t = 1; t <= 3; t++) for (let i = 0; i < 30; i++) words.push({ id: `${t}-${i}`, d: (i % 10) + 1, tier: t, w: `w${t}${i}`, pos: "n", m: [`뜻${t}${i}`] });
  const sample = C.placementSample(words, 8, C.rng(3));
  assert.equal(sample.length, 24);
  for (const t of [1, 2, 3]) assert.equal(sample.filter((w: { tier: number }) => w.tier === t).length, 8);
  const res = [
    ...Array.from({ length: 8 }, () => ({ tier: 1, ok: true })),
    ...Array.from({ length: 8 }, (_, i) => ({ tier: 2, ok: i < 4, skipped: i >= 4 })),
    ...Array.from({ length: 8 }, () => ({ tier: 3, ok: false })),
  ];
  const p = C.placementScore(res);
  assert.equal(p[1], 1);
  assert.equal(p[2], 0.5);
  assert.equal(p[3], 0, "찍어서 틀린 답은 0 아래로 내려가지 않는다");
  assert.deepEqual(C.recommendSkip(p), [1]);
  assert.deepEqual(C.recommendSkip({ 1: 0.9, 2: 0.9, 3: 0.1 }), [1, 2]);
  assert.deepEqual(C.recommendSkip({ 1: 0.6, 2: 0.9, 3: 0.1 }), []);
  assert.equal(C.estimateKnown(p, words), 50); // 30*1 + 30*0.5 = 45 → 10단위 반올림
});

test("패러프레이징: 정답은 그 단어의 para[0], 보기 4개 중복 없음", () => {
  const ws = [
    { id: "a", w: "complimentary", pos: "adj", m: ["무료의"], ex: "We offer *complimentary* breakfast.", para: ["free", "at no cost"] },
    { id: "b", w: "adjacent", pos: "adj", m: ["인접한"], ex: "The *adjacent* room is quiet.", para: ["neighboring"] },
    { id: "c", w: "durable", pos: "adj", m: ["내구성 있는"], ex: "A *durable* bag.", para: ["sturdy"] },
    { id: "d", w: "prompt", pos: "adj", m: ["신속한"], ex: "A *prompt* reply.", para: ["quick"] },
    { id: "e", w: "rival", pos: "n", m: ["경쟁자"], ex: "Our *rival* won.", para: ["competitor"] },
  ];
  assert.equal(C.canParaphrase(ws[0]), true);
  assert.equal(C.canParaphrase({ ...ws[0], para: [] }), false);
  const q = C.makeParaphrase(ws[0], ws, C.rng(1));
  assert.equal(q.options.length, 4);
  assert.equal(new Set(q.options).size, 4);
  assert.equal(q.options[q.answer], "free");
  assert.ok(!q.options.includes("at no cost"), "같은 단어의 다른 동의어는 오답 보기로 쓰지 않는다");
});

// ───────────── LC 실전 퀴즈 ─────────────
const LC = [
  { id: "lc-1", g: "A", part: 2, e: "Q: When is the report due? / A: Ms. Kim is *still reviewing* it.", k: "Q: 보고서 마감이 언제예요? / A: 김 씨가 아직 검토 중이에요.", x: ["In the conference room.", "Yes, I reported it."], xk: ["회의실에서요.", "네, 제가 보고했어요."] },
  { id: "lc-2", g: "B", part: 4, e: "Please *proceed to* gate 12.", k: "12번 게이트로 가 주십시오." },
  { id: "lc-3", g: "B", part: 4, e: "*Admission is free* for children.", k: "어린이는 입장료가 무료입니다." },
  { id: "lc-4", g: "C", part: 4, e: "You've *reached* the clinic.", k: "병원에 전화하셨습니다." },
  { id: "lc-5", g: "C", part: 4, e: "We're *running a promotion* this week.", k: "이번 주에 판촉 행사를 합니다." },
  { id: "lc-6", g: "A", part: 2, e: "Q: Who's leading it? / A: *It hasn't been decided.*", k: "Q: 누가 진행해요? / A: 아직 안 정해졌어요." },
];

test("splitDialog: Q/A 한 줄을 나누고, 대화가 아니면 null", () => {
  assert.deepEqual(C.splitDialog("Q: Hi? / A: Fine."), { q: "Hi?", a: "Fine." });
  assert.equal(C.splitDialog("Please proceed to gate 12."), null);
  assert.equal(C.canRespond(LC[0]), true);
  assert.equal(C.canRespond(LC[5]), false); // 오답 보기가 없으면 응답 퀴즈에 안 나온다
  assert.equal(C.canRespond(LC[1]), false);
});

test("makeResponse: 보기 3개 중 정답 하나, 정답 해석·오답 해석이 짝지어진다", () => {
  for (let s = 1; s < 20; s++) {
    const q = C.makeResponse(LC[0], C.rng(s));
    assert.equal(q.prompt, "When is the report due?");
    assert.equal(q.promptKo, "보고서 마감이 언제예요?");
    assert.equal(q.options.length, 3);
    assert.equal(q.options[q.answer].t, "Ms. Kim is still reviewing it.");
    assert.equal(q.options[q.answer].f, "a");
    assert.equal(q.options[q.answer].k, "김 씨가 아직 검토 중이에요.");
    const x1 = q.options.find((o: any) => o.f === "x1");
    assert.equal(x1.t, "In the conference room.");
    assert.equal(x1.k, "회의실에서요.");
  }
});

test("makeLcMeaning: 해석 4개가 서로 다르고 정답이 들어 있으며 대화 해석은 오답으로 안 쓴다", () => {
  for (let s = 1; s < 20; s++) {
    const q = C.makeLcMeaning(LC[1], LC, C.rng(s));
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.equal(q.options[q.answer], LC[1].k);
    assert.ok(q.options.every((o: string) => !o.startsWith("Q:")));
    assert.equal(q.prompt, "Please proceed to gate 12.");
  }
});

test("lcPick: 틀린 것 → 안 푼 것 → 오래전에 맞힌 것 순서", () => {
  const states = { "lc-2": { ok: 1, ng: 0, last: 10 }, "lc-3": { ok: 1, ng: 1, last: 12, wrong: true }, "lc-4": { ok: 2, ng: 0, last: 5 } };
  const items = LC.slice(1, 5);
  for (let s = 1; s < 10; s++) {
    const ids = C.lcPick(items, states, 4, C.rng(s)).map((x: any) => x.id);
    assert.deepEqual(ids, ["lc-3", "lc-5", "lc-4", "lc-2"]);
  }
  assert.equal(C.lcPick(items, {}, 2, C.rng(1)).length, 2);
});

test("lcRecord / lcSummary: 맞힘·틀림 기록과 요약", () => {
  let s = C.lcRecord(undefined, false, 100);
  assert.deepEqual(s, { ok: 0, ng: 1, last: 100, wrong: true });
  s = C.lcRecord(s, true, 101);
  assert.deepEqual(s, { ok: 1, ng: 1, last: 101, wrong: false });
  const sum = C.lcSummary(LC, { "lc-1": s, "lc-2": { ok: 0, ng: 2, last: 1, wrong: true } });
  assert.deepEqual(sum, { total: 6, seen: 2, wrong: 1, accuracy: 25 });
});

test("LC 데이터: 그룹·Part 규칙, 대화 오답 보기, 표현 중복 없음", () => {
  const ex = JSON.parse(fs.readFileSync(new URL("../toeic/data/extras.json", import.meta.url), "utf8"));
  const groups = new Map(ex.lcGroups.map((g: any) => [g.g, g.part]));
  assert.ok(ex.lc.length >= 800, `LC ${ex.lc.length}`);
  const norm = (s: string) => s.toLowerCase().replace(/\*/g, "").replace(/[^a-z0-9~ ]/g, "").trim();
  const seen = new Set();
  for (const it of ex.lc) {
    const part = groups.get(it.g);
    assert.ok(part, `그룹 없음: ${it.g}`);
    const d = C.splitDialog(it.e);
    if (part === 4) assert.ok(!d, `Part 4 는 한 사람의 말: ${it.e}`);
    if (d) {
      assert.ok(C.splitDialog(it.k), `대화 해석 형식: ${it.k}`);
      if (it.x) assert.ok(it.x.length === 2 && it.xk.length === 2 && !it.x.some((x: string) => x.includes("*")), `오답 보기: ${it.e}`);
    } else assert.ok(!it.x, `대화가 아닌데 오답 보기: ${it.e}`);
    assert.ok((it.e.match(/\*/g) || []).length % 2 === 0, `강조 짝: ${it.e}`);
    const k = norm(it.key);
    assert.ok(!seen.has(k), `표현 중복: ${it.key}`);
    seen.add(k);
  }
  assert.ok(ex.lc.filter(C.canRespond).length >= 400);
});
