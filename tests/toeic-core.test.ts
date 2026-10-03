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

test("실제 데이터: 1,200단어 · 문제 정답 위치 · 예문 강조 표시", () => {
  const path = new URL("../toeic/app/js/data.js", import.meta.url);
  if (!fs.existsSync(path)) return;
  const src = fs.readFileSync(path, "utf8");
  const data = JSON.parse(src.slice(src.indexOf("=") + 1).trim().replace(/;$/, ""));
  assert.equal(data.words.length, 1200);
  assert.equal(new Set(data.words.map((w: { id: string }) => w.id)).size, 1200);
  for (const w of data.words) {
    assert.ok(C.starred(w.ex).length >= 1, `${w.w}: 예문 강조`);
    assert.equal(w.q.o.length, 4, `${w.w}: 보기`);
    assert.ok(w.q.a >= 0 && w.q.a < 4, `${w.w}: 정답`);
    assert.ok(w.q.s.includes("-------"), `${w.w}: 빈칸`);
  }
  assert.equal(data.days.length, 30);
});
