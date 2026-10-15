// 스토어 스크린샷 만들기 — 학습 진행 상태를 채운 뒤 주요 화면을 찍고, 문구가 들어간 액자 이미지로 합성한다.
// 사용: (app 폴더를 http 로 띄운 뒤) BASE_URL=http://localhost:8080/index.html PLAYWRIGHT_MODULE=... node toeic/scripts/store_shots.mjs
// 결과: toeic/store/screenshots/ios/*.png (1290×2796, 6.7"), toeic/store/screenshots/android/*.png (1080×1920)
// 다른 언어: STORE_LANG=en|ja|vi|zh-TW|es|fr → toeic/store/screenshots/<lang>/{ios,android}. 문구는 store/listings/<lang>.json 의 shots.
// 일본어·중국어는 이 서버에 글꼴이 없으면 FONT_CSS=<Noto Sans JP/TC @font-face CSS 주소> 를 주면 그 글꼴로 찍는다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE_URL || "http://localhost:8080/index.html";
const LANG = process.env.STORE_LANG || "ko";
const OUT = path.join(ROOT, "store", "screenshots", LANG === "ko" ? "" : LANG);
const LISTING = JSON.parse(fs.readFileSync(path.join(ROOT, "store", "listings", `${LANG}.json`), "utf8"));
const LOCALE = { ko: "ko-KR", en: "en-US", ja: "ja-JP", vi: "vi-VN", "zh-TW": "zh-TW", es: "es-MX", fr: "fr-FR" }[LANG];
const FONT_CSS = process.env.FONT_CSS || "";
const CJK = { ja: '"Noto Sans JP"', "zh-TW": '"Noto Sans TC"' }[LANG] || "";
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// 스크린샷용 학습 상태: 목표 800점, 시험 D-30, 3주째 학습 중
function demoState(today, words) {
  const S = {
    v: 1,
    profile: { target: 800, examDate: null, daily: 40, start: today - 20 },
    settings: { theme: "light", sfx: false, autoWord: false, autoEx: false, rate: 1, showKo: true, hideMeaning: false, sfx: false, remind: true, remindAt: "21:00", lang: LANG },
    words: {}, log: {}, tests: {}, premium: false,
    tips: { card: 1, sort: 1, quiz: 1, listen: 1, p1: 1, p2: 1, p34: 1, p67: 1, practice: 1, review: 1 }, // 스크린샷에는 첫 방문 팁을 띄우지 않는다
  };
  const d = new Date((today + 30) * 86400000);
  S.profile.examDate = d.toISOString().slice(0, 10);
  const pool = words.filter((w) => w.tier <= 2).sort((a, b) => a.tier - b.tier || a.d - b.d);
  pool.slice(0, 720).forEach((w, i) => {
    const b = i < 300 ? 4 + (i % 3) : i < 600 ? 1 + (i % 3) : 0;
    const first = today - 20 + Math.floor(i / 36);
    S.words[w.id] = { b, due: b ? today + [0, 1, 3, 7, 14, 30, 60][b] - (i % 4 === 0 ? [0, 1, 3, 7, 14, 30, 60][b] : 0) : today, n: 2 + (i % 4), ok: 2 + (i % 3), ng: i % 5 === 0 ? 1 : 0, last: today - (i % 5), first };
    if (i % 17 === 0) S.words[w.id].star = true;
    if (i % 23 === 0) S.words[w.id].wrong = true;
  });
  for (let k = 0; k < 21; k++) {
    if (k === 6 || k === 13) continue;
    S.log[today - 20 + k] = { new: 30 + ((k * 7) % 15), rev: 20 + ((k * 11) % 40), q: 25 + (k % 9), ok: 22 + (k % 7), sec: 1500, done: true };
  }
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].forEach((day, i) => { S.tests[day] = { best: [92, 88, 85, 95, 80, 76, 90, 84, 100, 72, 88, 91, 86, 79, 94][i], last: 80, at: today - 15 + i }; });
  // 실전 문제 기록: 예상 점수 · 약점 분석 · 모의고사
  S.pr = { lc: Array.from({ length: 60 }, (_, i) => (i % 5 === 0 ? 0 : 1)), rc: Array.from({ length: 60 }, (_, i) => (i % 4 === 0 ? 0 : 1)) };
  S.qt = { "p7:추론": { ok: 7, n: 12 }, "p6:문장 삽입": { ok: 6, n: 10 }, "p3:의도 파악": { ok: 5, n: 8 }, "p5:관계대명사": { ok: 10, n: 13 }, "p4:시각 자료": { ok: 7, n: 9 } };
  S.mock = { 1: { lc: 395, rc: 360, total: 755, best: 755, at: today - 2 } };
  return S;
}

