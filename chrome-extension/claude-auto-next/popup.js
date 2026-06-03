const countEl = document.getElementById("count");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const msgEl = document.getElementById("msg");

function setMsg(t) {
  msgEl.textContent = t;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

startBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab || !tab.url || !tab.url.includes("claude.ai")) {
    setMsg("claude.ai 대화 탭에서 실행하세요.");
    return;
  }
  const count = Math.max(1, Math.min(50, parseInt(countEl.value, 10) || 1));
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "START", count });
    setMsg(res?.ok ? `시작했습니다 · ${count}회` : res?.error || "시작 실패");
  } catch (e) {
    setMsg("연결 실패 — claude.ai 페이지를 새로고침한 뒤 다시 시도하세요.");
  }
});

stopBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "STOP" });
    setMsg("중지했습니다.");
  } catch (e) {
    setMsg("중지할 작업이 없습니다.");
  }
});
