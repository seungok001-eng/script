// 다국어 도구
//   node scripts/i18n.mjs extract   번역할 원문(한국어)을 data/i18n/src.ko.json 에 모은다
//                                    · ui: app.js 의 T`…` 문구와 core.js 의 표시용 문구 (키 = 한국어 원문, ${} 자리는 {0} {1}…)
//                                    · labels: 데이터의 분류 이름(유형·주제·문서 종류 등) — 기록 키로도 쓰이므로 데이터는 그대로 두고 보여 줄 때만 바꾼다
//                                    · d / p: data.js / practice.js 의 자유 문장(뜻·해석·해설). 키는 경로 ("words/#id/q/k")
//   node scripts/i18n.mjs build     data/i18n/<lang>.json 번역을 앱용 app/js/l10n/<lang>.js · <lang>-p.js · langs.js 로 만든다
//   node scripts/i18n.mjs status    언어별 번역 비율과 원문이 바뀌어 다시 번역해야 하는 항목 수
// 번역 파일 형식: { lang, name, ui: {원문: 번역}, labels: {원문: 번역}, d: {키: [원문, 번역]}, p: {키: [원문, 번역]} }
// (d·p 에 원문을 같이 두어 원문이 바뀐 항목은 자동으로 빼고 한국어로 보여 준다)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const I18N = path.join(ROOT, "data", "i18n");
const OUT = path.join(ROOT, "app", "js", "l10n");
const H = /[가-힣]/;
// 데이터에서 '분류 이름'으로 쓰는 필드 (기록 키·필터에 쓰인다 → tr() 로 표시만 바꾼다)
const ENUM = new Set(["type", "kind", "cat", "setting", "talk", "topic", "doc", "g", "title"]);
export const LANGS = [
  { code: "en", name: "English" },
  { code: "ja", name: "日本語" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "zh-TW", name: "繁體中文" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
];
// 앱에 언어를 보여 주는 기준 (화면·데이터 번역 비율)
const MIN_COVER = 0.98;

const readJs = (f) => { const s = fs.readFileSync(f, "utf8"); return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); };
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);

function walkData(root, out, labels) {
  const rec = (x, segs) => {
    if (Array.isArray(x)) x.forEach((v, i) => rec(v, segs.concat(v && typeof v === "object" && !Array.isArray(v) && v.id != null ? "#" + v.id : String(i))));
    else if (x && typeof x === "object") for (const k of Object.keys(x)) rec(x[k], segs.concat(k));
    else if (typeof x === "string" && H.test(x)) {
      const field = segs[segs.length - 1];
      if (ENUM.has(field)) labels.add(x);
      else out[segs.join("/")] = x;
    }
  };
  rec(root, []);
}

async function uiKeys() {
  const acorn = await import("acorn");
  const walk = await import("acorn-walk");
  const keys = {};
  const add = (k, where) => { if (!(k in keys)) keys[k] = where; };
  // app.js: T`…` 태그 템플릿
  const app = fs.readFileSync(path.join(ROOT, "app", "js", "app.js"), "utf8");
  walk.full(acorn.parse(app, { ecmaVersion: "latest", locations: true }), (n) => {
    if (n.type === "TaggedTemplateExpression" && n.tag.type === "Identifier" && n.tag.name === "T") {
      const q = n.quasi.quasis.map((x) => x.value.cooked);
      let k = q[0];
      for (let i = 1; i < q.length; i++) k += `{${i - 1}}` + q[i];
      add(k, `app.js:${n.loc.start.line}`);
    }
  });
  // core.js: 화면에 나오는 한국어 문구 (숫자는 {0} 자리로)
  const core = fs.readFileSync(path.join(ROOT, "app", "js", "core.js"), "utf8");
  walk.full(acorn.parse(core, { ecmaVersion: "latest", locations: true }), (n) => {
    if (n.type === "Literal" && typeof n.value === "string" && H.test(n.value)) add(n.value, `core.js:${n.loc.start.line}`);
    if (n.type === "TemplateLiteral" && n.quasis.some((x) => H.test(x.value.cooked))) {
      const q = n.quasis.map((x) => x.value.cooked);
      let k = q[0];
      for (let i = 1; i < q.length; i++) k += `{${i - 1}}` + q[i];
      add(k, `core.js:${n.loc.start.line}`);
    }
  });
  return keys;
}