const SHOTS = [
  { name: "01-target", go: async (p) => { await p.click("[data-next]"); await p.click('[data-score="800"]'); } },
  { name: "02-home", hash: "#/home" },
  { name: "03-card", go: async (p) => { await p.goto(BASE + "#/day/2"); await p.waitForTimeout(300); await p.click(".more-modes summary"); /* 카드 암기는 '더 연습하기' 안에 있다 */ await p.waitForTimeout(150); await p.click('[data-mode="card"]'); await p.waitForTimeout(250); await p.click("[data-flip]"); } },
  { name: "04-p3", go: async (p) => { await p.goto(BASE + "#/sets/p3"); await p.waitForTimeout(1200); await p.click("[data-set]"); await p.waitForTimeout(400); for (let j = 0; j < 3; j++) await p.click(`.pq [data-q="${j}"][data-o="${j === 1 ? 3 : 0}"]`); await p.click("[data-grade]"); await p.waitForTimeout(400); const t = await p.$(".script"); if (t) await t.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70)); } },
  { name: "05-p7", go: async (p) => { await p.goto(BASE + "#/sets/p7"); await p.waitForTimeout(1200); await p.locator("[data-cat]").nth(4).click(); /* 전체·안 푼 것·틀린 것·단일·이중 — 다른 언어에서는 값도 번역되므로 순서로 고른다 */ await p.waitForTimeout(300); await p.click("[data-set]"); await p.waitForTimeout(400); const n = await p.$$eval(".pq", (x) => x.length); for (let j = 0; j < n; j++) await p.click(`.pq [data-q="${j}"][data-o="1"]`); await p.click("[data-grade]"); await p.waitForTimeout(500); const m = await p.$("mark.on"); if (m) await m.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 160)); } },
  { name: "06-days", hash: "#/days" },
  { name: "07-practice", hash: "#/practice" },
  { name: "08-lc", go: async (p) => { await p.goto(BASE + "#/lc"); await p.waitForTimeout(300); await p.click('[data-part="2"]'); await p.waitForTimeout(200); await p.click('[data-lcq="resp"]'); await p.waitForTimeout(400); await p.click('[data-pick="0"]'); await p.waitForTimeout(300); await p.evaluate(() => window.scrollTo(0, 0)); } },
];

const SIZES = [
  { dir: "ios", W: 1290, H: 2796, vw: 430, vh: 932 },
  { dir: "android", W: 1080, H: 1920, vw: 360, vh: 640 },
];

