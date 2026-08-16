// ─────────────────────────────────────────────────────────────
// Gemini 자동 다음 단계 — content script (gemini.google.com, Gems 포함)
//   응답이 끝날 때마다 입력창에 "다음 단계 진행해"를 넣고 전송, 지정 횟수 반복.
//
// v1.3 — 완료 감지를 '콘텐츠 안정화'로 변경(버튼 탐지에 의존하지 않음).
//        응답 텍스트가 멈추면 ~1.5초 내 다음 입력 → 지연 문제 해결.
// ─────────────────────────────────────────────────────────────
(function () {
  window.__geminiAutoNextLoaded = true;

  const MESSAGE_TEXT = "다음 단계 진행해";
  const TAG = "[Gemini자동]";
  const STABLE_MS = 1500; // 이 시간 동안 텍스트 변화 없으면 '완료'
  let running = false;
  let badge = null;
  let badgeText = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const qa = (sel) => Array.from(document.querySelectorAll(sel));
  const log = (...a) => console.log(TAG, ...a);

  const isVisible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const editorText = (e) => (e ? (e.value ?? e.textContent ?? "") : "");

  const attrText = (el) =>
    [
      el.getAttribute("aria-label"),
      el.getAttribute("mattooltip"),
      el.getAttribute("data-test-id"),
      el.getAttribute("title"),
      el.className && el.className.toString(),
      el.querySelector("mat-icon, svg")?.textContent,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  function getEditor() {
    const ql = qa('div.ql-editor[contenteditable="true"]').filter(isVisible);
    if (ql.length) return ql[ql.length - 1];
    const eds = qa(
      'div[contenteditable="true"], textarea, div[role="textbox"], rich-textarea textarea, rich-textarea .ql-editor',
    ).filter(isVisible);
    return eds[eds.length - 1] || null;
  }

  function findButton(keywords, extraSel) {
    if (extraSel) {
      const bySel = qa(extraSel).filter(isVisible);
      if (bySel.length) return bySel[bySel.length - 1];
    }
    const btns = qa('button, [role="button"]').filter(isVisible);
    return (
      btns.find((b) => {
        const t = attrText(b);
        return keywords.some((k) => t.includes(k));
      }) || null
    );
  }
  function getStopButton() {
    return findButton(
      ["stop", "중지", "중단", "생성 중지", "응답 중지"],
      'button.stop, button[aria-label*="중지"], button[aria-label*="Stop" i]',
    );
  }
  function getSendButton() {
    return findButton(
      ["send", "보내기", "전송", "submit", "제출"],
      'button.send-button, button[aria-label*="보내기"], button[aria-label*="Send" i], button[mattooltip*="보내기"]',
    );
  }
  function isGenerating() {
    return !!getStopButton();
  }

  // 대화 본문 영역의 텍스트 길이(스트리밍 감지용)
  function mainTextLen() {
    const main =
      document.querySelector(
        'main, [role="main"], chat-window, .conversation-container, infinite-scroller',
      ) || document.body;
    return (main.innerText || "").length;
  }

  async function waitUntil(pred, { timeout = 600000, interval = 400 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!running) return false;
      try {
        if (pred()) return true;
      } catch (_) {}
      await sleep(interval);
    }
    return false;
  }

  // 전송 후: 생성이 시작되고(텍스트 증가/중지버튼) → 멈출 때까지 대기.
  // 버튼 탐지가 안 돼도 '텍스트가 STABLE_MS 동안 안 늘면 완료'로 판단.
  async function waitForResponseComplete() {
    const t0 = Date.now();
    let baseLen = mainTextLen();

    // Phase 1: 생성 시작 대기(최대 12초) — 텍스트 증가 또는 중지 버튼
    while (running && Date.now() - t0 < 12000) {
      await sleep(300);
      if (isGenerating() || mainTextLen() > baseLen + 2) break;
    }

    // Phase 2: 안정화 대기 — 변화가 STABLE_MS 동안 없으면 완료
    let lastLen = mainTextLen();
    let lastChange = Date.now();
    while (running && Date.now() - t0 < 600000) {
      await sleep(400);
      const len = mainTextLen();
      if (isGenerating() || len > lastLen + 2) {
        lastChange = Date.now();
      }
      if (len > lastLen) lastLen = len;
      if (!isGenerating() && Date.now() - lastChange > STABLE_MS) return true;
    }
    return true;
  }

  function setNativeValue(el, text) {
    const proto =
      el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function typeIntoEditor(editor, text) {
    editor.focus();
    try {
      editor.click();
    } catch (_) {}
    await sleep(60);
    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      setNativeValue(editor, text);
      if (editorText(editor).includes(text)) return "native-value";
    }
    try {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    } catch (_) {}
    if (editorText(editor).includes(text)) return "execCommand";
    try {
      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "insertText",
          data: text,
          bubbles: true,
          cancelable: true,
        }),
      );
      editor.dispatchEvent(
        new InputEvent("input", { inputType: "insertText", data: text, bubbles: true }),
      );
    } catch (_) {}
    if (editorText(editor).includes(text)) return "inputEvent";
    try {
      editor.innerHTML = "";
      const p = document.createElement("p");
      p.textContent = text;
      editor.appendChild(p);
      editor.dispatchEvent(new InputEvent("input", { inputType: "insertText", bubbles: true }));
    } catch (_) {}
    if (editorText(editor).includes(text)) return "dom-inject";
    return null;
  }

  function pressEnter(el) {
    ["keydown", "keypress", "keyup"].forEach((type) =>
      el.dispatchEvent(
        new KeyboardEvent(type, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  }

  async function sendMessageText(text) {
    const editor = getEditor();
    if (!editor) {
      log("❌ 입력창을 찾지 못함");
      setStatus("입력창 못 찾음");
      return false;
    }
    const method = await typeIntoEditor(editor, text);
    if (!method) {
      log("❌ 입력 실패(모든 방식)");
      setStatus("입력 실패");
      return false;
    }
    log("✅ 입력 성공:", method);
    await sleep(350);
    let btn = null;
    for (let t = 0; t < 12; t++) {
      btn = getSendButton();
      const disabled =
        btn && (btn.disabled || btn.getAttribute("aria-disabled") === "true");
      if (btn && !disabled) break;
      await sleep(200);
    }
    if (btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") {
      btn.click();
      log("전송(버튼)");
    } else {
      pressEnter(editor);
      log("전송(Enter 폴백)");
    }
    return true;
  }

  async function run(count) {
    running = true;
    showBadge();
    log(`시작: ${count}회`);
    for (let i = 0; i < count; i++) {
      if (!running) break;
      // 지금 생성 중이면(=이전 응답 진행 중) 먼저 끝날 때까지 대기
      if (isGenerating()) {
        setStatus(`이전 응답 대기 ${i}/${count}`);
        await waitForResponseComplete();
      }
      if (!running) break;
      await sleep(500);
      setStatus(`전송 ${i + 1}/${count}`);
      const ok = await sendMessageText(MESSAGE_TEXT);
      if (!ok) break;
      // 이번 응답이 끝날 때까지(콘텐츠 안정화) 대기 → 끝나면 즉시 다음 루프
      setStatus(`응답 대기 ${i + 1}/${count}`);
      await waitForResponseComplete();
    }
    const wasRunning = running;
    running = false;
    setStatus(wasRunning ? "완료 ✅" : "중지됨");
    log(wasRunning ? "완료" : "중지");
    await sleep(2500);
    hideBadge();
  }

  function stop() {
    running = false;
    setStatus("중지됨");
  }

  function showBadge() {
    if (badge) return;
    badge = document.createElement("div");
    badge.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "background:#1b1b1f",
      "color:#e7e7ea",
      "border:1px solid #3a3a42",
      "border-radius:10px",
      "padding:8px 12px",
      "font:600 12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "box-shadow:0 6px 24px rgba(0,0,0,.4)",
      "display:flex",
      "align-items:center",
      "gap:10px",
    ].join(";");
    badgeText = document.createElement("span");
    badgeText.textContent = "자동 진행 준비…";
    const stopBtn = document.createElement("button");
    stopBtn.textContent = "중지";
    stopBtn.style.cssText =
      "background:#4f8cff;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer";
    stopBtn.addEventListener("click", stop);
    badge.appendChild(badgeText);
    badge.appendChild(stopBtn);
    document.body.appendChild(badge);
  }
  function hideBadge() {
    if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    badge = null;
    badgeText = null;
  }
  function setStatus(t) {
    if (badgeText) badgeText.textContent = "자동 진행 · " + t;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "START") {
      if (running) {
        sendResponse({ ok: false, error: "이미 실행 중입니다" });
        return true;
      }
      run(Math.max(1, msg.count | 0));
      sendResponse({ ok: true });
    } else if (msg.type === "STOP") {
      stop();
      sendResponse({ ok: true });
    } else if (msg.type === "STATUS") {
      sendResponse({ running });
    }
    return true;
  });

  log("로드됨 v1.3");
})();
