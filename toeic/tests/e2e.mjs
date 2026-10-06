const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.BASE_URL || "http://localhost:8765/index.html";
const out = (process.env.SHOT_DIR || "/tmp/") + "toeicfit-";
const errors = [], fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push("pageerror " + e.message));
p.on("console", (m) => { if (m.type() === "error") errors.push("console " + m.text()); });
await p.goto(base);
await p.click("[data-next]"); await p.click('[data-score="700"]'); await p.click("[data-next]"); await p.click("[data-next]"); await p.click("[data-next]");
await p.waitForTimeout(1200);
ok(p.url().endsWith("#/diag") && (await p.$("[data-diag-go]")), "onboarding → diagnostic intro: " + p.url());
await p.click("[data-diag-later]"); await p.waitForTimeout(300);
ok(p.url().endsWith("#/home"), "diagnostic later → home");
// 0) 처음 쓰는 사람 안내: 시작 미션 1일차 3개 · 카드 화면 첫 방문 팁(한 번만)
ok((await p.$$(".mission .mis-item")).length === 3 && (await p.textContent(".mission")).includes("1일차"), "start mission card day 1");
// 1) 카드 3장 학습 후 새로고침해도 기록 유지
await p.click('.hero [data-go="new"]'); await p.waitForTimeout(250);
ok(await p.$(".coach"), "card coach tip shown");
await p.click(".coach-ok");
ok(!(await p.$(".coach")) && (await p.evaluate(() => window.__toeicfit.state.tips.card)) === 1, "coach tip dismissed and remembered");
for (let i = 0; i < 3; i++) { await p.click("[data-flip]"); await p.click('[data-g="2"]'); }
const seen1 = await p.evaluate(() => Object.keys(window.__toeicfit.state.words).length);
await p.waitForTimeout(400);
await p.reload(); await p.waitForTimeout(400);
const seen2 = await p.evaluate(() => Object.keys(window.__toeicfit.state.words).length);
ok(seen1 === 3 && seen2 === 3, `persist after reload ${seen1}/${seen2}`);
ok(p.url().endsWith("#/home"), "reload on #/study → home: " + p.url());
ok(!(await p.$(".coach")), "card tip not shown again");
// 사용 가이드: 자주 묻는 질문 · 미션(가이드 읽기) 기록
await p.goto(base + "#/guide"); await p.waitForTimeout(200);
ok((await p.$$(".faq")).length >= 5 && (await p.$$(".g-card")).length >= 5, "guide page");
ok(await p.evaluate(() => !!window.__toeicfit.state.guide.done.guide), "guide visit recorded");
// 2) 듣기 모드 → 뒤로가기 → 세션 종료
await p.goto(base + "#/day/1"); await p.waitForTimeout(200);
await p.click('[data-mode="listen"]'); await p.click("[data-toggle]"); await p.waitForTimeout(300);
await p.goBack(); await p.waitForTimeout(3500);
ok(p.url().endsWith("#/day/1"), "back from listen → day1: " + p.url());
ok(await p.$(".tabbar"), "listen did not overwrite page");
// 3) 퀴즈 나가기 후 뒤로가기 함정 없음
await p.click('[data-mode="meaning"]'); await p.waitForTimeout(200);
await p.click("[data-exit]"); await p.click('[data-r="1"]'); await p.waitForTimeout(300);
ok(p.url().endsWith("#/day/1"), "exit quiz → day1: " + p.url());
await p.goBack(); await p.waitForTimeout(300);
ok(!p.url().includes("study"), "back after exit not study: " + p.url());
// 4) 정답 직후 뒤로가기 → 자동 넘김이 다른 화면을 덮지 않음
await p.goto(base + "#/day/2"); await p.waitForTimeout(200);
await p.click('[data-mode="meaning"]'); await p.waitForTimeout(200);
const ans = await p.evaluate(() => { const q = document.querySelectorAll("[data-pick]"); return q.length; });
await p.click('[data-pick="0"]'); await p.goBack(); await p.waitForTimeout(1300);
ok(await p.$(".tabbar"), "quiz timer did not overwrite page");
// 5) 설정 화면 레이아웃 (가로 스크롤 없음)
for (const r of ["#/settings", "#/review", "#/stats", "#/home", "#/days", "#/part1", "#/conf", "#/search", "#/lc", "#/practice", "#/grammar", "#/mock", "#/dict"]) {
  await p.goto(base + r); await p.waitForTimeout(250);
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 390, `no h-scroll ${r}: ${w}`);
}
await p.goto(base + "#/settings"); await p.waitForTimeout(250); await p.screenshot({ path: out + "settings.png", fullPage: true });
await p.goto(base + "#/review"); await p.waitForTimeout(250); await p.screenshot({ path: out + "review.png", fullPage: true });
// 5-1) LC 실전 퀴즈: Part 2 탭 → 응답 고르기 → 답하면 스크립트·해석이 보이고 기록이 남는다 → 다음 문제
await p.goto(base + "#/lc"); await p.waitForTimeout(250);
await p.click('[data-part="2"]'); await p.waitForTimeout(150);
await p.click('[data-lcq="resp"]'); await p.waitForTimeout(300);
ok(p.url().includes("#/study") && (await p.$$("[data-pick]")).length === 3, "lc resp quiz 3 options");
ok(!(await p.$(".quiz-q .qs")), "lc resp script hidden by default");
await p.click('[data-pick="1"]'); await p.waitForTimeout(250);
ok(await p.$(".feedback") && await p.$(".quiz-q .qs"), "lc resp feedback + script shown");
const lcRec = await p.evaluate(() => Object.keys(window.__toeicfit.state.lc).length);
ok(lcRec === 1, "lc record saved " + lcRec);
await p.click("[data-next]"); await p.waitForTimeout(200);
ok((await p.textContent(".cnt")).startsWith("2"), "lc next question");
await p.goBack(); await p.waitForTimeout(300);
ok(p.url().endsWith("#/lc"), "exit lc quiz → lc: " + p.url());
await p.click('[data-part="4"]'); await p.waitForTimeout(150);
await p.click('[data-lcq="lcm"]'); await p.waitForTimeout(300);
ok((await p.$$("[data-pick]")).length === 4, "lc meaning quiz 4 options");
await p.goBack(); await p.waitForTimeout(200);
// 5-2) 실전: 허브 → Part 3 세트 풀기·채점(스크립트·근거) → 하프 모의고사 끝까지 제출 → 예상 점수
await p.goto(base + "#/practice"); await p.waitForTimeout(1500);
ok(await p.$('a[href="#/sets/p3"]'), "practice hub loaded");
await p.goto(base + "#/sets/p3"); await p.waitForTimeout(300);
await p.click("[data-set]"); await p.waitForTimeout(300);
for (let j = 0; j < 3; j++) await p.click(`.pq [data-q="${j}"][data-o="0"]`);
await p.click("[data-grade]"); await p.waitForTimeout(300);
ok((await p.$$(".sline")).length >= 6 && (await p.$$(".feedback")).length === 3, "p3 graded with script");
const prac = await p.evaluate(() => Object.keys(window.__toeicfit.state.prac).length);
ok(prac === 1, "p3 record " + prac);
await p.goBack(); await p.waitForTimeout(300);
// Part 1 (사진이 들어온 문제가 있을 때): 6문제 이어 풀기 → 채점마다 문장 4개·해설 → 결과
const hasP1 = await p.evaluate(() => (window.VOCA_PRACTICE.p1 || []).length);
if (hasP1) {
  await p.goto(base + "#/sets/p1"); await p.waitForTimeout(300);
  ok(await p.$(".p1thumb"), "p1 list thumbnails");
  await p.click("[data-run]"); await p.waitForTimeout(300);
  for (let k = 0; k < 6; k++) {
    ok(await p.$(".p1photo img"), "p1 photo shown " + k);
    ok((await p.$$(".pq [data-pline]")).length === 4 && !(await p.$(".pq .en")), "p1 options hidden before grading " + k);
    await p.click('.pq [data-q="0"][data-o="1"]'); await p.click("[data-grade]"); await p.waitForTimeout(150);
    ok((await p.$$(".opt.sline .en")).length === 4 && (await p.$$(".feedback")).length === 1, "p1 graded shows 4 statements " + k);
    await p.click("[data-next]"); await p.waitForTimeout(150);
  }
  ok(await p.$(".result-hero"), "p1 result");
  await p.goto(base + "#/home"); await p.waitForTimeout(200);
}
await p.goto(base + "#/mock"); await p.waitForTimeout(300);
await p.click('[data-mock="1"]'); await p.waitForTimeout(150); await p.click("[data-go-mock]"); await p.waitForTimeout(300);
if (hasP1 >= 12) ok(await p.$(".p1photo img"), "mock starts with Part 1 photo");
for (let k = 0; k < 200 && !(await p.$(".result-hero")); k++) {
  const pick = await p.$("[data-pick]"); if (pick) await pick.click();
  const conf = await p.$('#modal [data-r="1"]'); if (conf) { await conf.click(); await p.waitForTimeout(150); continue; }
  await p.click("[data-next]"); await p.waitForTimeout(40);
}
const mock = await p.evaluate(() => window.__toeicfit.state.mock[1]);
ok(mock && mock.total >= 10 && mock.total <= 990, "mock submitted " + JSON.stringify(mock));
await p.click("[data-mrev]"); await p.waitForTimeout(300);
ok(await p.$(".feedback"), "mock review shows explanations");
// 재응시: '재응시' 표시 · 첫 응시 점수 유지 · 예상 점수용 기록(pr)은 늘지 않는다
const prBefore = await p.evaluate(() => (window.__toeicfit.state.pr.lc || []).length + (window.__toeicfit.state.pr.rc || []).length);
await p.goto(base + "#/mock"); await p.waitForTimeout(300);
await p.click('[data-mock="1"]'); await p.waitForTimeout(150);
ok((await p.textContent("#modal")).includes("재응시"), "retake note in start modal");
await p.click("[data-go-mock]"); await p.waitForTimeout(300);
for (let k = 0; k < 200 && !(await p.$(".result-hero")); k++) {
  const conf = await p.$('#modal [data-r="1"]'); if (conf) { await conf.click(); await p.waitForTimeout(150); continue; }
  await p.click("[data-next]"); await p.waitForTimeout(40);
}
ok((await p.textContent(".result-hero")).includes("재응시"), "retake result marked");
const m2 = await p.evaluate(() => window.__toeicfit.state.mock[1]);
ok(m2.n === 2 && m2.first === mock.total, "retake keeps first score " + JSON.stringify(m2));
const prAfter = await p.evaluate(() => (window.__toeicfit.state.pr.lc || []).length + (window.__toeicfit.state.pr.rc || []).length);
ok(prAfter === prBefore, `retake not counted in predicted score ${prBefore} → ${prAfter}`);
await p.goto(base + "#/home"); await p.waitForTimeout(200);
// 5-3) 유료화(결제 화면 강제 켜기): 첫 실력 진단 → 결과 + 결제 제안 · Day 4 잠김 · 파트별 2번째 세트 잠김
{
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  const q = await c2.newPage();
  q.on("pageerror", (e) => errors.push("pageerror(pay) " + e.message));
  await q.goto(base); await q.evaluate(() => localStorage.setItem("toeicfit.paywall", "1")); await q.reload();
  await q.click("[data-next]"); await q.click('[data-score="800"]'); await q.click("[data-next]"); await q.click("[data-next]"); await q.click("[data-next]");
  await q.waitForTimeout(1200);
  await q.click("[data-diag-go]"); await q.waitForTimeout(400);
  for (let k = 0; k < 60 && !(await q.$(".result-hero")); k++) {
    const conf = await q.$('#modal [data-r="1"]'); if (conf) { await conf.click(); await q.waitForTimeout(150); continue; }
    const o = await q.$(".pq [data-o]"); if (o) await o.click();
    await q.click("[data-next]"); await q.waitForTimeout(40);
  }
  const hero = await q.textContent(".result-hero");
  ok(/진단 20문제/.test(hero), "diagnostic result shown");
  const buy = await q.textContent("[data-buy]"), free = await q.textContent("[data-free]");
  ok(buy.includes("전체 열기") && buy.includes("출시 할인") && free.includes("무료로 3일 먼저 써 보기"), `offer buttons: ${buy} / ${free}`);
  ok(await q.evaluate(() => !!window.__toeicfit.state.diag && !window.__toeicfit.state.mock.d), "diag stored separately from mocks");
  await q.click("[data-free]"); await q.waitForTimeout(300);
  ok(q.url().endsWith("#/home") && !(await q.$('[data-go="diag"]')), "free trial → home, diagnostic task gone");
  await q.goto(base + "#/day/4"); await q.waitForTimeout(300);
  ok(q.url().includes("#/premium") && (await q.textContent(".paywall-hero")).includes("Day 1~3"), "Day 4 locked → paywall: " + q.url());
  await q.goto(base + "#/sets/p4"); await q.waitForTimeout(800);
  await q.click("[data-set]"); await q.waitForTimeout(300);
  for (let j = 0; j < 3; j++) await q.click(`.pq [data-q="${j}"][data-o="0"]`);
  await q.click("[data-grade]"); await q.waitForTimeout(200);
  await q.goto(base + "#/sets/p4"); await q.waitForTimeout(300);
  const second = await q.$$("[data-set]");
  await second[second.length - 1].click(); await q.waitForTimeout(300);
  ok(q.url().includes("#/premium?from=set"), "second Part 4 set → paywall: " + q.url());
  await c2.close();
}
// 6) 조작된 저장값 정리
const st = await p.evaluate(() => window.__toeicfit.sanitize({ profile: { target: "<img src=x onerror=alert(1)>", daily: "9999", examDate: "x" }, words: { "01-01": { b: 99, n: "3" }, "zz": {} }, tests: { "5": { best: "<b>" }, "75": { best: 90, last: 90, at: 1 } }, lc: { "lc-1": { ok: "2", ng: 1, wrong: 1 }, "lc-99999": { ok: 1 } }, settings: { theme: "<x>", rate: 5, autoWord: "yes" }, premium: true }));
const sg = await p.evaluate(() => window.__toeicfit.sanitize({ profile: { target: 800, daily: 30 }, guide: { start: 5, done: { card: 5, "<x>": 1 }, hide: 1 }, tips: { card: 1, "a b": 1 } }));
ok(sg.guide.start === 5 && sg.guide.done.card === 5 && !sg.guide.done["<x>"] && sg.guide.hide === true && sg.tips.card === 1 && !sg.tips["a b"], "sanitize guide/tips " + JSON.stringify(sg.guide));
ok(st.profile.target === 800 && st.profile.daily === 200 && st.words["01-01"].b === 6 && st.words["01-01"].n === 3 && !st.words.zz && st.tests[5].best === 0 && st.tests[75].best === 90 && st.lc["lc-1"].ok === 2 && st.lc["lc-1"].wrong === true && !st.lc["lc-99999"] && st.settings.theme === "system" && st.settings.rate === 1 && st.settings.autoWord === true, "sanitize " + JSON.stringify(st));
await b.close();
// 7) 데스크톱: 마우스 드래그 스와이프가 카드를 뒤집지 않고 한 번만 채점 / Enter 키 버튼
const b2 = await chromium.launch();
const p2 = await (await b2.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
p2.on("pageerror", (e) => errors.push("d pageerror " + e.message));
await p2.goto(base);
await p2.click("[data-next]"); await p2.click("[data-next]"); await p2.click("[data-next]"); await p2.click("[data-next]");
await p2.click("[data-diag-later]"); await p2.waitForTimeout(300);
await p2.click('.hero [data-go="new"]'); await p2.waitForTimeout(200);
const box = await (await p2.$("#flash")).boundingBox();
await p2.mouse.move(box.x + box.width / 2, box.y + 100); await p2.mouse.down();
await p2.mouse.move(box.x + box.width / 2 + 200, box.y + 100, { steps: 8 }); await p2.mouse.up();
await p2.waitForTimeout(500);
const after = await p2.evaluate(() => ({ n: Object.keys(window.__toeicfit.state.words).length, cnt: document.querySelector(".cnt").textContent }));
ok(after.n === 1 && after.cnt.startsWith("2"), "swipe graded once " + JSON.stringify(after));
await p2.keyboard.press("Space"); await p2.waitForTimeout(150);
await p2.focus('[data-g="0"]'); await p2.keyboard.press("Enter"); await p2.waitForTimeout(200);
const c3 = await p2.evaluate(() => document.querySelector(".cnt").textContent);
ok(c3.startsWith("3"), "enter on focused grade button: " + c3);
await p2.goto(base + "#/settings"); await p2.waitForTimeout(250); await p2.screenshot({ path: out + "d-settings.png" });
await b2.close();
console.log("FAILS:", fails.length ? "\n - " + fails.join("\n - ") : "none");
console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
