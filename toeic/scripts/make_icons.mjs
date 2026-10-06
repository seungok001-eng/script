// 앱 아이콘·스플래시 원본 만들기 (토익핏: 파란 그라데이션 + 흰 "T" + 주황 점)
// 사용: node toeic/scripts/make_icons.mjs  → app/icons/*, assets/* (그다음 npm run assets 로 안드로이드·iOS 아이콘 생성), icons/*.webp
// 렌더링은 Playwright(크로미움). PLAYWRIGHT_MODULE 로 모듈 경로를 바꿀 수 있다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const GRAD = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b82ff"/><stop offset="1" stop-color="#1a3bb8"/></linearGradient></defs>`;
const GLYPH = `<path d="M16 18h32v8H36v20h-8V26H16z" fill="#fff"/><circle cx="43.5" cy="42" r="4" fill="#ffb648"/>`;
const svg = (body, rx = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRAD}<rect width="64" height="64"${rx ? ` rx="${rx}"` : ""} fill="url(#g)"/>${body}</svg>`;
const scaled = (s) => `<g transform="translate(32 32) scale(${s}) translate(-32 -32)">${GLYPH}</g>`;

const ICON_SVG = svg(GLYPH, 16);                 // 웹 파비콘 (둥근 모서리)
const MASK_SVG = svg(scaled(0.72));              // 마스커블 (안전 영역 안)
const SQUARE_SVG = svg(GLYPH);                   // 스토어·iOS (모서리는 OS 가 둥글게)
const BG_SVG = svg("");
const FG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${scaled(0.66)}</svg>`; // 안드로이드 적응형 전경 (투명 배경)

fs.writeFileSync(path.join(ROOT, "app/icons/icon.svg"), ICON_SVG);
fs.writeFileSync(path.join(ROOT, "app/icons/icon-maskable.svg"), MASK_SVG);

const b = await chromium.launch();
const page = await b.newPage();
async function render(svgText, size, out, opt = {}) {
  const bg = opt.bg || "transparent";
  const inner = opt.inner || size;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${bg};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svgText.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: out, omitBackground: bg === "transparent" });
}
for (const n of [1024, 512, 192, 180]) await render(SQUARE_SVG, n, path.join(ROOT, `app/icons/icon-${n}.png`));
await render(MASK_SVG, 512, path.join(ROOT, "app/icons/icon-maskable-512.png"));
await render(SQUARE_SVG, 1024, path.join(ROOT, "assets/icon-only.png"));
await render(BG_SVG, 1024, path.join(ROOT, "assets/icon-background.png"));
await render(FG_SVG, 1024, path.join(ROOT, "assets/icon-foreground.png"));
await render(ICON_SVG, 2732, path.join(ROOT, "assets/splash.png"), { bg: "#f4f6fb", inner: 410 });
await render(ICON_SVG, 2732, path.join(ROOT, "assets/splash-dark.png"), { bg: "#0d1117", inner: 410 });
for (const n of [48, 72, 96, 128, 192, 256, 512]) {
  const tmp = path.join(ROOT, `icons/_tmp-${n}.png`);
  await render(SQUARE_SVG, n, tmp);
  const buf = fs.readFileSync(tmp);
  await page.setContent(`<canvas id="c" width="${n}" height="${n}"></canvas>`);
  const webp = await page.evaluate(async ({ b64, n }) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.getElementById("c"); c.getContext("2d").drawImage(img, 0, 0, n, n);
    return c.toDataURL("image/webp", 0.92).split(",")[1];
  }, { b64: buf.toString("base64"), n });
  fs.writeFileSync(path.join(ROOT, `icons/icon-${n}.webp`), Buffer.from(webp, "base64"));
  fs.unlinkSync(tmp);
}
await b.close();
console.log("아이콘·스플래시 원본을 만들었습니다. 이어서: (toeic 폴더에서) npm run assets");
