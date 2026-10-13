// 개인정보 처리방침 페이지(app/privacy.html) 만들기 — store/listings/<lang>.json 의 privacy 를 한 페이지에 모은다.
// 언어 고르기: ?lang= → 앱에서 고른 언어(같은 저장소) → 기기 언어 → 한국어. 위쪽 언어 버튼으로 바꿀 수 있다.
// 사용: node toeic/scripts/build_privacy.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LANGS = [["ko", "한국어"], ["en", "English"], ["ja", "日本語"], ["vi", "Tiếng Việt"], ["zh-TW", "繁體中文"], ["es", "Español"], ["fr", "Français"]];
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sections = LANGS.map(([l]) => {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, "store", "listings", `${l}.json`), "utf8")).privacy;
  return `<section lang="${l}" data-l="${l}" hidden>
  <h1>${esc(p.title)}</h1>
  <p>${esc(p.effective)}</p>
${p.sections.map(([h, b]) => `  <h2>${esc(h)}</h2>\n  <p>${esc(b)}</p>`).join("\n")}
</section>`;
}).join("\n");

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ToeicFit · Privacy Policy · 개인정보 처리방침</title>
<style>
  :root { --bg: #f4f6fb; --fg: #121826; --muted: #4a5468; --line: #e2e6ef; --chip: #fff; --brand: #2b59f0; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d1117; --fg: #edf1f7; --muted: #aab3c3; --line: #262e3b; --chip: #161b22; --brand: #6d8dff; color-scheme: dark; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.7 -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Hiragino Sans", "PingFang TC", system-ui, sans-serif; word-break: keep-all; overflow-wrap: break-word; }
  main { max-width: 720px; margin: 0 auto; padding: 20px 20px 64px; }
  nav { display: flex; flex-wrap: wrap; gap: 6px; }
  nav button { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 99px; border: 1px solid var(--line); background: var(--chip); color: var(--muted); cursor: pointer; }
  nav button[aria-pressed="true"] { border-color: var(--brand); color: var(--brand); font-weight: 700; }
  h1 { font-size: 24px; margin-top: 24px; } h2 { font-size: 18px; margin-top: 28px; border-top: 1px solid var(--line); padding-top: 20px; }
  p { color: var(--muted); }
</style>
</head>
<body>
<main>
<nav>${LANGS.map(([l, n]) => `<button type="button" data-pick="${l}" lang="${l}">${n}</button>`).join("")}</nav>
${sections}
</main>
<script>
(function () {
  var have = ${JSON.stringify(LANGS.map(([l]) => l))};
  function norm(x) {
    if (!x) return "";
    x = String(x);
    if (have.indexOf(x) >= 0) return x;
    var b = x.toLowerCase();
    if (b.indexOf("zh") === 0) return /tw|hk|mo|hant/.test(b) ? "zh-TW" : "";
    b = b.split("-")[0];
    return have.indexOf(b) >= 0 ? b : "";
  }
  var pick = "";
  try { pick = norm(new URLSearchParams(location.search).get("lang")); } catch (e) {}
  if (!pick) try { var st = JSON.parse(localStorage.getItem("toeicfit.v1") || "{}").settings; pick = norm(st && st.lang); } catch (e) {}
  if (!pick) { var ls = navigator.languages || [navigator.language]; for (var i = 0; i < ls.length && !pick; i++) pick = norm(ls[i]); }
  function show(l) {
    document.documentElement.lang = l;
    [].forEach.call(document.querySelectorAll("section[data-l]"), function (s) { s.hidden = s.getAttribute("data-l") !== l; });
    [].forEach.call(document.querySelectorAll("[data-pick]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-pick") === l ? "true" : "false"); });
  }
  [].forEach.call(document.querySelectorAll("[data-pick]"), function (b) { b.addEventListener("click", function () { show(b.getAttribute("data-pick")); }); });
  show(pick || "ko");
})();
</script>
<noscript><style>section[data-l] { display: block !important; }</style></noscript>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, "app", "privacy.html"), html);
console.log("app/privacy.html", LANGS.length, "languages");