export async function extract(opt = {}) {
  const d = {}, p = {}, labels = new Set();
  walkData(readJs(path.join(ROOT, "app", "js", "data.js")), d, labels);
  walkData(opt.practice || readJs(path.join(ROOT, "app", "js", "practice.js")), p, labels);
  const ui = await uiKeys();
  fs.mkdirSync(I18N, { recursive: true });
  const src = { ui, labels: [...labels].sort(), d, p };
  fs.writeFileSync(path.join(I18N, "src.ko.json"), JSON.stringify(src, null, 0));
  const chars = (o) => Object.values(o).reduce((n, v) => n + String(v).length, 0);
  console.log(`원문: 화면 ${Object.keys(ui).length}개 · 분류 이름 ${labels.size}개 · 단어 데이터 ${Object.keys(d).length}개(${chars(d).toLocaleString()}자) · 실전 데이터 ${Object.keys(p).length}개(${chars(p).toLocaleString()}자)`);
}

function coverage(src, tr) {
  const ui = Object.keys(src.ui), lb = src.labels;
  const okUi = ui.filter((k) => tr.ui && tr.ui[k] != null).length;
  const okLb = lb.filter((k) => tr.labels && tr.labels[k] != null).length;
  const part = (s, t) => { let ok = 0, stale = 0; for (const k of Object.keys(s)) { const e = t && t[k]; if (!e) continue; if (e[0] === s[k]) ok++; else stale++; } return { ok, stale, n: Object.keys(s).length }; };
  return { ui: [okUi, ui.length], labels: [okLb, lb.length], d: part(src.d, tr.d), p: part(src.p, tr.p) };
}

export function build({ quiet } = {}) {
  const srcF = path.join(I18N, "src.ko.json");
  if (!fs.existsSync(srcF)) return;
  const src = readJson(srcF);
  fs.mkdirSync(OUT, { recursive: true });
  const avail = [];
  for (const L of LANGS) {
    const tr = readJson(path.join(I18N, `${L.code}.json`), null);
    const fD = path.join(OUT, `${L.code}.js`), fP = path.join(OUT, `${L.code}-p.js`);
    if (!tr) { for (const f of [fD, fP]) if (fs.existsSync(f)) fs.unlinkSync(f); continue; }
    const pick = (s, t) => { const o = {}; for (const k of Object.keys(s)) { const e = t && t[k]; if (e && e[0] === s[k] && e[1]) o[k] = e[1]; } return o; };
    const ui = {}; for (const k of Object.keys(src.ui)) if (tr.ui && tr.ui[k] != null) ui[k] = tr.ui[k];
    const labels = {}; for (const k of src.labels) if (tr.labels && tr.labels[k] != null) labels[k] = tr.labels[k];
    fs.writeFileSync(fD, `window.TOEICFIT_L10N=${JSON.stringify({ lang: L.code, name: L.name, ui, labels, d: pick(src.d, tr.d) })};\n`);
    fs.writeFileSync(fP, `window.TOEICFIT_L10N_P=${JSON.stringify(pick(src.p, tr.p))};\n`);
    const c = coverage(src, tr);
    const ratio = Math.min(c.ui[0] / Math.max(1, c.ui[1]), c.d.ok / Math.max(1, c.d.n), c.p.ok / Math.max(1, c.p.n));
    if (ratio >= MIN_COVER) avail.push({ code: L.code, name: L.name });
    if (!quiet) console.log(`${L.code}: 화면 ${c.ui[0]}/${c.ui[1]} · 분류 ${c.labels[0]}/${c.labels[1]} · 단어 ${c.d.ok}/${c.d.n}${c.d.stale ? ` (다시 번역 ${c.d.stale})` : ""} · 실전 ${c.p.ok}/${c.p.n}${c.p.stale ? ` (다시 번역 ${c.p.stale})` : ""}${ratio >= MIN_COVER ? " · 앱에 표시" : ""}`);
  }
  fs.writeFileSync(path.join(OUT, "langs.js"), `window.TOEICFIT_LANGS=${JSON.stringify([{ code: "ko", name: "한국어" }].concat(avail))};\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cmd = process.argv[2];
  if (cmd === "extract") await extract();
  else if (cmd === "build" || cmd === "status") build();
}
