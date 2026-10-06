// 토익 사진 공방 화면 (교재 공방 화면을 고친 것). 서버(server.py)의 /api/* 를 부른다.
let P = null;            // 프리셋 (분류·유닛·캐릭터·목소리)
let ST = null;           // 마지막 /api/status
let view = 'photo';       // 왼쪽 분류: char tree word line cast scene video | sound | progress
let unit = 'all';        // 유닛 필터
let soundSub = 'sound';  // 소리 탭 안의 분류
let pasteTarget = null;  // Ctrl+V 로 그림을 넣을 항목 id
let genTarget = null;    // 후보 만들기 대상 소리 항목
let lastSig = '';

const $ = (id) => document.getElementById(id);
const api = async (url, opt = {}) => {
  const r = await fetch(url, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || r.status);
  return j;
};
const jsonOpt = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATUS_KO = { pending: '대기', queued: '자동 대기열', generating: '생성 중', review: '검수', approved: '승인', failed: '실패' };
const unitQ = () => (unit === 'all' ? '' : '&unit=' + unit);

function toast(msg, bad) {
  const t = $('toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.style.display = 'block';
  clearTimeout(t._h); t._h = setTimeout(() => (t.style.display = 'none'), bad ? 6000 : 2500);
}

// ---------- 왼쪽 분류 ----------
function renderNav() {
  const k = (ST && ST.kinds) || {};
  const cnt = (c) => (c ? `${c.approved}/${c.total}` : '');
  const rows = Object.entries(P.kinds).map(([key, name]) => ({ key, name, cnt: cnt(k[key]) }));
  rows.push({ key: 'progress', name: '진행·설정', cnt: '' });
  $('nav').innerHTML = rows.map((r) => `<div class="item ${view === r.key ? 'on' : ''}" onclick="setView('${r.key}')"><span>${r.name}</span><span class="cnt">${r.cnt}</span></div>`).join('');
}
function setView(v) { view = v; pasteTarget = null; renderNav(); renderView(); }
function setUnit(u) { unit = u; renderView(); }

// ---------- 위쪽 막대 ----------
function renderTop() {
  if (!ST) return;
  $('extDot').className = 'dot' + (ST.ext_alive ? ' on' : '');
  $('extText').textContent = ST.ext_alive ? '확장: 연결됨' : '확장: 연결 안 됨';
  if (document.activeElement !== $('genSel')) $('genSel').value = ST.generator || 'flow';
  $('unattended').checked = !!ST.auto_approve_ref;
  const g = ST.gemini || {}, t = ST.tts || {};
  $('usage').textContent = `제미나이 그림 ${g.usage ? g.usage.count : 0}장 $${g.usage ? (g.usage.cost || 0).toFixed(2) : '0'} · TTS ${t.usage ? t.usage.count : 0}건 ${t.usage ? t.usage.tokens : 0}토큰${t.queue || t.busy ? ` (대기 ${t.queue} · 처리 중 ${t.busy})` : ''}${ST.generating.length ? ` · 그림 생성 중 ${ST.generating.length}` : ''}`;
}
async function saveGen(v) { try { await api('/api/settings', jsonOpt('PUT', { generator: v })); toast('기본 생성기: ' + (v === 'gemini' ? '제미나이' : '플로우')); } catch (e) { toast(e.message, true); } }
async function saveUnattended(on) { try { await api('/api/settings', jsonOpt('PUT', { auto_approve_ref: on })); toast(on ? '무인 모드: 기준 그림을 나오는 대로 자동 승인합니다' : '무인 모드 끔'); } catch (e) { toast(e.message, true); } }
async function autoAll(on) {
  const kind = ['sound', 'progress'].includes(view) ? '' : view;
  if (view === 'sound') return generateAllSounds();
  if (on && !confirm(`${kind ? P.kinds[kind] : '전체'}${unit !== 'all' ? ` · ${unit}묶음` : ''}의 아직 그림 없는 항목을 전부 자동 대기열에 넣을까요? (생성 비용이 듭니다)`)) return;
  try { const r = await api('/api/auto_all', jsonOpt('POST', { on, kind, unit })); toast(`${r.count}개 항목을 ${on ? '자동 대기열에 넣었습니다' : '대기열에서 뺐습니다'}`); refresh(true); }
  catch (e) { toast(e.message, true); }
}
async function applyAll() {
  try { const r = await api('/api/apply_all', { method: 'POST' }); toast(`승인된 ${r.count}개를 앱(app/images/p1)에 넣었습니다`); refresh(true); }
  catch (e) { toast(e.message, true); }
}
async function openLog() { const st = await api('/api/status'); $('logBody').textContent = st.log.join('\n') || '(기록 없음)'; $('logModal').classList.add('on'); }

// ---------- 그림 항목 ----------
async function renderView() {
  if (view === 'sound') return renderSounds();
  if (view === 'progress') return renderProgress();
  const items = await api(`/api/items?kind=${view}${unitQ()}`);
  const c = { total: items.length, approved: items.filter((i) => i.status === 'approved').length, review: items.filter((i) => i.status === 'review').length,
    q: items.filter((i) => i.status === 'queued' || i.status === 'generating').length, failed: items.filter((i) => i.status === 'failed').length };
  let notice = '';
  if (view === 'photo') notice = `<div class="notice"><b>검수 기준:</b> 카드의 <b>✔ 반드시 보여야 할 것</b>이 모두 보이고 <b>✘ 보이면 안 되는 것</b>이 하나도 없어야 승인하세요. 정답 문장(초록)이 사진에서 분명히 참이고 나머지 세 문장이 분명히 거짓이어야 합니다. 글자·로고가 읽히거나 손가락·얼굴이 이상하면 <b>버리기</b> 후 다시 생성. 승인한 사진은 <b>앱에 넣기</b>를 누르면 app/images/p1 에 960×720 WebP 로 들어갑니다.</div>`;
  if (view === 'char') notice = `<div class="notice"><b>순서:</b> 캐릭터마다 <b>기준 그림(ref)</b>을 먼저 만들고 보고 승인하세요. 승인해야 그 캐릭터의 나머지 자세(참조로 붙여서)가 만들어집니다. 기준 그림 4장이 모두 승인되면 <b>캐스트 시트</b>가 자동으로 합성되고, 그 다음 스토리 장면을 만들 수 있습니다. 무인 모드를 켜면 기준 그림을 자동 승인합니다 (나중에 꼭 확인).</div>`;
  if (view === 'tree') notice = `<div class="notice">첫 나무(tree_a)가 기준입니다. 승인하면 나머지 나무가 같은 양식으로(참조) 만들어집니다. 나무 간판은 비워 두고 글자는 웹 교재가 덧씌웁니다.</div>`;
  if (view === 'line') notice = `<div class="notice">선 그림은 승인된 <b>단어 그림</b>을 참조로 붙여 만듭니다 (단어 그림이 승인돼야 대기열에서 나갑니다). 뒤처리: 검은 선만 남기고 나머지는 투명.</div>`;
  if (view === 'cast') notice = `<div class="notice">캐스트 시트는 생성하지 않고 서버가 승인된 캐릭터 기준 그림 4장을 흰 바탕에 나란히 합성합니다. 스토리 장면의 참조로 쓰입니다. 직접 만든 시트를 끌어다 넣어도 됩니다.</div>`;
  if (view === 'scene') notice = `<div class="notice">장면은 캐스트 시트를 참조로 붙여 만듭니다. 뒤처리: 배경 그대로, 4:3 가운데 자르기 1600×1200 JPEG.</div>`;
  if (view === 'video') notice = `<div class="notice">영상은 <b>플로우(확장)로만</b> 만듭니다 (제미나이 API 는 영상을 못 만듭니다). 승인된 장면 그림을 붙여 "이미지 → 동영상"으로 보냅니다. 비율(4:3)·길이(8초)는 플로우의 전역 설정이라 배치 시작 전에 플로우 화면에서 한 번 맞춰 두세요. 결과 mp4 는 그대로 web/assets/video/ 에 들어갑니다.</div>`;
  $('view').innerHTML = `${notice}
    <div class="toolbar"><b>${P.kinds[view]}</b><span class="hint">승인 ${c.approved} · 검수 ${c.review} · 대기열 ${c.q} · 실패 ${c.failed} / 전체 ${c.total}</span>
      ${view !== 'cast' ? `<button onclick="autoAll(true)">그림 없는 것 자동 생성</button><button onclick="autoAll(false)">대기열 비우기</button>` : `<button onclick="castSheet()">캐스트 시트 다시 합성</button>`}
      ${c.review ? `<button class="ok" onclick="approveAllReview()">검수 중 ${c.review}개 전부 승인</button>` : ''}
      ${view === 'char' ? `<button onclick="verify()">캐릭터 동일성 검사</button>` : ''}
      <a href="/api/sheet.png?kind=${view}${unitQ()}" target="_blank"><button>검수 격자 열기</button></a>
      <button onclick="openFolder('art')">저장 폴더</button><button onclick="openFolder('web')">앱 사진 폴더</button></div>
    <div class="grid">${items.map(card).join('') || '<p class="hint">항목이 없습니다 (묶음 필터를 확인하세요).</p>'}</div>`;
}

function card(it) {
  const isRef = it.kind === 'char' && it.pose === 'ref' || it.kind === 'tree' && !it.reference;
  const refNote = it.reference && !it.ref_ok ? `<span class="hint" style="color:var(--warn)">참조 ${esc(it.reference)} 승인 대기</span>` : it.reference ? `<span class="hint">참조 ${esc(it.reference)}</span>` : '';
  const media = it.cut_url ? (it.kind === 'video' ? `<div class="thumb" onclick="lightbox('${it.cut_url}','${esc(it.title)}',true)"><video src="${it.cut_url}" muted loop onmouseover="this.play()" onmouseout="this.pause()"></video></div>`
    : `<div class="thumb" onclick="lightbox('${it.cut_url}','${esc(it.title)}')"><img src="${it.cut_url}" loading="lazy"></div>`)
    : `<div class="thumb empty">${it.status === 'generating' ? '생성 중…' : it.status === 'queued' ? '대기열' : '그림 없음'}</div>`;
  const b = [];
  if (it.status === 'approved') b.push(`<button class="small bad" onclick="act('${it.id}','reject')">승인 취소</button>`);
  if (it.status === 'review') b.push(`<button class="small ok" onclick="act('${it.id}','approve')">승인</button>`, `<button class="small" onclick="act('${it.id}','reset')">버리기</button>`);
  if ((it.status === 'pending' || it.status === 'failed') && it.kind !== 'cast') b.push(`<button class="small primary" onclick="act('${it.id}','queue')">자동 생성</button>`);
  if (it.status === 'queued' || it.status === 'generating') b.push(`<button class="small" onclick="act('${it.id}','dequeue')">자동 취소</button>`);
  if (it.raw && it.kind !== 'cast') b.push(`<button class="small" onclick="reprocess('${it.id}')">다시 처리</button>`);
  if (it.status === 'approved' && it.cut) b.push(`<button class="small ok" onclick="applyOne('${it.id}')">앱에 넣기</button>`);
  if (it.status === 'approved' && it.kind !== 'cast') b.push(`<button class="small" onclick="act('${it.id}','reset')">버리기</button>`);
  const gen = it.kind === 'video' || it.kind === 'cast' ? '' : `<select class="small" onchange="setGen('${it.id}', this.value)" title="이 항목의 생성기"><option value="" ${!it.gen ? 'selected' : ''}>기본</option><option value="flow" ${it.gen === 'flow' ? 'selected' : ''}>플로우</option><option value="gemini" ${it.gen === 'gemini' ? 'selected' : ''}>제미나이</option></select>`;
  return `<div class="card ${isRef ? 'ref' : ''}" id="card_${it.id}">
    <h3>${esc(it.title)} <span class="chip ${it.status}">${STATUS_KO[it.status] || it.status}</span>
      ${isRef ? '<span class="chip" style="background:#cfe0f3">기준 그림</span>' : ''}${it.auto_approved ? '<span class="chip auto" title="자동 승인됨. 확인해 주세요">자동 승인</span>' : ''}
      ${it.applied ? `<span class="chip applied" title="${esc(it.applied)}">앱에 넣음</span>` : ''}${it.attempts ? `<span class="hint">시도 ${it.attempts}</span>` : ''}</h3>
    <div class="hint" style="margin-bottom:4px"><code>${it.id}</code> ${it.unit != null ? `${it.unit}묶음 · ` : ''}${it.aspect} · ${it.effective_gen === 'gemini' ? '제미나이' : '플로우'} ${refNote}</div>
    ${media}
    ${it.error ? `<div class="err">${esc(it.error)}</div>` : ''}
    ${it.kind === 'photo' ? photoCheck(it) : ''}
    <div class="row" style="margin:6px 0">${b.join('')}${gen}</div>
    <div class="row" style="align-items:center">
      <div class="drop ${pasteTarget === it.id ? 'on' : ''}" ondragover="event.preventDefault(); this.classList.add('on')" ondragleave="this.classList.remove('on')" ondrop="dropImage(event,'${it.id}')" onclick="pickImage('${it.id}')">${it.kind === 'video' ? 'mp4' : '그림'} 끌어다 놓기 · 클릭 후 Ctrl+V</div>
      ${it.raw_url && it.kind !== 'video' ? `<img class="rawimg" src="${it.raw_url}" title="원본" onclick="lightbox('${it.raw_url}','${esc(it.title)} · 원본')">` : ''}
    </div>
    <details><summary>프롬프트${it.prompt_edited ? ' (고침)' : ''}</summary>
      <textarea id="pr_${it.id}" style="font-size:12px" onchange="savePrompt('${it.id}')">${esc(it.prompt)}</textarea>
      <div class="row" style="margin-top:4px"><button class="small" onclick="copyPrompt('${it.id}')">복사</button><span class="hint">고치면 저장되고, content 를 다시 읽어도 유지됩니다.</span></div>
    </details>
  </div>`;
}

function photoCheck(it) {
  const L = 'ABCD';
  return `<div class="pcheck">${it.scene ? `<div class="hint" style="margin-bottom:4px">${esc(it.scene)}</div>` : ''}
    <div class="must">${(it.must || []).map((x) => `<div>✔ ${esc(x)}</div>`).join('')}</div>
    <div class="mustnot">${(it.must_not || []).map((x) => `<div>✘ ${esc(x)}</div>`).join('')}</div>
    <div class="opts">${(it.o || []).map((x, i) => `<div class="${i === it.a ? 'ans' : ''}">(${L[i]}) ${esc(String(x).replace(/^\([A-D]\)\s*/, ''))}${i === it.a ? ' ← 정답' : ''}</div>`).join('')}</div></div>`;
}

async function act(id, action) { try { await api(`/api/items/${id}/action`, jsonOpt('POST', { action })); refresh(true); } catch (e) { toast(e.message, true); } }
async function reprocess(id) { try { toast('처리 중…'); await api(`/api/items/${id}/reprocess`, { method: 'POST' }); refresh(true); } catch (e) { toast(e.message, true); } }
async function applyOne(id) { try { const r = await api(`/api/items/${id}/apply`, { method: 'POST' }); toast('앱에 넣었습니다: ' + r.dst); refresh(true); } catch (e) { toast(e.message, true); } }
async function setGen(id, v) { try { await api(`/api/items/${id}`, jsonOpt('PUT', { gen: v })); toast(v ? '이 항목은 ' + (v === 'gemini' ? '제미나이' : '플로우') + '로' : '기본 생성기로'); } catch (e) { toast(e.message, true); } }
async function savePrompt(id) { try { await api(`/api/items/${id}`, jsonOpt('PUT', { prompt: $('pr_' + id).value })); toast('프롬프트 저장'); } catch (e) { toast(e.message, true); } }
function copyPrompt(id) { const t = $('pr_' + id).value; navigator.clipboard.writeText(t).then(() => toast('프롬프트를 복사했습니다'), () => { $('pr_' + id).select(); document.execCommand('copy'); toast('복사했습니다'); }); }
async function castSheet() { try { await api('/api/cast_sheet', { method: 'POST' }); toast('캐스트 시트를 합성했습니다'); refresh(true); } catch (e) { toast(e.message, true); } }
async function verify() { try { const r = await api('/api/verify', jsonOpt('POST', { fix: true })); toast(r.flagged.length ? `${r.flagged.length}장이 다른 캐릭터로 나와 다시 대기열에 넣었습니다` : '모두 자기 캐릭터와 닮았습니다'); refresh(true); } catch (e) { toast(e.message, true); } }
async function approveAllReview() {
  const items = await api(`/api/items?kind=${view}${unitQ()}`);
  for (const it of items) if (it.status === 'review') await api(`/api/items/${it.id}/action`, jsonOpt('POST', { action: 'approve' })).catch(() => {});
  refresh(true);
}
async function openFolder(which) { try { await api('/api/open', jsonOpt('POST', { which })); } catch (e) { toast(e.message, true); } }

async function upload(id, blob) {
  try {
    toast('처리 중…');
    await api(`/api/items/${id}/image`, { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
    toast('넣었습니다. 확인하고 승인하세요.'); refresh(true);
  } catch (e) { toast('실패: ' + e.message, true); }
}
function dropImage(ev, id) {
  ev.preventDefault(); ev.currentTarget.classList.remove('on');
  const f = [...ev.dataTransfer.files].find((x) => x.type.startsWith('image/') || x.type.startsWith('video/'));
  if (f) upload(id, f); else toast('그림/영상 파일이 아닙니다', true);
}
function pickImage(id) {
  pasteTarget = id;
  document.querySelectorAll('.drop').forEach((d) => d.classList.remove('on'));
  const el = $('card_' + id)?.querySelector('.drop'); if (el) el.classList.add('on');
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,video/mp4';
  inp.onchange = () => { if (inp.files[0]) upload(id, inp.files[0]); };
  inp.click();
}
document.addEventListener('paste', (ev) => {
  if (!pasteTarget) return;
  const item = [...(ev.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) { ev.preventDefault(); upload(pasteTarget, item.getAsFile()); }
});

// ---------- 소리 ----------
async function renderSounds() {
  const sounds = await api(`/api/sounds?sub=${soundSub}${unitQ()}`);
  const tabs = Object.entries(P.sound_subs).map(([k, n]) => `<button class="${soundSub === k ? 'on' : ''}" onclick="soundSub='${k}'; renderSounds()">${n}</button>`).join('');
  const n = { cand: sounds.filter((s) => s.cands.length).length, ok: sounds.filter((s) => s.final).length };
  $('view').innerHTML = `
    <div class="notice">소리는 제미나이 TTS 로 <b>후보 여러 개</b>(대본 변형 × 목소리)를 만들고, 들어 보고 하나를 <b>승인</b>하면 ffmpeg 가 앞뒤 무음 제거·음량 맞춤(-16 LUFS)·mp3 로 만듭니다. 후보마다 자동 검사(무엇을 말했는지)가 작게 표시됩니다 — 빨간 글씨는 대본과 다르거나 덧붙는 모음이 있는 것. 직접 녹음한 wav/mp3 를 끌어다 넣어도 후보가 됩니다.</div>
    <div class="toolbar"><div class="tabs">${tabs}</div><span class="hint">후보 있음 ${n.cand} · 승인 ${n.ok} / ${sounds.length}</span>
      <button class="primary" onclick="generateAllSounds()">후보 없는 것 전부 만들기</button>
      <button onclick="openFolder('audio')">저장 폴더</button></div>
    <div class="grid">${sounds.map(soundCard).join('') || '<p class="hint">항목이 없습니다.</p>'}</div>`;
}
function soundCard(s) {
  const voiceSel = `<select onchange="saveSound('${s.id}', {voice: this.value})" title="기본 목소리">${P.voices.map((v) => `<option value="${v.key}" ${v.key === s.voice ? 'selected' : ''}>${v.key} (${v.name})</option>`).join('')}</select>`;
  const cands = s.cands.map((c) => `<div class="cand ${s.approved === c.n ? 'ap' : ''}">
      <audio controls preload="none" src="/audio/${s.id}/${c.file}?v=${Math.round(c.created)}"></audio>
      <span><b>${c.n}</b> ${esc(c.text)}${c.voice ? ' · ' + esc(c.voice) : ''}${c.how === 'cut' ? ' · 잘라냄' : c.how === 'upload' ? ' · 직접' : ''} <span class="hint">${c.sec}s</span></span>
      <span class="ck ${c.warn ? 'warn' : ''}" title="${esc(c.check ? c.check.raw : '')}">${c.check ? `들림: "${esc(c.check.transcript)}"${c.check.ipa ? ' ' + esc(c.check.ipa) : ''}${c.check.note && c.check.note !== 'ok' ? ' · ' + esc(c.check.note) : ''}` : '검사 중…'}</span>
      ${s.approved === c.n ? '<span class="chip approved">승인됨</span>' : `<button class="small ok" onclick="approveSound('${s.id}', ${c.n})">승인</button>`}
      <button class="small" onclick="delCand('${s.id}', ${c.n})">지우기</button></div>`).join('');
  return `<div class="card" id="scard_${s.id}">
    <h3>${esc(s.title)} ${s.final ? '<span class="chip approved">승인</span>' : s.cands.length ? `<span class="chip review">후보 ${s.cands.length}</span>` : '<span class="chip pending">없음</span>'}
      ${s.busy ? `<span class="chip generating">처리 중 ${s.busy}</span>` : ''}${s.applied ? '<span class="chip applied">교재에 넣음</span>' : ''}</h3>
    <div class="hint"><code>${s.id}</code> ${s.unit != null ? `${s.unit}유닛 · ` : ''}${s.hint ? esc(s.hint) : ''}</div>
    <div class="row" style="margin:6px 0"><input value="${esc(s.text)}" style="flex:1" onchange="saveSound('${s.id}', {text: this.value})" title="대본 (고치면 저장)">${voiceSel}</div>
    ${s.sub === 'sound' ? `<div class="hint">기본 후보: ${s.variants.map((v) => `<code>${esc(v)}</code>`).join(' ')} + 단어 앞부분 잘라내기</div>` : `<div class="hint">보내는 대본: <code>${esc(s.script)}</code></div>`}
    ${s.error ? `<div class="err">${esc(s.error)}</div>` : ''}
    <div class="row" style="margin:6px 0">
      <button class="small primary" onclick="openGen('${s.id}')">후보 만들기…</button>
      <button class="small" onclick="quickGen('${s.id}')">기본 후보 바로 만들기</button>
      ${s.sub === 'sound' ? `<button class="small" onclick="cutCand('${s.id}')">잘라내기 후보</button>` : ''}
      ${s.cands.length ? `<button class="small" onclick="recheck('${s.id}')">다시 검사</button>` : ''}
      ${s.final ? `<button class="small ok" onclick="applySound('${s.id}')">교재에 넣기</button><button class="small bad" onclick="unapproveSound('${s.id}')">승인 취소</button>` : ''}
      <div class="drop" style="flex:0 1 160px; padding:4px" ondragover="event.preventDefault(); this.classList.add('on')" ondragleave="this.classList.remove('on')" ondrop="dropAudio(event,'${s.id}')" onclick="pickAudio('${s.id}')">녹음 파일 넣기 (wav/mp3)</div>
    </div>
    ${s.final ? `<div class="cand ap"><b>완성</b> <audio controls preload="none" src="${s.final_url}"></audio> <span class="hint">final.mp3 (무음 제거·음량 맞춤)</span></div>` : ''}
    ${cands}
  </div>`;
}
async function saveSound(id, body) { try { await api(`/api/sounds/${id}`, jsonOpt('PUT', body)); toast('저장'); refreshSoundCard(id); } catch (e) { toast(e.message, true); } }
async function refreshSoundCard(id) {
  const s = await api(`/api/sounds/${id}`); const el = $('scard_' + id);
  if (el) { const tmp = document.createElement('div'); tmp.innerHTML = soundCard(s); el.replaceWith(tmp.firstElementChild); }
}
async function openGen(id) {
  const s = await api(`/api/sounds/${id}`); genTarget = s;
  $('genTitle').textContent = '후보 만들기 · ' + s.title;
  $('genHint').textContent = s.sub === 'sound' ? '낱소리: "/IPA/" 가 가장 깨끗했고(덧붙는 모음 없음), "b" 는 buh, "a" 는 글자 이름이 나옵니다. 늘일 수 있는 소리는 "mmm" 도 좋습니다.' : s.sub === 'name' ? '글자 이름: 대문자 한 글자만 보내면 이름으로 읽습니다.' : '단어·문장: 서버가 "Say slowly and clearly: " 를 앞에 붙여 보냅니다 (설정에서 바꿀 수 있음). 긴 지시문은 읽어 버리니 넣지 마세요.';
  $('genTexts').value = s.variants.join('\n');
  $('genVoices').innerHTML = P.voices.map((v) => `<label style="margin:0"><input type="checkbox" class="gv" value="${v.key}" ${v.key === s.voice ? 'checked' : ''}> ${v.key} <span class="hint">${v.name}</span></label>`).join('');
  $('genCutRow').style.display = s.sub === 'sound' ? '' : 'none'; $('genCut').checked = s.sub === 'sound';
  $('genModal').classList.add('on');
}
async function submitGen() {
  const texts = $('genTexts').value.split('\n').map((t) => t.trim()).filter(Boolean);
  const voices = [...document.querySelectorAll('.gv')].filter((c) => c.checked).map((c) => c.value);
  if (!texts.length || !voices.length) return toast('대본과 목소리를 하나 이상', true);
  try { const r = await api(`/api/sounds/${genTarget.id}/generate`, jsonOpt('POST', { texts, voices, cut: $('genCut').checked })); $('genModal').classList.remove('on'); toast(`${r.queued}개 후보를 만듭니다`); refreshSoundCard(genTarget.id); }
  catch (e) { toast(e.message, true); }
}
async function quickGen(id) { try { const r = await api(`/api/sounds/${id}/generate`, jsonOpt('POST', {})); toast(`${r.queued}개 후보를 만듭니다`); refreshSoundCard(id); } catch (e) { toast(e.message, true); } }
async function cutCand(id) { try { await api(`/api/sounds/${id}/cut`, { method: 'POST' }); toast('잘라내기 후보를 만들었습니다'); refreshSoundCard(id); } catch (e) { toast(e.message, true); } }
async function recheck(id) { try { await api(`/api/sounds/${id}/recheck`, { method: 'POST' }); toast('다시 검사합니다'); refreshSoundCard(id); } catch (e) { toast(e.message, true); } }
async function approveSound(id, n) { try { toast('mp3 만드는 중…'); await api(`/api/sounds/${id}/approve`, jsonOpt('POST', { n })); toast('승인했습니다 (final.mp3)'); refreshSoundCard(id); } catch (e) { toast(e.message, true); } }
async function unapproveSound(id) { try { await api(`/api/sounds/${id}/unapprove`, { method: 'POST' }); refreshSoundCard(id); } catch (e) { toast(e.message, true); } }
async function delCand(id, n) { try { await api(`/api/sounds/${id}/cand/${n}`, { method: 'DELETE' }); refreshSoundCard(id); } catch (e) { toast(e.message, true); } }
async function applySound(id) { try { const r = await api(`/api/sounds/${id}/apply`, { method: 'POST' }); toast('앱에 넣었습니다: ' + r.dst); refreshSoundCard(id); } catch (e) { toast(e.message, true); } }
async function generateAllSounds() {
  if (!confirm(`${P.sound_subs[soundSub]}${unit !== 'all' ? ` · ${unit}유닛` : ''} 중 후보가 없는 항목 전부의 기본 후보를 만들까요? (TTS 비용이 듭니다)`)) return;
  try { const r = await api('/api/sounds/generate_all', jsonOpt('POST', { sub: soundSub, unit })); toast(`${r.queued}개 후보를 만듭니다`); refresh(true); } catch (e) { toast(e.message, true); }
}
async function uploadAudio(id, f) {
  try { toast('넣는 중…'); await api(`/api/sounds/${id}/upload`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Ext': (f.name.split('.').pop() || 'wav') }, body: f }); toast('후보로 넣었습니다'); refreshSoundCard(id); }
  catch (e) { toast('실패: ' + e.message, true); }
}
function dropAudio(ev, id) { ev.preventDefault(); ev.currentTarget.classList.remove('on'); const f = ev.dataTransfer.files[0]; if (f) uploadAudio(id, f); }
function pickAudio(id) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,.wav,.mp3,.m4a'; inp.onchange = () => { if (inp.files[0]) uploadAudio(id, inp.files[0]); }; inp.click(); }

// ---------- 진행·설정 ----------
async function renderProgress() {
  const [st, s] = await Promise.all([api('/api/status'), api('/api/settings')]);
  const k = st.kinds; const a = st.all;
  const row = (key, name, c) => `<tr><td>${name}</td><td><div class="bar"><div class="ok" style="width:${c.total ? c.approved / c.total * 100 : 0}%"></div><div class="rv" style="width:${c.total ? c.review / c.total * 100 : 0}%"></div><div class="q" style="width:${c.total ? c.queued / c.total * 100 : 0}%"></div></div></td>
    <td>${c.approved}/${c.total}</td><td class="hint">검수 ${c.review} · 대기열 ${c.queued}${c.failed ? ` · <span style="color:var(--bad)">실패 ${c.failed}</span>` : ''} · 교재 ${c.applied}</td></tr>`;
  const price = (m) => { const mm = P.gemini_models.find((x) => x.key === m); return mm ? Object.entries(mm.price).map(([k2, v]) => `${k2} $${v}`).join(' · ') : ''; };
  $('view').innerHTML = `
    <div class="stat">
      <div><b>${a.approved} / ${a.total}</b><span>그림 승인 (검수 ${a.review})</span></div>
      <div><b>${a.queued}</b><span>자동 대기열</span></div>
      <div><b>${st.generating.length}</b><span>지금 생성 중</span></div>
      <div><b>${a.failed}</b><span>실패</span></div>
      <div><b>${a.applied}</b><span>교재에 넣음</span></div>
      <div><b>${st.sounds.approved} / ${st.sounds.total}</b><span>소리 승인 (후보 있음 ${st.sounds.cand})</span></div>
      <div><b style="color:${st.ext_alive ? 'var(--ok)' : 'var(--bad)'}">${st.ext_alive ? '연결됨' : '끊김'}</b><span>확장 프로그램</span></div>
      <div><b>${st.gemini.usage.count}장 · $${(st.gemini.usage.cost || 0).toFixed(2)}</b><span>제미나이 그림 (추정)</span></div>
      <div><b>${st.tts.usage.count}건 · ${st.tts.usage.tokens}토큰</b><span>TTS (검사 ${st.tts.usage.checks || 0}회)</span></div>
    </div>
    ${st.gemini.last_error ? `<div class="err">제미나이 마지막 오류: ${esc(st.gemini.last_error)}</div>` : ''}${st.tts.last_error ? `<div class="err">TTS 마지막 오류: ${esc(st.tts.last_error)}</div>` : ''}
    <div class="card" style="margin-bottom:12px"><h3>분류별</h3><table class="prog">${Object.entries(P.kinds).map(([key, name]) => row(key, name, k[key])).join('')}</table>
      ${st.generating.length ? `<h3 style="margin-top:10px">지금 생성 중</h3>${st.generating.map((g) => `<div class="hint">${esc(g.title)} · ${g.gen} · ${g.elapsed}초</div>`).join('')}` : ''}</div>
    <div class="card" style="margin-bottom:12px"><h3>설정</h3>
      <div class="row">
        <div><label>기본 생성기</label><select id="sGen"><option value="flow" ${s.generator === 'flow' ? 'selected' : ''}>플로우 (확장)</option><option value="gemini" ${s.generator === 'gemini' ? 'selected' : ''}>제미나이 API</option></select></div>
        <div><label>확장에 한 번에 걸어 두는 잡 수</label><input id="sInflight" type="number" min="0" max="12" value="${s.max_inflight ?? 4}" style="width:70px"></div>
        <div><label>무인 모드</label><label style="margin:0"><input type="checkbox" id="sAuto" ${s.auto_approve_ref ? 'checked' : ''}> 기준 그림 자동 승인</label></div>
      </div>
      <h4>제미나이 API (그림·TTS 공통 키)</h4>
      <p class="hint">구글 AI 스튜디오(aistudio.google.com)에서 만든 API 키. <code>art-src/forge/secrets.json</code> 에만 저장되고 git 에는 안 올라갑니다. 처음 실행 때 게임 공방의 키가 있으면 자동으로 복사해 옵니다.</p>
      <div class="row"><input id="sKey" type="password" placeholder="API 키 (비우면 그대로)" style="flex:1"><span class="hint">${s.gemini_key_set ? '저장됨 ' + (s.gemini_key_hint || '') : '없음'}</span>
        <button class="small" onclick="testGemini()">그림 연결 시험 (512px 한 장)</button><button class="small" onclick="testTts()">TTS 시험 ("apple")</button></div>
      <div id="sTestOut" class="hint" style="margin:4px 0"></div>
      <div class="row">
        <div><label>그림 모델</label><select id="sGModel" onchange="$('sGPrice').textContent = '한 장당: ' + priceOf(this.value)">${P.gemini_models.map((m) => `<option value="${m.key}" ${m.key === s.gemini_model ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
        <div><label>그림 크기</label><select id="sGSize"><option ${s.gemini_size === '512px' ? 'selected' : ''}>512px</option><option ${s.gemini_size === '1K' ? 'selected' : ''}>1K</option><option ${s.gemini_size === '2K' ? 'selected' : ''}>2K</option></select></div>
        <div><label>동시 요청</label><input id="sGWorkers" type="number" min="1" max="6" value="${s.gemini_workers ?? 2}" style="width:60px"></div>
        <div><label>TTS 모델</label><input id="sTModel" value="${esc(s.tts_model)}" style="width:200px"></div>
        <div><label>검사 모델</label><input id="sCModel" value="${esc(s.check_model)}" style="width:200px"></div>
      </div>
      <div id="sGPrice" class="hint" style="margin:6px 0">한 장당: ${price(s.gemini_model)}</div>
      <h4>소리 대본 규칙</h4>
      <div class="row"><div><label>단어·문장·지시문 앞에 붙이는 지시 (비우면 안 붙임)</label><input id="sPrefix" value="${esc(s.say_prefix ?? P.say_prefix_default)}" style="width:300px"></div>
        <div><label>잘라내기 길이 ms (파열음 b c d g j k p q t)</label><input id="sCutP" type="number" value="${s.cut_ms.plosive}" style="width:80px"></div>
        <div><label>잘라내기 길이 ms (그 외)</label><input id="sCutO" type="number" value="${s.cut_ms.other}" style="width:80px"></div></div>
      <label>낱소리 후보 대본 덮어쓰기 (글자: 대본1, 대본2 … 한 줄에 글자 하나. 비워 두면 규칙대로 "/IPA/" + 늘인 철자)</label>
      <textarea id="sVariants" style="min-height:90px; font-family:Consolas, monospace">${esc(Object.entries(s.sound_variants || {}).map(([l, v]) => `${l}: ${v.join(', ')}`).join('\n'))}</textarea>
      <div class="hint">규칙 기본값: ${Object.entries(P.default_variants).map(([l, v]) => `${l}: ${v.join(' ')}`).join(' · ')}</div>
      <div class="row" style="margin-top:12px"><button class="primary" onclick="saveSettings()">설정 저장</button><button onclick="rebuildContent()">content 다시 읽기 (항목 목록 갱신)</button></div>
    </div>
    <div class="card"><h3>최근 기록</h3><div class="log">${esc(st.log.join('\n'))}</div></div>`;
}
function priceOf(m) { const mm = P.gemini_models.find((x) => x.key === m); return mm ? Object.entries(mm.price).map(([k, v]) => `${k} $${v}`).join(' · ') : ''; }
async function saveSettings() {
  try {
    const variants = {};
    $('sVariants').value.split('\n').forEach((line) => { const m = line.match(/^\s*([a-z])\s*:\s*(.+)$/i); if (m) variants[m[1].toLowerCase()] = m[2].split(',').map((x) => x.trim()).filter(Boolean); });
    await api('/api/settings', jsonOpt('PUT', { generator: $('sGen').value, max_inflight: +$('sInflight').value, auto_approve_ref: $('sAuto').checked, gemini_model: $('sGModel').value, gemini_size: $('sGSize').value,
      gemini_workers: +$('sGWorkers').value, tts_model: $('sTModel').value.trim(), check_model: $('sCModel').value.trim(), say_prefix: $('sPrefix').value, cut_ms: { plosive: +$('sCutP').value, other: +$('sCutO').value },
      sound_variants: variants, gemini_key: $('sKey').value.trim() }));
    toast('저장했습니다'); refresh(true);
  } catch (e) { toast(e.message, true); }
}
async function testGemini() {
  try {
    if ($('sKey').value.trim()) await api('/api/settings', jsonOpt('PUT', { gemini_key: $('sKey').value.trim() }));
    $('sTestOut').textContent = '그림 요청 중…';
    const r = await api('/api/gemini/test', { method: 'POST' });
    $('sTestOut').innerHTML = `그림 연결 성공 <img src="${r.url}" style="height:64px; vertical-align:middle; margin-left:8px">`;
  } catch (e) { $('sTestOut').textContent = '실패: ' + e.message; }
}
async function testTts() {
  try {
    if ($('sKey').value.trim()) await api('/api/settings', jsonOpt('PUT', { gemini_key: $('sKey').value.trim() }));
    $('sTestOut').textContent = 'TTS 요청 중…';
    const r = await api('/api/tts/test', jsonOpt('POST', { text: 'apple', voice: 'Kore' }));
    $('sTestOut').innerHTML = `TTS 성공 (${r.sec}초, ${r.tokens}토큰) <audio controls src="${r.url}" style="height:30px; vertical-align:middle"></audio>`;
  } catch (e) { $('sTestOut').textContent = '실패: ' + e.message; }
}
async function rebuildContent() { try { const r = await api('/api/rebuild', { method: 'POST' }); toast(`항목 ${r.items} · 소리 ${r.sounds}`); refresh(true); } catch (e) { toast(e.message, true); } }

// ---------- 크게 보기 ----------
function lightbox(src, cap, isVideo) {
  $('lbBody').innerHTML = isVideo ? `<video src="${src}" controls autoplay loop></video>` : `<img src="${src}">`;
  $('lbCap').textContent = cap; $('lb').classList.add('on');
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('lb').classList.remove('on'); $('genModal').classList.remove('on'); $('logModal').classList.remove('on'); } });

// ---------- 상태 폴링 ----------
async function refresh(force) {
  try {
    ST = await api('/api/status'); renderTop(); renderNav();
    const sig = JSON.stringify([ST.kinds, ST.sounds, ST.generating.length]);
    if (force || sig !== lastSig) { lastSig = sig; if (view !== 'progress' || force) await renderView(); }
  } catch (e) { if (force) toast(e.message, true); }
}
(async () => {
  P = await api('/api/presets');
  $('unitSel').innerHTML = '<option value="all">전체</option>' + P.units.map((u) => `<option value="${u.n}">${u.n}묶음 ${esc(u.title)}</option>`).join('');
  await refresh(true); setInterval(() => refresh(false), 3000);
})();