const browser = await chromium.launch();
// 액자 합성은 배율 1 로 — 앱 화면용 컨텍스트(배율 3)에서 만들면 결과가 3배 크기가 되어 스토어 규격을 벗어난다
const frameCtx = await browser.newContext({ deviceScaleFactor: 1 });
for (const sz of SIZES) {
  fs.mkdirSync(path.join(OUT, sz.dir), { recursive: true });
  const ctx = await browser.newContext({ locale: LOCALE, viewport: { width: sz.vw, height: sz.vh }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const probe = await ctx.newPage();
  await probe.goto(BASE);
  const { today, words } = await probe.evaluate(() => ({ today: window.Core.dayNum(), words: window.VOCA_DATA.words.map((w) => ({ id: w.id, tier: w.tier, d: w.d })) }));
  await probe.close();
  const state = demoState(today, words);
  for (const s of SHOTS.filter((x) => !process.env.ONLY || process.env.ONLY.split(",").includes(x.name))) { // ONLY=03-card,05-p7 처럼 일부만 다시 찍기
    const st = JSON.parse(JSON.stringify(state));
    if (s.dark) st.settings.theme = "dark";
    // 화면마다 새 페이지: 앱이 시작하기 전에 상태를 넣는다 (첫 화면 샷은 빈 상태)
    const p = await ctx.newPage();
    p.setDefaultTimeout(8000);
    // 인사말이 찍는 시각에 따라 달라지지 않게 오늘 오전 9시로 고정
    const nine = new Date(); nine.setHours(9, 0, 0, 0);
    await p.clock.setFixedTime(nine);
    await p.addInitScript(([x, seed]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.clear();
      if (seed) localStorage.setItem("toeicfit.v1", JSON.stringify(x));
    }, [st, s.name !== "01-target"]);
    try {
      await p.goto(BASE + (s.hash || "#/home"));
      await p.waitForTimeout(300);
      if (s.go) await s.go(p);
      if (FONT_CSS && CJK) {
        await p.addStyleTag({ url: FONT_CSS });
        await p.addStyleTag({ content: `html body, html body * { font-family: "Pretendard", ${CJK}, sans-serif !important; }` });
        await p.evaluate(() => document.fonts.ready);
      }
    } catch (e) { console.log("실패", sz.dir, s.name, String(e.message).split("\n")[0], p.url()); await p.close(); continue; }
    await p.waitForTimeout(500);
    await p.evaluate(() => { const t = document.getElementById("toast"); if (t) t.innerHTML = ""; });
    const shot = await p.screenshot({ type: "png" });
    // 액자 합성: 브랜드 배경 + 문구 + 둥근 모서리 화면
    const cap = esc(LISTING.shots[s.name].cap), sub = esc(LISTING.shots[s.name].sub);
    const frame = await frameCtx.newPage();
    await frame.setViewportSize({ width: sz.W, height: sz.H });
    const pad = Math.round(sz.W * 0.09);
    const shotW = sz.W - pad * 2;
    const capSize = Math.round(sz.W * 0.072);
    await frame.setContent(`<html><head><style>
      @font-face { font-family: P; src: url("${BASE.replace(/index\.html.*$/, "")}fonts/PretendardVariable.woff2"); font-weight: 45 920; }
      body { margin: 0; width: ${sz.W}px; height: ${sz.H}px; overflow: hidden; font-family: P, ${CJK ? CJK + ", " : ""}sans-serif;
        background: ${s.dark ? "radial-gradient(120% 80% at 50% 0%, #26304a, #0d1117)" : "radial-gradient(120% 80% at 50% 0%, #6d8cff, #2b59f0 55%, #1a3bb8)"}; color: #fff; }
      .cap { text-align: center; padding-top: ${Math.round(sz.H * 0.055)}px; font-size: ${capSize}px; font-weight: 850; letter-spacing: -0.03em; line-height: 1.22; white-space: pre-line; }
      .sub { text-align: center; margin-top: ${Math.round(capSize * 0.35)}px; font-size: ${Math.round(capSize * 0.38)}px; font-weight: 600; opacity: .85; }
      .shot { position: absolute; left: ${pad}px; top: ${Math.round(sz.H * 0.235)}px; width: ${shotW}px; border-radius: ${Math.round(shotW * 0.07)}px; overflow: hidden;
        box-shadow: 0 ${Math.round(sz.W * 0.02)}px ${Math.round(sz.W * 0.06)}px rgba(0,0,0,.35); border: ${Math.round(sz.W * 0.008)}px solid rgba(255,255,255,.18); }
      .shot img { display: block; width: 100%; }
    </style>${FONT_CSS && CJK ? `<link rel="stylesheet" href="${FONT_CSS}">` : ""}</head><body lang="${LANG}"><div class="cap">${cap}</div><div class="sub">${sub}</div>
      <div class="shot"><img src="data:image/png;base64,${shot.toString("base64")}"></div></body></html>`);
    await frame.evaluate(() => document.fonts.ready);
    await frame.waitForTimeout(400);
    await frame.screenshot({ path: path.join(OUT, sz.dir, `${s.name}.png`) });
    await frame.close();
    await p.close();
    console.log(sz.dir, s.name);
  }
  await ctx.close();
}
await browser.close();
