// 스토어 스크린샷 만들기 — 학습 진행 상태를 채운 뒤 주요 화면을 찍고, 문구가 들어간 액자 이미지로 합성한다.
// 사용: (app 폴더를 http 로 띄운 뒤) BASE_URL=http://localhost:8080/index.html PLAYWRIGHT_MODULE=... node toeic/scripts/store_shots.mjs
// 결과: toeic/store/screenshots/ios/*.png (1290×2796, 6.7"), toeic/store/screenshots/android/*.png (1080×1920)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE_URL || "http://localhost:8080/index.html";
const OUT = path.join(ROOT, "store", "screenshots");

// 스크린샷용 학습 상태: 목표 800점, 시험 D-30, 3주째 학습 중
function demoState(today, words) {
  const S = {
    v: 1,
    profile: { target: 800, examDate: null, daily: 40, start: today - 20 },
    settings: { theme: "light", autoWord: false, autoEx: false, rate: 1, showKo: true, readKo: true, hideMeaning: false, sfx: false, remind: true, remindAt: "21:00" },
    words: {}, log: {}, tests: {}, premium: false,
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
  return S;
}

const SHOTS = [
  { name: "01-target", cap: "목표 점수만 고르면\n학습 계획 끝", sub: "650점 1,070개 · 800점 2,551개 · 900점 3,600개", go: async (p) => { await p.click("[data-next]"); await p.click('[data-score="800"]'); } },
  { name: "02-home", cap: "오늘 할 일이\n한눈에", sub: "새 단어 · 복습 · 확인 퀴즈 · 오답노트", hash: "#/home" },
  { name: "03-card", cap: "예문과 출제 포인트까지\n카드 한 장에", sub: "모든 단어·예문 원어민 음성", go: async (p) => { await p.goto(BASE + "#/day/2"); await p.waitForTimeout(300); await p.click('[data-mode="card"]'); await p.waitForTimeout(250); await p.click("[data-flip]"); } },
  { name: "04-word", cap: "파생어 · 패러프레이징\nPart 5 문제까지", sub: "단어마다 토익 출제 포인트", hash: "#/word/01-15" },
  { name: "05-part5", cap: "Part 5 실전 문제\n3,600개", sub: "정답 이유와 오답 함정 해설", go: async (p) => { await p.goto(BASE + "#/day/3"); await p.waitForTimeout(300); await p.click('[data-mode="part5"]'); await p.waitForTimeout(250); const n = await p.$$eval("[data-pick]", (els) => els.length); await p.click('[data-pick="0"]'); } },
  { name: "06-days", cap: "90일 3단계 코스\n기본 · 심화 · 실전", sub: "토익 30개 주제를 3번 넓혀 가며", hash: "#/days" },
  { name: "07-stats", cap: "시험일에 맞춘\n진도 관리", sub: "학습 달력 · 난이도별 진도 · 정답률", hash: "#/stats" },
  { name: "08-dark", cap: "밤에도 눈 편하게\n다크 모드", sub: "PC · 태블릿 · 폰 어디서나", hash: "#/home", dark: true },
];

const SIZES = [
  { dir: "ios", W: 1290, H: 2796, vw: 430, vh: 932 },
  { dir: "android", W: 1080, H: 1920, vw: 360, vh: 640 },
];

const browser = await chromium.launch();
for (const sz of SIZES) {
  fs.mkdirSync(path.join(OUT, sz.dir), { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: sz.vw, height: sz.vh }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "ko-KR" });
  const probe = await ctx.newPage();
  await probe.goto(BASE);
  const { today, words } = await probe.evaluate(() => ({ today: window.Core.dayNum(), words: window.VOCA_DATA.words.map((w) => ({ id: w.id, tier: w.tier, d: w.d })) }));
  await probe.close();
  const state = demoState(today, words);
  for (const s of SHOTS) {
    const st = JSON.parse(JSON.stringify(state));
    if (s.dark) st.settings.theme = "dark";
    // 화면마다 새 페이지: 앱이 시작하기 전에 상태를 넣는다 (첫 화면 샷은 빈 상태)
    const p = await ctx.newPage();
    p.setDefaultTimeout(8000);
    await p.addInitScript(([x, seed]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.clear();
      if (seed) localStorage.setItem("vocafit.v1", JSON.stringify(x));
    }, [st, s.name !== "01-target"]);
    try {
      await p.goto(BASE + (s.hash || "#/home"));
      await p.waitForTimeout(300);
      if (s.go) await s.go(p);
    } catch (e) { console.log("실패", sz.dir, s.name, String(e.message).split("\n")[0], p.url()); await p.close(); continue; }
    await p.waitForTimeout(500);
    await p.evaluate(() => { const t = document.getElementById("toast"); if (t) t.innerHTML = ""; });
    const shot = await p.screenshot({ type: "png" });
    // 액자 합성: 브랜드 배경 + 문구 + 둥근 모서리 화면
    const frame = await ctx.newPage();
    await frame.setViewportSize({ width: sz.W, height: sz.H });
    const pad = Math.round(sz.W * 0.09);
    const shotW = sz.W - pad * 2;
    const capSize = Math.round(sz.W * 0.072);
    await frame.setContent(`<html><head><style>
      @font-face { font-family: P; src: url("${BASE.replace(/index\.html.*$/, "")}fonts/PretendardVariable.woff2"); font-weight: 45 920; }
      body { margin: 0; width: ${sz.W}px; height: ${sz.H}px; overflow: hidden; font-family: P, sans-serif;
        background: ${s.dark ? "radial-gradient(120% 80% at 50% 0%, #26304a, #0d1117)" : "radial-gradient(120% 80% at 50% 0%, #6d8cff, #2b59f0 55%, #1a3bb8)"}; color: #fff; }
      .cap { text-align: center; padding-top: ${Math.round(sz.H * 0.055)}px; font-size: ${capSize}px; font-weight: 850; letter-spacing: -0.03em; line-height: 1.22; white-space: pre-line; }
      .sub { text-align: center; margin-top: ${Math.round(capSize * 0.35)}px; font-size: ${Math.round(capSize * 0.38)}px; font-weight: 600; opacity: .85; }
      .shot { position: absolute; left: ${pad}px; top: ${Math.round(sz.H * 0.235)}px; width: ${shotW}px; border-radius: ${Math.round(shotW * 0.07)}px; overflow: hidden;
        box-shadow: 0 ${Math.round(sz.W * 0.02)}px ${Math.round(sz.W * 0.06)}px rgba(0,0,0,.35); border: ${Math.round(sz.W * 0.008)}px solid rgba(255,255,255,.18); }
      .shot img { display: block; width: 100%; }
    </style></head><body><div class="cap">${s.cap}</div><div class="sub">${s.sub}</div>
      <div class="shot"><img src="data:image/png;base64,${shot.toString("base64")}"></div></body></html>`);
    await frame.waitForTimeout(400);
    await frame.screenshot({ path: path.join(OUT, sz.dir, `${s.name}.png`) });
    await frame.close();
    await p.close();
    console.log(sz.dir, s.name);
  }
  await ctx.close();
}
await browser.close();
