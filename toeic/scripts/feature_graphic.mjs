// Google Play 대표 이미지(1024×500) 만들기 — 스토어 스크린샷 2장을 오른쪽에 겹쳐 넣는다
// 사용: (app 폴더를 http 로 띄운 뒤) BASE_URL=http://localhost:8080/index.html node toeic/scripts/feature_graphic.mjs
// 다른 언어: STORE_LANG=en … → store/feature-graphic-<lang>.png (문구는 store/listings/<lang>.json, 스크린샷은 store/screenshots/<lang>/android)
// 일본어·중국어 글꼴: FONT_CSS=<Noto Sans JP/TC @font-face CSS 주소> (store_shots.mjs 와 같다)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE_URL || "http://localhost:8080/index.html";
const LANG = process.env.STORE_LANG || "ko";
const FG = JSON.parse(fs.readFileSync(path.join(ROOT, "store", "listings", `${LANG}.json`), "utf8")).featureGraphic;
const FONT_CSS = process.env.FONT_CSS || "";
const CJK = { ja: '"Noto Sans JP"', "zh-TW": '"Noto Sans TC"' }[LANG] || "";
const SHOTS = path.join("store", "screenshots", LANG === "ko" ? "" : LANG, "android");
const OUT = LANG === "ko" ? "store/feature-graphic.png" : `store/feature-graphic-${LANG}.png`;
const img = (f) => "data:image/png;base64," + fs.readFileSync(path.join(ROOT, f)).toString("base64");
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 })).newPage();
await p.setContent(`<html><head><style>
  @font-face { font-family: P; src: url("${BASE.replace(/index\.html.*$/, "")}fonts/PretendardVariable.woff2"); font-weight: 45 920; }
  body { margin: 0; width: 1024px; height: 500px; overflow: hidden; font-family: P, ${CJK ? CJK + ", " : ""}sans-serif; color: #fff;
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
</style>${FONT_CSS && CJK ? `<link rel="stylesheet" href="${FONT_CSS}">` : ""}</head><body lang="${LANG}">
  <div class="l"><div class="brand"><img src="${img("app/icons/icon-512.png")}">${FG.brand}</div>
    <h1>${FG.headline}</h1>
    <div class="sub">${FG.sub}</div></div>
  <div class="ph a"><img id="s1"></div><div class="ph b"><img id="s2"></div>
</body></html>`);
// 스크린샷에서 앱 화면 부분만 잘라 쓴다 (액자 문구 제외)
for (const [id, f] of [["s1", path.join(SHOTS, "02-home.png")], ["s2", path.join(SHOTS, "08-lc.png")]]) {
  await p.evaluate(async ([id, src]) => {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement("canvas"); const x = 97, y = 455, w = 886, h = 1465;
    c.width = w; c.height = h; c.getContext("2d").drawImage(im, x, y, w, h, 0, 0, w, h);
    document.getElementById(id).src = c.toDataURL();
  }, [id, img(f)]);
}
await p.evaluate(() => document.fonts.ready);
// 긴 문구(라틴 문자 언어)는 제목 2줄 · 부제 2줄 안에 들도록 글자 크기를 줄인다
await p.evaluate(() => {
  for (const [sel, px] of [["h1", 50], [".sub", 21]]) {
    const el = document.querySelector(sel); let f = px;
    el.style.whiteSpace = "nowrap"; el.style.width = "max-content"; // 줄은 <br> 에서만 바뀐다
    while (f > px * 0.55 && el.getBoundingClientRect().width > 490) { f -= 1; el.style.fontSize = f + "px"; }
  }
});
await p.waitForTimeout(500);
await p.screenshot({ path: path.join(ROOT, OUT) });
await b.close();
console.log(OUT);
