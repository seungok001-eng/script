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

const out = { version: new Date().toISOString().slice(0, 10), days, words, part1, lc, lcGroups, conf };
const js = "/* 자동 생성 파일 — toeic/scripts/build_data.mjs 로 다시 만든다. 직접 고치지 말 것 */\nwindow.VOCA_DATA=" + JSON.stringify(out) + ";\n";
fs.writeFileSync(path.join(ROOT, "app/js/data.js"), js);
const withAu = words.filter((w) => w.au).length;
const withEx = words.filter((w) => w.exAu).length;
console.log(`단어 ${words.length}개 (데이터 없음 ${missing}) · 단어 음성 ${withAu} · 예문 음성 ${withEx} · Part1 ${part1.length} (음성 ${part1.filter((p) => p.au).length}) · LC ${lc.length} (음성 ${lc.filter((p) => p.au).length} · 응답 퀴즈 ${lc.filter((p) => p.x).length}) · 혼동어 ${conf.length} · ${(js.length / 1024).toFixed(0)}KB`);
