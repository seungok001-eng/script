// ─────────────────────────────────────────────────────────────
// Gemini 자동 다음 단계 — content script (gemini.google.com, Gems 포함)
//   응답이 끝날 때(생성 중지)마다 입력창에 "다음 단계 진행해"를 넣고 전송.
//   지정한 횟수만큼 반복 후 종료.
//
// 주의: Gemini의 DOM 구조가 바뀌면 셀렉터를 조정해야 할 수 있습니다.
// ─────────────────────────────────────────────────────────────
(function () {
  if (window.__geminiAutoNextLoaded) return;
  window.__geminiAutoNextLoaded = true;

  const MESSAGE_TEXT = "다음 단계 진행해";
  let running = false;
  let badge = null;
  let badgeText = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const qa = (sel) => Array.from(document.querySelectorAll(sel));

  const isVisible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // 입력창 — Gemini는 Quill(.ql-editor) contenteditable. 폴백으로 일반 입력도 탐색.
  function getEditor() {
    const ql = qa('div.ql-editor[contenteditable="true"]').filter(isVisible);
    if (ql.length) return ql[ql.length - 1];
    const eds = qa(
      'div[contenteditable="true"], textarea, div[role="textbox"]',
    ).filter(isVisible);
    return eds[eds.length - 1] || null;
  }

  function findButtonByLabel(keywords) {
    return (
      qa("button").find((b) => {
        const al = (
          b.getAttribute("aria-label") ||
          b.getAttribute("mattooltip") ||
          ""
        ).toLowerCase();
        return keywords.some((k) => al.includes(k));
      }) || null
    );
  }

  // 생성 중이면 '중지(Stop)' 버튼이 존재한다.
  function getStopButton() {
    return findButtonByLabel(["stop", "중지", "중단"]);
  }
  function getSendButton() {
    return findButtonByLabel(["send", "보내기", "전송", "submit"]);
  }
  function isGenerating() {
    return !!getStopButton();
  }

  async function waitUntil(pred, { timeout = 600000, interval = 500 } = {}) {
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

  function insertText(editor, text) {
    editor.focus();
    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      const proto =
        editor.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(editor, text);
      else editor.value = text;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    // contenteditable
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch (_) {
      ok = false;
    }
    if (!ok) {
      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "insertText",
          data: text,
          bubbles: true,
          cancelable: true,
        }),
      );
      editor.textContent = text;
      editor.dispatchEvent(
        new InputEvent("input", { inputType: "insertText", data: text, bubbles: true }),
      );
    }
  }

  async function sendMessageText(text) {
    const editor = getEditor();
    if (!editor) {
      setStatus("입력창을 찾지 못했습니다");
      return false;
    }
    insertText(editor, text);
    await sleep(400);
    const btn = getSendButton();
    if (btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") {
      btn.click();
      return true;
    }
    // 폴백: Enter 키
    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
      }),
    );
    return true;
  }

  async function run(count) {
    running = true;
    showBadge();
    for (let i = 0; i < count; i++) {
      if (!running) break;
      setStatus(`대기 중 ${i}/${count}`);
      const idle = await waitUntil(() => !isGenerating());
      if (!running) break;
      if (!idle) {
        setStatus("타임아웃 — 종료");
        break;
      }
      await sleep(900);
      if (!running) break;
      setStatus(`전송 ${i + 1}/${count}`);
      await sendMessageText(MESSAGE_TEXT);
      await waitUntil(() => isGenerating(), { timeout: 9000, interval: 250 });
      await waitUntil(() => !isGenerating());
    }
    const wasRunning = running;
    running = false;
    setStatus(wasRunning ? "완료 ✅" : "중지됨");
    await sleep(2500);
    hideBadge();
  }

  function stop() {
    running = false;
    setStatus("중지됨");
  }

  // ── 화면 우하단 상태 배지 ───────────────────────────────
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
})();
