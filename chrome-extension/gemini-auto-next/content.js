// ─────────────────────────────────────────────────────────────
// Gemini 자동 다음 단계 — content script (gemini.google.com, Gems 포함)
//   응답이 끝날 때마다 입력창에 "다음 단계 진행해"를 넣고 전송, 지정 횟수 반복.
//
// v1.2 — 입력 실패 대응: 여러 입력 방식을 순차 시도+검증, 대기 무한루프 방지,
//        콘솔 진단 로그([Gemini자동]) 강화.
// ─────────────────────────────────────────────────────────────
(function () {
  if (window.__geminiAutoNextLoaded) {
    // 이전 버전이 로드돼 있어도 최신 로직으로 갱신되도록 플래그만 유지
  }
  window.__geminiAutoNextLoaded = true;

  const MESSAGE_TEXT = "다음 단계 진행해";
  const TAG = "[Gemini자동]";
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

  // 입력창 후보: Quill(.ql-editor) → 일반 contenteditable/textarea
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

  // 여러 방식을 순차 시도하고 실제 입력됐는지 검증
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

    // 1) execCommand insertText (기존 내용 비우고)
    try {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    } catch (_) {}
    if (editorText(editor).includes(text)) return "execCommand";

    // 2) beforeinput/input 이벤트
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

    // 3) 직접 DOM 삽입(Quill 대비: p > text)
    try {
      editor.innerHTML = "";
      const p = document.createElement("p");
      p.textContent = text;
      editor.appendChild(p);
      editor.dispatchEvent(new InputEvent("input", { inputType: "insertText", bubbles: true }));
    } catch (_) {}
    if (editorText(editor).includes(text)) return "dom-inject";

    return null; // 실패
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
      log("❌ 입력창(에디터)을 찾지 못함");
      setStatus("입력창 못 찾음");
      return false;
    }
    log("에디터:", editor.tagName, editor.className || "");
    const method = await typeIntoEditor(editor, text);
    if (!method) {
      log("❌ 입력 실패(모든 방식). 에디터 구조가 바뀐 듯합니다.");
      setStatus("입력 실패");
      return false;
    }
    log("✅ 입력 성공:", method);
    await sleep(400);

    // 전송 버튼 활성화 대기(최대 3초)
    let btn = null;
    for (let t = 0; t < 12; t++) {
      btn = getSendButton();
      const disabled =
        btn && (btn.disabled || btn.getAttribute("aria-disabled") === "true");
      if (btn && !disabled) break;
      await sleep(250);
    }
    if (btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") {
      log("전송 버튼 클릭:", btn.getAttribute("aria-label") || btn.className);
      btn.click();
      return true;
    }
    log("전송 버튼 못 찾음 → Enter 폴백");
    pressEnter(editor);
    return true;
  }

  async function run(count) {
    running = true;
    showBadge();
    log(`시작: ${count}회`);
    for (let i = 0; i < count; i++) {
      if (!running) break;
      setStatus(`대기 중 ${i}/${count}`);
      // 유휴 대기(최대 20초). 완료 감지가 깨져도 무한 대기하지 않고 진행.
      await waitUntil(() => !isGenerating(), { timeout: 20000 });
      if (!running) break;
      await sleep(800);
      if (!running) break;
      setStatus(`전송 ${i + 1}/${count}`);
      const ok = await sendMessageText(MESSAGE_TEXT);
      if (!ok) {
        // 입력 자체가 안 되면 반복해도 소용없으니 중단
        break;
      }
      const started = await waitUntil(() => isGenerating(), {
        timeout: 12000,
        interval: 250,
      });
      if (started) {
        log("생성 시작 감지 → 종료까지 대기");
        await waitUntil(() => !isGenerating());
      } else {
        log("생성 시작 미감지 → 25초 고정 대기(폭주 방지)");
        setStatus("생성 감지 실패 · 25초 대기");
        for (let s = 0; s < 50 && running; s++) await sleep(500);
      }
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

  log("로드됨 v1.2");
})();
