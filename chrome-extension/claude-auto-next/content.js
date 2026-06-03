// ─────────────────────────────────────────────────────────────
// Claude 자동 다음 단계 — content script (claude.ai)
//   응답이 끝날 때(생성 중지)마다 입력창에 "다음 단계 진행해"를 넣고 전송.
//   지정한 횟수만큼 반복 후 종료.
//
// 주의: claude.ai의 DOM 구조가 바뀌면 셀렉터를 조정해야 할 수 있습니다.
// ─────────────────────────────────────────────────────────────
(function () {
  if (window.__claudeAutoNextLoaded) return;
  window.__claudeAutoNextLoaded = true;

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

  // 입력창(ProseMirror contenteditable) — 보이는 것 중 마지막(하단 작성창)
  function getEditor() {
    const eds = qa('div[contenteditable="true"]').filter(isVisible);
    return eds[eds.length - 1] || null;
  }

  function findButtonByLabel(keywords) {
    return (
      qa("button").find((b) => {
        const al = (b.getAttribute("aria-label") || "").toLowerCase();
        return keywords.some((k) => al.includes(k));
      }) || null
    );
  }

  // 생성 중이면 '중지(Stop)' 버튼이 존재한다.
  function getStopButton() {
    return findButtonByLabel(["stop", "중지", "중단"]);
  }
  function getSendButton() {
    return findButtonByLabel(["send", "보내기", "전송"]);
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
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch (_) {
      ok = false;
    }
    if (!ok) {
      // 폴백: beforeinput/input 이벤트 + textContent
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
    await sleep(350);
    const btn = getSendButton();
    if (btn && !btn.disabled) {
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
      // 1) 현재 생성이 끝날 때까지(유휴 상태) 대기
      const idle = await waitUntil(() => !isGenerating());
      if (!running) break;
      if (!idle) {
        setStatus("타임아웃 — 종료");
        break;
      }
      await sleep(800); // 살짝 안정화
      if (!running) break;
      // 2) 전송
      setStatus(`전송 ${i + 1}/${count}`);
      await sendMessageText(MESSAGE_TEXT);
      // 3) 생성이 시작될 때까지 잠깐(없어도 통과)
      await waitUntil(() => isGenerating(), { timeout: 8000, interval: 250 });
      // 4) 생성이 끝날 때까지 대기
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
      "background:#c96442;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer";
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
