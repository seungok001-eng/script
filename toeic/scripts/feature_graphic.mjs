// Google Play 대표 이미지(1024×500) 만들기 — 스토어 스크린샷 2장을 오른쪽에 겹쳐 넣는다
// 사용: (app 폴더를 http 로 띄운 뒤) BASE_URL=http://localhost:8080/index.html node toeic/scripts/feature_graphic.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE_URL || "http://localhost:8080/index.html";
const img = (f) => "data:image/png;base64," + fs.readFileSync(path.join(ROOT, f)).toString("base64");
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 })).newPage();
await p.setContent(`<html><head><style>
  @font-face { font-family: P; src: url("${BASE.replace(/index\.html.*$/, "")}fonts/PretendardVariable.woff2"); font-weight: 45 920; }
  body { margin: 0; width: 1024px; height: 500px; overflow: hidden; font-family: P, sans-serif; color: #fff;
    background: radial-gradient(120% 140% at 85% 10%, #6d8cff 0%, #2b59f0 45%, #1a3bb8 100%); position: relative; }
  .l { position: absolute; left: 64px; top: 92px; width: 520px; }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 800; opacity: .95; }
  .brand img { width: 56px; height: 56px; border-radius: 14px; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
  h1 { font-size: 50px; line-height: 1.18; letter-spacing: -0.035em; margin: 26px 0 16px; font-weight: 850; }
  .sub { font-size: 21px; font-weight: 600; opacity: .88; line-height: 1.5; }
  .ph { position: absolute; width: 230px; border-radius: 26px; overflow: hidden; border: 5px solid rgba(255,255,255,.22); box-shadow: 0 18px 50px rgba(0,0,0,.35); }
  .ph img { display: block; width: 100%; }
  .a { right: 230px; top: 46px; transform: rotate(-5deg); }
  .b { right: 40px; top: 96px; transform: rotate(4deg); }
</style></head><body>
  <div class="l"><div class="brand"><img src="${img("app/icons/icon-512.png")}">토익핏</div>
    <h1>목표 점수 맞춤<br>토익 단어 + 실전 문제</h1>
    <div class="sub">단어 3,600 · LC 표현 870 · Part 2~7 실전 문제<br>원어민 음성 · 하프 모의고사 · 예상 점수</div></div>
  <div class="ph a"><img id="s1"></div><div class="ph b"><img id="s2"></div>
</body></html>`);
// 스크린샷에서 앱 화면 부분만 잘라 쓴다 (액자 문구 제외)
for (const [id, f] of [["s1", "store/screenshots/android/02-home.png"], ["s2", "store/screenshots/android/08-lc.png"]]) {
  await p.evaluate(async ([id, src]) => {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement("canvas"); const x = 97, y = 455, w = 886, h = 1465;
    c.width = w; c.height = h; c.getContext("2d").drawImage(im, x, y, w, h, 0, 0, w, h);
    document.getElementById(id).src = c.toDataURL();
  }, [id, img(f)]);
}
await p.waitForTimeout(500);
await p.screenshot({ path: path.join(ROOT, "store/feature-graphic.png") });
await b.close();
console.log("store/feature-graphic.png");
