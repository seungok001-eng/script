// 단어 데이터(days/*.json + extras.json + ipa.json + 음성 목록) → app/js/data.js
// 사용: node toeic/scripts/build_data.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p, d) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : d);

const plan = read(path.join(ROOT, "data/plan.json"));
const ipa = read(path.join(ROOT, "data/ipa.json"), {});
const manifest = read(path.join(ROOT, "data/audio-manifest.json"), {});
const extras = read(path.join(ROOT, "data/extras.json"), { part1: [], confusables: [] });
const audioDir = path.join(ROOT, "app/audio");
const has = (rel) => fs.existsSync(path.join(audioDir, rel));
const plain = (s) => s.replace(/\*/g, "").replace(/\s+/g, " ").trim();
// 음성 파일이 지금 문장과 같은 내용으로 만들어졌을 때만 쓴다 (문장을 고친 뒤 옛 음성이 나오지 않게)
const fresh = (rel, text) => has(rel) && (!manifest[rel] || manifest[rel].text === text);
const voiceOf = (rel) => (manifest[rel] && manifest[rel].voice) || "";

const days = [];
const words = [];
let missing = 0;
for (const d of plan) {
  const file = path.join(ROOT, `data/days/day-${String(d.day).padStart(2, "0")}.json`);
  const entries = new Map((read(file, []) || []).map((e) => [e.w, e]));
  let count = 0;
  d.words.forEach((w, i) => {
    const e = entries.get(w);
    if (!e) {
      missing += 1;
      return;
    }
    const id = `${String(d.day).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    const wRel = `w/${id}.mp3`;
    const sRel = `s/${id}.mp3`;
    const item = {
      id, d: d.day, w: e.w, pos: e.pos, m: e.m, tier: e.tier, parts: e.parts,
      ex: e.ex, exKo: e.exKo, col: e.col || [], der: e.der || [], para: e.para || [],
      tip: e.tip || "", q: e.q,
    };
    if (e.ant) item.ant = e.ant;
    if (ipa[e.w]) item.ipa = ipa[e.w];
    if (fresh(wRel, e.w)) item.au = 1;
    if (fresh(sRel, plain(e.ex))) {
      item.exAu = 1;
      item.exV = voiceOf(sRel);
    }
    words.push(item);
    count += 1;
  });
  days.push({ day: d.day, title: d.title, titleEn: d.titleEn, count });
}

const part1 = (extras.part1 || []).map((p, i) => {
  const rel = `p1/${String(i + 1).padStart(3, "0")}.mp3`;
  const o = { id: `p1-${i + 1}`, g: p.g, e: p.e, k: p.k, key: p.key, keyKo: p.keyKo, tip: p.tip || "" };
  if (fresh(rel, plain(p.e))) {
    o.au = rel;
    o.v = voiceOf(rel);
  }
  return o;
});
// LC 표현: 대화("Q: … / A: …")는 질문·정답·오답 음성이 따로 있다 (lc/NNN-q, -a, -x1, -x2)
const lcPart = new Map((extras.lcGroups || []).map((g) => [g.g, g.part]));
const lc = (extras.lc || []).map((p, i) => {
  const n = String(i + 1).padStart(3, "0");
  const o = { id: `lc-${i + 1}`, g: p.g, part: lcPart.get(p.g) || 3, e: p.e, k: p.k, key: p.key, keyKo: p.keyKo, tip: p.tip || "" };
  const text = plain(p.e);
  const m = /^Q: (.+?) \/ A: (.+)$/.exec(text);
  if (m) {
    if (Array.isArray(p.x) && p.x.length === 2) {
      o.x = p.x;
      o.xk = p.xk || [];
    }
    const files = [[`lc/${n}-q.mp3`, m[1].trim()], [`lc/${n}-a.mp3`, m[2].trim()], ...(o.x || []).map((x, j) => [`lc/${n}-x${j + 1}.mp3`, plain(x)])];
    if (files.every(([rel, t]) => fresh(rel, t))) {
      o.au = 1;
      o.v = `${voiceOf(files[0][0])}+${voiceOf(files[1][0])}`;
    }
  } else if (fresh(`lc/${n}.mp3`, text)) {
    o.au = 1;
    o.v = voiceOf(`lc/${n}.mp3`);
  }
  return o;
});
const lcGroups = (extras.lcGroups || []).map((g) => ({ g: g.g, part: g.part }));
const conf = (extras.confusables || []).map((c, i) => ({ id: `cf-${i + 1}`, words: c.words, point: c.point, q: c.q }));

const version = new Date().toISOString().slice(0, 10);

// ── 실전 문제 (data/practice/*.json → app/js/practice.js, 실전 화면에서 처음 쓸 때 불러온다) ──
const PDIR = path.join(ROOT, "data/practice");
const pr = {};
for (const k of ["p3", "p4", "grammar", "p6", "p7"]) pr[k] = read(path.join(PDIR, `${k}.json`), []);
// Part 3·4 문장 음성: audio/p34/<id>-NN.mp3 (문장마다 따로 — 문장 단위 다시 듣기·현재 문장 표시)
for (const set of pr.p3.concat(pr.p4)) {
  const rels = set.lines.map((l, i) => [`p34/${set.id}-${String(i + 1).padStart(2, "0")}.mp3`, l.en]);
  if (rels.length && rels.every(([rel, t]) => fresh(rel, t))) {
    set.au = 1;
    set.vo = Object.fromEntries(set.lines.map((l, i) => [l.sp, voiceOf(rels[i][0])]));
  }
}
// Part 1 사진 문제: 사진(app/images/p1/<id>.webp)이 들어온 문제만 앱에 싣는다. 보기 문장 음성은 audio/p1q/<id>-N.mp3
const P1_KIND = { single: "한 사람", multi: "여러 사람", scene: "사람 없는 사진" };
pr.p1 = read(path.join(ROOT, "data/part1.json"), { items: [] }).items
  .filter((q) => fs.existsSync(path.join(ROOT, "app/images/p1", `${q.id}.webp`)))
  .map((q) => {
    const set = { id: q.id, part: 1, lv: q.lv, kind: P1_KIND[q.type] || q.type, setting: q.setting, img: `images/p1/${q.id}.webp`,
      lines: q.o.map((en) => ({ en })), qs: [{ o: q.o, ko: q.ko.map((k) => k.replace(/^\([A-D]\)\s*/, "")), a: q.a, exp: q.exp, type: q.trap }] };
    const rels = q.o.map((en, i) => [`p1q/${q.id}-${i}.mp3`, plain(en)]);
    if (rels.every(([rel, t]) => fresh(rel, t))) set.au = 1;
    return set;
  });
// 하프 모의고사 4회: 문항을 고정 시드로 미리 떼어 둔다 (연습 목록에서는 빠짐)
function seeded(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
function shuffled(arr, seed) {
  const a = arr.slice(), rnd = seeded(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const MOCKS = 4;
const take = (list, per, seed) => { const s = shuffled(list, seed); return Array.from({ length: MOCKS }, (_, m) => s.slice(m * per, (m + 1) * per)); };
const mocks = [];
const enough = pr.p3.length >= 24 && pr.p4.length >= 16;
if (enough) {
  const p3 = take(pr.p3, 6, 11), p4 = take(pr.p4, 4, 12);
  const p6 = take(pr.p6, 2, 13);
  const p7s = take(pr.p7.filter((x) => x.kind === "single"), 3, 14);
  const p7d = take(pr.p7.filter((x) => x.kind === "double"), 1, 15);
  const p7t = take(pr.p7.filter((x) => x.kind === "triple"), 1, 16);
  // 문법: 주제마다 마지막 문항 위주로 10문항씩
  const gqs = pr.grammar.flatMap((t) => t.qs.slice(-2));
  const p5g = take(gqs, 10, 17);
  const resp = lc.filter((p) => /^Q: /.test(plain(p.e)) && p.x);
  const p2 = take(resp, 12, 18);
  const vocab = words.filter((w) => w.tier <= 2 && w.q);
  const p5w = take(vocab, 6, 19);
  // Part 1: 회마다 3문제 (실제 6문제의 절반). 사진이 다 들어오기 전에도 배정이 바뀌지 않게 문제 원본 전체(120개)에서 고정 시드로
  // 고르고, 그중 사진이 있는 것만 싣는다 (사진이 12장 이상일 때). 모의고사 문제는 연습 목록에서 빠진다
  const p1All = read(path.join(ROOT, "data/part1.json"), { items: [] }).items;
  const p1Set = new Map(pr.p1.map((x) => [x.id, x]));
  const p1 = pr.p1.length >= 12 ? take(p1All, 3, 20).map((xs) => xs.map((q) => p1Set.get(q.id)).filter(Boolean)) : null;
  for (let m = 0; m < MOCKS; m++) {
    if (p1) p1[m].forEach((x) => (x.mock = m + 1));
    // Part 2 표현·Part 5 어휘 문제도 모의고사 전용: LC 표현 목록·퀴즈와 단어 화면의 Part 5 문제에서 빠진다
    p2[m].forEach((x) => (x.mock = m + 1));
    p5w[m].forEach((w) => { w.mq = w.q; delete w.q; });
    const mark = (xs) => xs.forEach((x) => (x.mock = m + 1));
    [p3[m], p4[m], p6[m], p7s[m], p7d[m], p7t[m], p5g[m]].forEach(mark);
    mocks.push({ n: m + 1, p1: p1 ? p1[m].map((x) => x.id) : [], p2: p2[m].map((x) => x.id), p3: p3[m].map((x) => x.id), p4: p4[m].map((x) => x.id), p5w: p5w[m].map((x) => x.id), p5g: p5g[m].map((x) => x.id),
      p6: p6[m].map((x) => x.id), p7: p7s[m].concat(p7d[m], p7t[m]).map((x) => x.id) });
  }
}
// 첫 실력 진단 20문제 (LC 10 · RC 10): 모의고사에 안 쓰인 보통 난이도 문항을 고정 시드로 골라 연습에서 뺀다
let diag = null;
if (mocks.length) {
  const free = (xs) => xs.filter((x) => !x.mock);
  const pickLv = (xs, n, seed, lv) => { const f = free(xs); const m = f.filter((x) => x.lv === lv); return shuffled(m.length >= n ? m : f, seed).slice(0, n); };
  const resp = free(lc.filter((p) => /^Q: /.test(plain(p.e)) && p.x));
  const d2 = shuffled(resp, 31).slice(0, 4);
  const d3 = pickLv(pr.p3, 1, 32, 2), d4 = pickLv(pr.p4, 1, 33, 2);
  const d7 = shuffled(free(pr.p7).filter((x) => x.kind === "single" && x.qs.length === 4 && x.lv === 2), 34).slice(0, 1);
  const gq = shuffled(pr.grammar.flatMap((t) => t.qs.filter((q) => !q.mock && q.lv === 2)), 35).slice(0, 3);
  const dw = shuffled(words.filter((w) => w.tier === 2 && w.q), 36).slice(0, 3);
  [d2, d3, d4, d7, gq].forEach((xs) => xs.forEach((x) => (x.mock = "d")));
  dw.forEach((w) => { w.mq = w.q; delete w.q; });
  diag = { n: "d", p1: [], p2: d2.map((x) => x.id), p3: d3.map((x) => x.id), p4: d4.map((x) => x.id), p5w: dw.map((x) => x.id), p5g: gq.map((x) => x.id), p6: [], p7: d7.map((x) => x.id) };
}
const out = { version, days, words, part1, lc, lcGroups, conf };
const js = "/* 자동 생성 파일 — toeic/scripts/build_data.mjs 로 다시 만든다. 직접 고치지 말 것 */\nwindow.VOCA_DATA=" + JSON.stringify(out) + ";\n";
fs.writeFileSync(path.join(ROOT, "app/js/data.js"), js);
const withAu = words.filter((w) => w.au).length;
const withEx = words.filter((w) => w.exAu).length;
console.log(`단어 ${words.length}개 (데이터 없음 ${missing}) · 단어 음성 ${withAu} · 예문 음성 ${withEx} · Part1 ${part1.length} (음성 ${part1.filter((p) => p.au).length}) · LC ${lc.length} (음성 ${lc.filter((p) => p.au).length} · 응답 퀴즈 ${lc.filter((p) => p.x).length}) · 혼동어 ${conf.length} · ${(js.length / 1024).toFixed(0)}KB`);
const practice = { version, diag, p1: pr.p1, p3: pr.p3, p4: pr.p4, grammar: pr.grammar, p6: pr.p6, p7: pr.p7, mocks };
const pjs = "/* 자동 생성 파일 — toeic/scripts/build_data.mjs 로 다시 만든다. 직접 고치지 말 것 */\nwindow.VOCA_PRACTICE=" + JSON.stringify(practice) + ";\n";
fs.writeFileSync(path.join(ROOT, "app/js/practice.js"), pjs);
const nq = (xs) => xs.reduce((n, x) => n + x.qs.length, 0);
console.log(`실전: Part 1 ${pr.p1.length}문제 (음성 ${pr.p1.filter((x) => x.au).length}) · Part 3 ${pr.p3.length}세트 · Part 4 ${pr.p4.length}세트 (음성 ${pr.p3.concat(pr.p4).filter((x) => x.au).length}) · 문법 ${pr.grammar.length}주제 ${nq(pr.grammar)}문제 · Part 6 ${pr.p6.length} · Part 7 ${pr.p7.length}세트 ${nq(pr.p7)}문제 · 모의고사 ${mocks.length}회 · ${(pjs.length / 1024).toFixed(0)}KB`);
