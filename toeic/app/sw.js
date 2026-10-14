// 오프라인 지원 (웹/PWA). 네이티브 앱(Capacitor)은 파일이 기기 안에 있어 필요 없다.
// 앱 화면 파일은 설치 때 미리 받고, 음성 파일은 처음 들을 때 저장해 두었다가 다음부터 오프라인 재생.
// 번역 파일(js/l10n/<언어>.js, <언어>-p.js)은 언어마다 수 MB라 미리 받지 않고, 앱이 고른 언어를 알려 주면 그 언어만 받아 둔다.
const VERSION = "toeicfit-v4";
const SHELL = ["./", "index.html", "css/app.css", "js/core.js", "js/app.js", "js/data.js", "js/practice.js", "js/l10n/langs.js", "fonts/PretendardVariable.woff2", "icons/icon.svg", "icons/icon-192.png", "manifest.webmanifest"];
const L10N_FILE = /^js\/l10n\/[a-zA-Z-]{2,8}(-p)?\.js$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== "toeicfit-audio").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// 앱이 쓰는 언어의 번역 파일을 받아 둔다 (이미 있으면 건너뜀)
self.addEventListener("message", (e) => {
  const list = e.data && Array.isArray(e.data.cache) ? e.data.cache.filter((p) => typeof p === "string" && L10N_FILE.test(p)) : [];
  if (!list.length) return;
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(list.map((p) => c.match(p).then((hit) => hit || c.add(p)).catch(() => {})))));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/audio/")) {
    e.respondWith(caches.open("toeicfit-audio").then(async (c) => {
      const key = url.pathname;
      const hit = await c.match(key);
      if (hit) return hit;
      // 오디오 태그는 Range 요청(206)을 보낸다 → 파일 전체를 따로 받아 저장해야 오프라인에서도 재생된다
      const res = await fetch(url.href, { credentials: "same-origin" });
      if (res.ok && res.status === 200) c.put(key, res.clone());
      return res;
    }));
    return;
  }
  // 화면 파일: 네트워크 우선(최신 반영), 실패하면 저장본 · 저장본도 없을 때 index.html 은 페이지 이동(navigate)에만
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: e.request.mode === "navigate" }).then((r) => r || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
