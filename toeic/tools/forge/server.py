# 토익 사진 공방(forge) — 보카핏 토익 Part 1 사진을 Google Flow 로 만들고 검수해 앱(app/images/p1)에 넣는 로컬 프로그램.
# 실행: python tools/forge/server.py   (또는 toeic\tools\photo-forge.cmd)  → 크롬 http://localhost:8767
# 파닉스 교재 공방(phonics/tools/forge/server.py)을 복사해 고친 것. 원본 저장소는 건드리지 않는다.
# 추가 설치 없음 (파이썬 표준 라이브러리 + PIL·numpy·scipy).
#
# 하는 일
#   1. 항목 목록은 data/part1.json 에서 자동 (plan.py): 문제 하나에 사진 하나
#   2. 생성: 플로우(교재 공방 Flow Bridge 확장 프로그램이 잡을 받아 간다. 확장 팝업의 서버 주소를 http://localhost:8767 로)
#   3. 뒤처리: 4:3 가운데 자르기 1200×900 → 검수(반드시 보여야 할 것·보이면 안 되는 것 확인) → 승인 → 앱에 넣기(960×720 WebP)
#
# 확장 프로그램용 끝점 (교재 공방과 같은 모양):
#   POST /functions/v1/flow-job-claim     → {job: {...}} 또는 {job: null}
#   POST /functions/v1/flow-job-complete  → {job_id, image_base64, image_mime, image_url, error}
#   POST /auth/v1/token                   → 가짜 토큰 (로그인 없음)
import base64, json, os, shutil, sys, threading, time, traceback, webbrowser
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import presets, plan, imgproc, audio

ROOT = presets.ROOT
DATA = presets.ART_DATA
ADATA = presets.AUDIO_DATA
STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
SETTINGS_FILE = os.path.join(DATA, 'settings.json')
SECRETS_FILE = os.path.join(DATA, 'secrets.json')   # API 키. .gitignore 에 있다

CLAIM_TIMEOUT = 15 * 60   # 확장이 잡을 가져가고 이만큼 결과가 없으면 다시 대기열로
MAX_ATTEMPTS = 3
MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
        '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json'}

lock = threading.RLock()
state = {'items': {}, 'sounds': {}, 'book': {}, 'units': [], 'settings': json.loads(json.dumps(presets.DEFAULT_SETTINGS)), 'secrets': {},
         'ext_seen': 0, 'log': [], 'done_times': [], 'gemini_busy': 0, 'gemini_last_error': '', 'tts_queue': [], 'tts_busy': 0, 'tts_last_error': ''}


def log(msg):
    line = time.strftime('%H:%M:%S ') + msg
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        # 콘솔이 cp949일 때 특수 기호(—, → …)로 죽지 않게. 화면 로그에는 그대로 남긴다
        print(line.encode('cp949', 'replace').decode('cp949'), flush=True)
    state['log'] = (state['log'] + [line])[-150:]


# ---------- 저장/읽기 ----------
# art-src/forge/<kind>/<id>/raw.png · cut.png|jpg|mp4 · item.json      audio-src/forge/<id>/cand_<n>.wav · final.mp3 · item.json
def item_dir(it): return os.path.join(DATA, it['kind'], it['id'])
def sound_dir(s): return os.path.join(ADATA, s['id'])


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    json.dump(obj, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def save_item(it): write_json(os.path.join(item_dir(it), 'item.json'), it)
def save_sound(s): write_json(os.path.join(sound_dir(s), 'item.json'), s)
def save_settings(): write_json(SETTINGS_FILE, state['settings'])
def save_secrets(): write_json(SECRETS_FILE, state['secrets'])


def read_json(path):
    try: return json.load(open(path, encoding='utf-8'))
    except Exception: return None


KEEP_ITEM = ('status', 'raw', 'cut', 'attempts', 'error', 'updated', 'auto_approved', 'flow_url', 'prompt_edited', 'applied', 'gen', 'asset_no', 'claimed_at', 'made_from')
KEEP_SOUND = ('cands', 'approved', 'final', 'applied', 'text_edited', 'voice', 'error')


def rebuild():
    """content 를 다시 읽어 항목 목록을 만든다. 이미 그림·소리가 있는 항목은 상태·파일을 그대로 두고 프롬프트만 새로 쓴다 (손으로 고친 프롬프트·대본은 유지)."""
    book = plan.load_book(); units = plan.load_units()
    items = {}
    for it in plan.build_items(book, units):
        old = read_json(os.path.join(DATA, it['kind'], it['id'], 'item.json'))
        if old:
            for k in KEEP_ITEM:
                if k in old: it[k] = old[k]
            if old.get('prompt_edited'): it['prompt'] = old['prompt']
        items[it['id']] = it
    sounds = {}
    for s in plan.build_sounds(book, units):
        old = read_json(os.path.join(ADATA, s['id'], 'item.json'))
        if old:
            for k in KEEP_SOUND:
                if k in old: s[k] = old[k]
            if old.get('text_edited'): s['text'] = old['text']
        sounds[s['id']] = s
    state['book'] = book; state['units'] = units; state['items'] = items; state['sounds'] = sounds
    log(f'항목 {len(items)}개 · 소리 {len(sounds)}개 (content 에서)')


def load_all():
    os.makedirs(DATA, exist_ok=True); os.makedirs(ADATA, exist_ok=True)
    s = read_json(SETTINGS_FILE)
    if s: state['settings'].update(s)
    sec = read_json(SECRETS_FILE)
    if sec: state['secrets'].update(sec)
    rebuild()


def gemini_key(): return (state['secrets'].get('gemini_key') or '').strip()


def effective_gen(it):
    """이 항목의 생성기. 영상은 플로우로만 만들 수 있다."""
    if it['kind'] == 'video': return 'flow'
    return it.get('gen') or state['settings'].get('generator', 'flow')


def is_ref_item(it):
    """사람이 승인해야 다음으로 넘어가는 기준 그림: 캐릭터 ref 자세, 첫 글자나무."""
    return (it['kind'] == 'char' and it.get('pose') == 'ref') or (it['kind'] == 'tree' and not it.get('reference'))


def ref_item(it):
    return state['items'].get(it.get('reference') or '')


def ref_ready(it):
    r = ref_item(it)
    return r is not None and r['status'] == 'approved' and bool(r.get('cut')) and os.path.exists(os.path.join(item_dir(r), r['cut']))


def ref_file(r):
    """참조로 보내는 파일: 캐스트 시트·장면은 완성본, 나머지는 원본(흰 배경)."""
    name = r['cut'] if r['kind'] in ('cast', 'scene') or not r.get('raw') else r['raw']
    return os.path.join(item_dir(r), name)


def asset_no(it):
    """플로우에 올리는 참조 그림의 고유 번호(4자리). 확장이 파일 이름으로 써서 한 번 올린 뒤에는 다시 올리지 않는다."""
    if not it.get('asset_no'):
        n = int(state['settings'].get('next_asset_no', 2001))
        it['asset_no'] = n; state['settings']['next_asset_no'] = n + 1; save_settings(); save_item(it)
    return int(it['asset_no'])


# ---------- 그림 넣기·뒤처리 ----------
def put_image(it, data):
    """원본을 넣고 뒤처리해서 검수 상태로."""
    d = item_dir(it); os.makedirs(d, exist_ok=True)
    k = it['kind']
    if k == 'video':
        open(os.path.join(d, 'raw.mp4'), 'wb').write(data)
        shutil.copyfile(os.path.join(d, 'raw.mp4'), os.path.join(d, 'cut.mp4'))
        it['raw'] = 'raw.mp4'; it['cut'] = 'cut.mp4'
    else:
        imgproc.load(data).convert('RGBA').save(os.path.join(d, 'raw.png'))
        it['raw'] = 'raw.png'
        if k in ('char', 'cand', 'word', 'tree'):
            imgproc.process_cut(data, 1024).save(os.path.join(d, 'cut.png')); it['cut'] = 'cut.png'
        elif k == 'line':
            imgproc.process_line(data, 1024).save(os.path.join(d, 'cut.png')); it['cut'] = 'cut.png'
        elif k == 'photo':
            imgproc.process_scene(data, *presets.CUT_SIZE).save(os.path.join(d, 'cut.jpg'), quality=90); it['cut'] = 'cut.jpg'
        elif k == 'scene':
            imgproc.process_scene(data, 1600, 1200).save(os.path.join(d, 'cut.jpg'), quality=85); it['cut'] = 'cut.jpg'
        elif k == 'cast':
            imgproc.load(data).convert('RGB').save(os.path.join(d, 'cut.png')); it['cut'] = 'cut.png'; it['made_from'] = 'manual'
    it['status'] = 'review'; it['error'] = ''; it['updated'] = time.time(); it['auto_approved'] = False; it['applied'] = ''
    save_item(it)


def trash_files(it):
    """버리기: 원본·완성 파일을 휴지통(_trash)으로 옮긴다."""
    d = item_dir(it)
    if not os.path.isdir(d): return
    t = os.path.join(DATA, '_trash', it['kind'], f"{it['id']}_{int(time.time())}")
    for f in os.listdir(d):
        if f.startswith(('raw', 'cut')):
            os.makedirs(t, exist_ok=True); shutil.move(os.path.join(d, f), os.path.join(t, f))


def item_action(it, action):
    if action == 'approve':
        if it['status'] not in ('review', 'approved'): raise ValueError('그림이 없는 항목은 승인할 수 없다')
        it['status'] = 'approved'; it['auto_approved'] = False
        if it['kind'] == 'char' and it.get('pose') == 'ref': ensure_cast_sheet()
    elif action == 'reject':
        it['status'] = 'review' if it.get('raw') else 'pending'; it['auto_approved'] = False
    elif action == 'reset':
        trash_files(it)
        it['status'] = 'pending'; it['raw'] = ''; it['cut'] = ''; it['error'] = ''; it['attempts'] = 0; it['auto_approved'] = False; it['applied'] = ''
        if it['kind'] == 'cast': it['made_from'] = None
    elif action == 'queue':
        if it['status'] == 'approved': raise ValueError('승인된 항목을 다시 만들려면 먼저 승인을 취소한다')
        if it['kind'] == 'cast': raise ValueError('캐스트 시트는 서버가 합성한다 (캐릭터 기준 그림 4장을 승인하면 자동)')
        it['status'] = 'queued'; it['attempts'] = 0; it['error'] = ''
    elif action == 'dequeue':
        if it['status'] in ('queued', 'generating'): it['status'] = 'pending'
    else:
        raise ValueError('모르는 동작')
    save_item(it)


def apply_item(it):
    """승인된 완성 파일을 앱 폴더(app/images/p1/…)에 넣는다 (덮어씀). .webp 면 960×720 WebP 로 줄여서."""
    if it['status'] != 'approved' or not it.get('cut'): raise ValueError('승인된 그림이 없다')
    dst = os.path.join(ROOT, it['out'].replace('/', os.sep))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    src = os.path.join(item_dir(it), it['cut'])
    if dst.endswith('.webp'):
        from PIL import Image
        Image.open(src).convert('RGB').resize(presets.APP_SIZE, Image.LANCZOS).save(dst, 'WEBP', quality=presets.WEBP_QUALITY, method=6)
    else:
        shutil.copyfile(src, dst)
    it['applied'] = time.strftime('%Y-%m-%d %H:%M'); save_item(it)
    return dst


def apply_all():
    n = 0
    for it in state['items'].values():
        if it['status'] == 'approved' and it.get('cut') and not it.get('applied'):
            try: apply_item(it); n += 1
            except Exception as e: log(f"{it['id']} 넣기 실패: {e}")
    for s in state['sounds'].values():
        if s.get('final') and not s.get('applied'):
            try: apply_sound(s); n += 1
            except Exception as e: log(f"{s['id']} 넣기 실패: {e}")
    return n


def cast_refs():
    return [state['items'].get(f'char_{cid}_ref') for cid in plan.cast_order(state['book'])]


def ensure_cast_sheet(force=False):
    """캐릭터 기준 그림이 모두 승인되면 캐스트 시트를 합성해 승인 상태로 둔다. 기준 그림이 바뀌면 다시."""
    from PIL import Image
    cs = state['items'].get('cast_sheet'); refs = cast_refs()
    if not cs or any(r is None or r['status'] != 'approved' or not r.get('cut') for r in refs): return False
    sig = [int(r.get('updated') or 0) for r in refs]
    if not force and (cs.get('made_from') == 'manual' or (cs.get('made_from') == sig and cs['status'] == 'approved')): return False
    ims = [Image.open(os.path.join(item_dir(r), r['cut'])) for r in refs]
    sheet = imgproc.cast_sheet(ims, 768)
    d = item_dir(cs); os.makedirs(d, exist_ok=True)
    sheet.save(os.path.join(d, 'cut.png')); sheet.save(os.path.join(d, 'raw.png'))
    cs.update(raw='raw.png', cut='cut.png', status='approved', auto_approved=True, made_from=sig, updated=time.time(), error='', applied='')
    save_item(cs); log('캐스트 시트 합성 (기준 그림 4장)')
    return True


def make_sheet(kind, unit):
    from PIL import Image
    entries = []
    for it in state['items'].values():
        if it['kind'] != kind or not it.get('cut') or it['kind'] == 'video': continue
        if unit is not None and it.get('unit') is not None and it['unit'] != unit: continue
        p = os.path.join(item_dir(it), it['cut'])
        if os.path.exists(p): entries.append((it['id'], Image.open(p)))
    if not entries: raise ValueError('아직 그림이 없다')
    return imgproc.to_png(imgproc.grid_sheet(entries))


# ---------- 결과 검증: 그 캐릭터가 맞나 (참조 첨부가 안 되면 다른 캐릭터가 나온다) — 캐릭터 공방 check_identity 와 같은 방식 ----------
def signature(path):
    import numpy as np
    from PIL import Image
    im = Image.open(path).convert('RGBA')
    b = imgproc.bounds(im)
    if not b: return None
    im = im.crop(b)
    hsv = np.asarray(im.convert('HSV')).astype(np.float32)
    a = np.asarray(im)[..., 3].astype(np.float32) / 255.0
    h = (hsv[..., 0] / 256 * 12).astype(int).clip(0, 11); sa = (hsv[..., 1] / 256 * 3).astype(int).clip(0, 2); v = (hsv[..., 2] / 256 * 3).astype(int).clip(0, 2)
    idx = h * 9 + sa * 3 + v
    hist = np.bincount(idx.ravel(), weights=a.ravel(), minlength=108).astype(np.float32)
    hist /= max(hist.sum(), 1e-6)
    sil = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((16, 16), Image.BILINEAR)).astype(np.float32).ravel() / 255.0
    return hist, sil


def similarity(sig_a, sig_b):
    import numpy as np
    ha, sa = sig_a; hb, sb = sig_b
    return 0.7 * float(np.minimum(ha, hb).sum()) + 0.3 * (1.0 - float(np.abs(sa - sb).mean()))


def ref_signatures():
    out = {}
    for r in cast_refs():
        if r and r.get('cut'):
            p = os.path.join(item_dir(r), r['cut'])
            if os.path.exists(p):
                sig = signature(p)
                if sig: out[r['char']] = sig
    return out


def check_identity(it, refs=None):
    """이 자세가 자기 캐릭터와 가장 닮았나. (맞음, 자기 점수, 가장 닮은 다른 캐릭터, 그 점수)"""
    refs = refs if refs is not None else ref_signatures()
    own = refs.get(it.get('char'))
    if not own or not it.get('cut'): return True, 0, None, 0
    p = os.path.join(item_dir(it), it['cut'])
    sig = signature(p) if os.path.exists(p) else None
    if not sig: return True, 0, None, 0
    mine = similarity(sig, own)
    best, best_s = None, -1
    for k, r in refs.items():
        if k == it['char']: continue
        v = similarity(sig, r)
        if v > best_s: best, best_s = k, v
    ok = best is None or mine >= best_s - 0.04   # 다른 캐릭터가 뚜렷이 더 닮았을 때만 틀린 것으로
    return ok, round(mine, 3), best, round(best_s, 3)


def verify_all(fix=True):
    refs = ref_signatures(); flagged = []
    for it in state['items'].values():
        if it['kind'] != 'char' or not it.get('reference') or not it.get('cut') or it['status'] not in ('review', 'approved'): continue
        ok, mine, other, os_ = check_identity(it, refs)
        if not ok:
            flagged.append({'id': it['id'], 'own': mine, 'other': other, 'other_score': os_})
            if fix:
                item_action(it, 'reset'); it['status'] = 'queued'; it['error'] = f'다른 캐릭터({other})로 나옴 → 다시'; save_item(it)
    return flagged


# ---------- 생성 공통 ----------
def housekeeping():
    """시간 초과 잡 되돌리기, 무인 모드 자동 승인, 캐스트 시트."""
    now = time.time()
    for it in state['items'].values():
        if it['status'] == 'generating' and now - it.get('claimed_at', now) > CLAIM_TIMEOUT:
            it['attempts'] = it.get('attempts', 0) + 1
            it['status'] = 'queued' if it['attempts'] < MAX_ATTEMPTS else 'failed'
            it['error'] = '시간 초과'; save_item(it)
            log(f"{it['id']} 시간 초과 → {it['status']}")
        if state['settings'].get('auto_approve_ref') and is_ref_item(it) and it['status'] == 'review' and it.get('cut'):
            it['status'] = 'approved'; it['auto_approved'] = True; save_item(it)
            log(f"{it['id']} 기준 그림 자동 승인 (무인 모드)")
    ensure_cast_sheet()


def pick_job(gen):
    """생성기 gen 의 다음 대기 잡 하나 (참조가 준비된 것만). 상태를 '생성 중'으로 찍어 돌려준다."""
    now = time.time()
    for it in state['items'].values():
        if it['status'] != 'queued' or effective_gen(it) != gen: continue
        if it.get('reference') and not ref_ready(it): continue
        it['status'] = 'generating'; it['claimed_at'] = now; save_item(it)
        return it
    return None


def port(): return int(state['settings'].get('port', 8767))


def claim_job():
    """확장 프로그램이 가져갈 잡 (캐릭터 공방 claim_job 과 같은 모양)."""
    now = time.time()
    state['ext_seen'] = now
    housekeeping()
    limit = int(state['settings'].get('max_inflight', 4))
    inflight = sum(1 for it in state['items'].values() if it['status'] == 'generating' and effective_gen(it) == 'flow')
    if limit > 0 and inflight >= limit: return None
    it = pick_job('flow')
    if not it: return None
    ids = list(state['items'].keys())
    job = {'id': it['id'], 'prompt': f"Job {it['id']}. {it['prompt']}",   # 앞에 잡 이름을 붙여 같은 프롬프트(선 그림 78장)가 섞이지 않게
           'job_type': it.get('job_type', 'image'), 'count': 1,
           'aspect': it.get('aspect', '1:1'),   # 확장이 플로우 설정에서 이 비율(3:4·1:1·4:3)을 고른다 (2026-10-06)
           'scene_id': f"ref:{it['id']}" if is_ref_item(it) else f"{it['kind']}:{it['id']}", 'scene_number': ids.index(it['id']) + 1, 'flow_model': 'flow'}
    if it.get('reference'):
        r = ref_item(it)
        job['source_image_url'] = f"http://localhost:{port()}/files/{r['kind']}/{r['id']}/{os.path.basename(ref_file(r))}"
        job['source_image_flow_url'] = r.get('flow_url', '')
        job['source_image_prompt'] = r.get('prompt', '')
        job['reference_scene_id'] = f"ref:{r['id']}"
        job['reference_asset_no'] = asset_no(r)
        job['require_reference'] = True
        if it['kind'] == 'video': job['scene_number'] = asset_no(r)   # 영상은 확장이 scene_number 를 올리는 파일 이름으로 쓴다
    if it['kind'] == 'video': job['prompt'] = it['prompt']   # 영상 프롬프트는 그대로 (장면 그림을 붙여 만든다)
    log(f"확장에 잡 전달: {it['id']}")
    return job


def fail_job(it, err, extra=0):
    it['attempts'] = it.get('attempts', 0) + 1
    it['error'] = str(err)[:300]
    it['status'] = 'queued' if it['attempts'] < MAX_ATTEMPTS + extra else 'failed'
    save_item(it)


def complete_job(body):
    jid = body.get('job_id', '')
    it = state['items'].get(jid)
    if not it: raise KeyError(f'없는 항목: {jid}')
    err = body.get('error')
    if err:
        fail_job(it, err); log(f"{jid} 실패({it['attempts']}): {err}"); return
    data = base64.b64decode(body.get('image_base64', ''))
    if body.get('image_url'): it['flow_url'] = body['image_url']
    try:
        put_image(it, data)
        if it['kind'] == 'char' and it.get('reference'):
            ok, mine, other, os_ = check_identity(it)
            if not ok:
                bad = os.path.join(item_dir(it), f"raw_wrong{it.get('attempts', 0) + 1}.png"); open(bad, 'wb').write(data)   # 참고용으로 남긴다
                item_action(it, 'reset')
                fail_job(it, f'다른 캐릭터({other} {os_} > 자기 {mine})로 나옴 → 참조 첨부 실패, 다시', extra=2)
                log(f"{jid} 다른 캐릭터로 나옴({other}) → {it['status']}"); return
        state['done_times'] = [t for t in state['done_times'] if time.time() - t < 1800] + [time.time()]
        log(f"{jid} 생성 완료 → 검수")
    except Exception as e:
        os.makedirs(item_dir(it), exist_ok=True)
        open(os.path.join(item_dir(it), 'raw_failed.png'), 'wb').write(data)
        fail_job(it, f'뒤처리 실패: {e}'); log(f"{jid} 뒤처리 실패: {e}")


# ---------- 제미나이 API(나노바나나) 직접 생성 ----------
def gemini_generate(prompt, ref_png=None, aspect='1:1', model=None, size=None):
    """제미나이 이미지 생성 한 번. 참조 그림(bytes)이 있으면 같이 보낸다. 결과 PNG bytes."""
    import urllib.request, urllib.error
    key = gemini_key()
    if not key: raise RuntimeError('제미나이 API 키가 없다 (설정에서 넣기)')
    model = model or state['settings'].get('gemini_model', 'gemini-3.1-flash-image')
    size = size or state['settings'].get('gemini_size', '1K')
    if 'pro' in model and size == '512px': size = '1K'   # Pro는 1K부터
    parts = [{'text': prompt}]
    if ref_png:
        parts.append({'inline_data': {'mime_type': 'image/png', 'data': base64.b64encode(ref_png).decode()}})
    body = {'contents': [{'role': 'user', 'parts': parts}],
            'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': aspect, 'imageSize': size}}}
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST', headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    try:
        with urllib.request.urlopen(req, timeout=180) as f:
            res = json.load(f)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'제미나이 HTTP {e.code}: {e.read().decode("utf-8", "replace")[:400]}')
    for cand in res.get('candidates', []):
        for part in (cand.get('content') or {}).get('parts', []):
            d = part.get('inlineData') or part.get('inline_data')
            if d and d.get('data'):
                u = state['settings'].setdefault('gemini_usage', {'count': 0, 'cost': 0.0})
                u['count'] = u.get('count', 0) + 1
                u['cost'] = round(u.get('cost', 0.0) + presets.GEMINI_MODELS.get(model, {}).get('price', {}).get(size, 0.0), 4)
                save_settings()
                return base64.b64decode(d['data'])
    fb = res.get('promptFeedback') or {}
    raise RuntimeError('제미나이가 그림을 돌려주지 않음: ' + (fb.get('blockReason') or json.dumps(res)[:300]))


def gemini_run_one(it):
    try:
        ref = None
        if it.get('reference'):
            r = ref_item(it); p = ref_file(r)
            ref = open(p, 'rb').read()
            if not p.lower().endswith('.png'):   # jpg 참조는 png 로 바꿔 보낸다
                ref = imgproc.to_png(imgproc.load(ref).convert('RGB'))
        png = gemini_generate(it['prompt'], ref, it.get('aspect', '1:1'))
        with lock:
            complete_job({'job_id': it['id'], 'image_base64': base64.b64encode(png).decode(), 'image_mime': 'image/png'})
    except Exception as e:
        state['gemini_last_error'] = str(e)
        with lock:
            complete_job({'job_id': it['id'], 'error': f'제미나이: {e}'[:300]})


def gemini_loop():
    """뒤에서 돈다: 키가 있고 제미나이 항목에 대기 잡이 있으면 설정된 수만큼 동시에 보낸다."""
    import concurrent.futures
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=6)
    while True:
        try:
            if gemini_key():
                workers = max(1, int(state['settings'].get('gemini_workers', 2)))
                while state['gemini_busy'] < workers:
                    with lock:
                        housekeeping(); it = pick_job('gemini')
                    if not it: break
                    state['gemini_busy'] += 1
                    def run(it=it):
                        try: gemini_run_one(it)
                        finally: state['gemini_busy'] -= 1
                    pool.submit(run)
        except Exception as e:
            log(f'제미나이 루프 오류: {e}')
        time.sleep(2)


# ---------- 소리 (TTS 후보 → 승인 → mp3) ----------
def sound_variants_for(s):
    """이 소리 항목의 기본 대본들. 낱소리는 설정의 덮어쓰기 표 → 없으면 규칙("/IPA/" + 늘인 철자). 나머지는 대본 하나."""
    if s['sub'] == 'sound':
        over = (state['settings'].get('sound_variants') or {}).get(s['letter'])
        if over: return [str(t) for t in over if str(t).strip()]
        return presets.sound_variants(s['letter'], state['book']['letters'][s['letter']]['sound'])
    return [s['text']]


def tts_script(s, text):
    """실제로 TTS 에 보내는 대본. 낱소리·글자 이름은 그대로, 단어·문장·지시문은 짧은 지시("Say slowly and clearly: ")를 앞에 붙인다."""
    if s['sub'] in ('sound', 'name'): return text
    pre = state['settings'].get('say_prefix')
    if pre is None: pre = presets.SAY_PREFIX
    return (pre + text) if pre and not text.lower().startswith(pre.strip().lower()[:8]) else text


def next_cand_no(s): return max([c['n'] for c in s['cands']] + [0]) + 1


def add_cand(s, wav_bytes=None, src_path=None, text='', voice='', how='tts'):
    """후보 wav 를 더하고 자동 검사(무엇을 말했나)를 대기열에 넣는다."""
    d = sound_dir(s); os.makedirs(d, exist_ok=True)
    n = next_cand_no(s); name = f'cand_{n}.wav'; p = os.path.join(d, name)
    if wav_bytes is not None: open(p, 'wb').write(wav_bytes)
    else: audio.to_wav(src_path, p)
    c = {'n': n, 'file': name, 'text': text, 'voice': voice, 'how': how, 'created': time.time(), 'sec': round(audio.duration(p), 2), 'check': None, 'warn': False}
    s['cands'].append(c); s['error'] = ''; save_sound(s)
    state['tts_queue'].append({'kind': 'check', 'id': s['id'], 'n': n}); s['busy'] = s.get('busy', 0) + 1
    return c


def norm_text(t):
    return ' '.join(''.join(ch if ch.isalnum() or ch == ' ' else ' ' for ch in str(t).lower()).split())


def apply_check(s, c, res):
    """검사 결과를 후보에 적고, 대본과 다르면(단어·대사·지시문) 또는 덧붙는 모음이 있으면(낱소리) 경고 표시."""
    c['check'] = res
    heard = norm_text(res.get('transcript', ''))
    if s['sub'] == 'sound':
        c['warn'] = 'extra' in res.get('note', '').lower() or res.get('type', '') in ('word', 'sentence', 'letter-name')
    elif s['sub'] == 'name':
        c['warn'] = heard not in (s['text'].lower(), s['text'].lower() + '.') and heard != norm_text(s['text'])
    else:
        c['warn'] = heard != norm_text(s['text'])


def tts_enqueue(s, text, voice):
    state['tts_queue'].append({'kind': 'tts', 'id': s['id'], 'text': tts_script(s, text), 'voice': voice})
    s['busy'] = s.get('busy', 0) + 1


def cut_enqueue(s):
    """잘라내기 후보: 단어 음성이 아직 없으면 뒤로 미뤄 다시 시도한다 (generate_all 때 단어와 함께 걸어 둘 수 있게)."""
    state['tts_queue'].append({'kind': 'cut', 'id': s['id'], 'tries': 0}); s['busy'] = s.get('busy', 0) + 1


def tts_loop():
    """뒤에서 돈다: TTS 대기열(tts 생성 · cut 잘라내기 · check 자동 검사)을 설정된 수만큼 동시에 처리한다."""
    import concurrent.futures
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)
    def run(t):
        s = state['sounds'].get(t['id']); done = True
        try:
            if t['kind'] == 'tts':
                wav, tokens = audio.tts(t['text'], t['voice'], gemini_key(), state['settings'].get('tts_model', presets.TTS_MODEL))
                with lock:
                    add_cand(s, wav_bytes=wav, text=t['text'], voice=t['voice'], how='tts')
                    u = state['settings'].setdefault('tts_usage', {'count': 0, 'tokens': 0, 'checks': 0})
                    u['count'] = u.get('count', 0) + 1; u['tokens'] = u.get('tokens', 0) + int(tokens); save_settings()
                log(f"{t['id']} 후보 생성: \"{t['text']}\" ({t['voice']})")
            elif t['kind'] == 'cut':
                try:
                    with lock: cut_candidate(s)
                    log(f"{t['id']} 잘라내기 후보")
                except Exception as e:
                    w = state['book']['letters'][s['letter']]['words'][0]; ws = state['sounds'].get(f'word_{w}')
                    waiting = ws and (ws.get('busy') or any(x.get('id') == ws['id'] for x in state['tts_queue']))
                    if waiting and t['tries'] < 60:
                        t['tries'] += 1; state['tts_queue'].append(t); done = False   # 단어 음성이 나오면 다시
                    else:
                        raise
            elif t['kind'] == 'check':
                c = next((c for c in s['cands'] if c['n'] == t['n']), None)
                if c:
                    res = audio.check(open(os.path.join(sound_dir(s), c['file']), 'rb').read(), gemini_key(), state['settings'].get('check_model', presets.CHECK_MODEL))
                    with lock:
                        apply_check(s, c, res); save_sound(s)
                        u = state['settings'].setdefault('tts_usage', {'count': 0, 'tokens': 0, 'checks': 0}); u['checks'] = u.get('checks', 0) + 1; save_settings()
        except Exception as e:
            state['tts_last_error'] = str(e)
            with lock:
                if s: s['error'] = f"{t['kind']}: {e}"[:300]; save_sound(s)
            log(f"{t['id']} {t['kind']} 실패: {e}")
        finally:
            with lock:
                if s and done: s['busy'] = max(0, s.get('busy', 1) - 1)
            state['tts_busy'] -= 1
    while True:
        try:
            workers = max(1, int(state['settings'].get('tts_workers', 2)))
            while state['tts_queue'] and state['tts_busy'] < workers and gemini_key():
                with lock:
                    t = state['tts_queue'].pop(0)
                state['tts_busy'] += 1
                pool.submit(run, t)
                if t['kind'] == 'cut': time.sleep(0.5)   # 잘라내기는 단어 음성을 기다리며 돌 수 있으니 바쁘게 돌지 않게
        except Exception as e:
            log(f'TTS 루프 오류: {e}')
        time.sleep(1)


def cut_candidate(s):
    """낱소리 후보 ③: 같은 글자의 첫 단어 음성(승인본이 있으면 그것, 없으면 첫 후보)에서 소리 시작부터 앞부분을 잘라낸다."""
    if s['sub'] != 'sound': raise ValueError('낱소리 항목만')
    w = state['book']['letters'][s['letter']]['words'][0]
    ws = state['sounds'].get(f'word_{w}')
    if not ws: raise ValueError(f'단어 항목 word_{w} 가 없다')
    if ws.get('final'): src = os.path.join(sound_dir(ws), ws['final'])
    elif ws['cands']: src = os.path.join(sound_dir(ws), ws['cands'][0]['file'])
    else: raise ValueError(f'먼저 단어 "{w}" 의 음성 후보를 만들어라')
    ms = int((state['settings'].get('cut_ms') or presets.CUT_MS)['plosive' if s['letter'] in presets.PLOSIVES else 'other'])
    d = sound_dir(s); os.makedirs(d, exist_ok=True)
    tmp = os.path.join(d, '_cut.wav')
    audio.cut_front(src, tmp, ms)
    c = add_cand(s, src_path=tmp, text=f'{w} 앞 {ms}ms', voice='', how='cut')
    os.remove(tmp)
    return c


def approve_sound(s, n):
    c = next((c for c in s['cands'] if c['n'] == int(n)), None)
    if not c: raise KeyError('없는 후보')
    d = sound_dir(s)
    audio.finalize(os.path.join(d, c['file']), os.path.join(d, 'final.mp3'))
    s['approved'] = c['n']; s['final'] = 'final.mp3'; s['applied'] = ''; s['error'] = ''; save_sound(s)


def unapprove_sound(s):
    s['approved'] = None; s['final'] = ''; s['applied'] = ''; save_sound(s)


def delete_cand(s, n):
    c = next((c for c in s['cands'] if c['n'] == int(n)), None)
    if not c: raise KeyError('없는 후보')
    p = os.path.join(sound_dir(s), c['file'])
    if os.path.exists(p):
        t = os.path.join(ADATA, '_trash', s['id']); os.makedirs(t, exist_ok=True)
        shutil.move(p, os.path.join(t, f"{int(time.time())}_{c['file']}"))
    s['cands'] = [x for x in s['cands'] if x['n'] != c['n']]
    if s.get('approved') == c['n']: unapprove_sound(s)
    save_sound(s)


def apply_sound(s):
    if not s.get('final'): raise ValueError('승인된 소리가 없다')
    dst = os.path.join(presets.WEB, 'assets', 'audio', f"{s['id']}.mp3")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(os.path.join(sound_dir(s), s['final']), dst)
    s['applied'] = time.strftime('%Y-%m-%d %H:%M'); save_sound(s)
    return dst


def sound_view(s):
    d = dict(s); d['busy'] = s.get('busy', 0); d['variants'] = sound_variants_for(s); d['script'] = tts_script(s, s['text'])
    d['final_url'] = f"/audio/{s['id']}/{s['final']}?v={int(time.time())}" if s.get('final') else ''
    return d


# ---------- 요약 ----------
def counts(kind=None, unit=None):
    sel = [it for it in state['items'].values() if (kind is None or it['kind'] == kind) and (unit is None or it.get('unit') is None or it['unit'] == unit)]
    c = {'total': len(sel), 'approved': 0, 'review': 0, 'queued': 0, 'failed': 0, 'applied': 0, 'pending': 0}
    for it in sel:
        st = it['status']
        if st in ('queued', 'generating'): c['queued'] += 1
        elif st in c: c[st] += 1
        if it.get('applied'): c['applied'] += 1
    return c


def sound_counts(unit=None):
    sel = [s for s in state['sounds'].values() if unit is None or s.get('unit') is None or s['unit'] == unit]
    return {'total': len(sel), 'cand': sum(1 for s in sel if s['cands']), 'approved': sum(1 for s in sel if s.get('final')),
            'applied': sum(1 for s in sel if s.get('applied')), 'queue': len(state['tts_queue']), 'busy': state['tts_busy']}


def item_view(it):
    d = dict(it)
    v = int(it.get('updated') or 0)
    d['cut_url'] = f"/files/{it['kind']}/{it['id']}/{it['cut']}?v={v}" if it.get('cut') else ''
    d['raw_url'] = f"/files/{it['kind']}/{it['id']}/{it['raw']}?v={v}" if it.get('raw') else ''
    d['effective_gen'] = effective_gen(it)
    d['ref_ok'] = ref_ready(it) if it.get('reference') else True
    return d


def status_view():
    now = time.time()
    gen = [{'id': it['id'], 'title': it['title'], 'elapsed': int(now - it.get('claimed_at', now)), 'gen': effective_gen(it)} for it in state['items'].values() if it['status'] == 'generating']
    recent = [t for t in state['done_times'] if now - t < 600]
    return {'ext_seen': state['ext_seen'], 'ext_alive': now - state['ext_seen'] < 10, 'data_dir': DATA, 'audio_dir': ADATA,
            'generating': gen, 'rate_per_min': round(len(recent) / 10.0, 2), 'done_30min': len(state['done_times']),
            'kinds': {k: counts(k) for k in presets.KINDS}, 'all': counts(), 'sounds': sound_counts(),
            'gemini': {'key_set': bool(gemini_key()), 'busy': state['gemini_busy'], 'usage': state['settings'].get('gemini_usage', {'count': 0, 'cost': 0.0}),
                       'model': state['settings'].get('gemini_model'), 'size': state['settings'].get('gemini_size'), 'last_error': state['gemini_last_error']},
            'tts': {'usage': state['settings'].get('tts_usage', {'count': 0, 'tokens': 0}), 'queue': len(state['tts_queue']), 'busy': state['tts_busy'], 'last_error': state['tts_last_error']},
            'generator': state['settings'].get('generator', 'flow'), 'auto_approve_ref': bool(state['settings'].get('auto_approve_ref')),
            'log': state['log'][-40:]}


def presets_view():
    book = state['book']
    return {'kinds': presets.KINDS, 'sound_subs': plan.SOUND_SUBS,
            'units': [{'n': u['n'], 'title': u['title'], 'has_json': any(x['unit'] == u['n'] for x in state['units'])} for u in book.get('units', [])],
            'characters': {k: {'name': v['name'], 'ko': v['ko'], 'voice': v.get('voice')} for k, v in book.get('characters', {}).items()},
            'cast_order': plan.cast_order(book),
            'voices': [{'key': k, 'name': n} for k, n in presets.VOICES],
            'gemini_models': [{'key': k, 'name': v['name'], 'price': v['price']} for k, v in presets.GEMINI_MODELS.items()],
            'default_variants': {l: presets.sound_variants(l, L['sound']) for l, L in book.get('letters', {}).items()},
            'plosives': sorted(presets.PLOSIVES), 'say_prefix_default': presets.SAY_PREFIX}


# ---------- HTTP ----------
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def send_json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers(); self.wfile.write(b)

    def send_bytes(self, b, ctype, cache=False):
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Cache-Control', 'max-age=3600' if cache else 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers(); self.wfile.write(b)

    def send_file(self, base, rel):
        f = os.path.normpath(os.path.join(base, rel))
        if not f.startswith(base) or not os.path.isfile(f): return self.send_json({'error': '없음'}, 404)
        return self.send_bytes(open(f, 'rb').read(), MIME.get(os.path.splitext(f)[1].lower(), 'application/octet-stream'))

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(n) if n else b''

    def body_json(self):
        b = self.body()
        return json.loads(b.decode('utf-8')) if b else {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
        self.end_headers()

    def do_GET(self):
        try:
            u = urlparse(self.path); p = unquote(u.path); q = parse_qs(u.query)
            unit = int(q['unit'][0]) if q.get('unit') and q['unit'][0] not in ('', 'all') else None
            if p in ('/', '/index.html'): return self.send_file(STATIC, 'index.html')
            if p.startswith('/static/'): return self.send_file(STATIC, p[8:])
            if p.startswith('/files/'): return self.send_file(DATA, p[7:])
            if p.startswith('/audio/'): return self.send_file(ADATA, p[7:])
            parts = p.split('/')
            with lock:
                if p == '/api/presets': return self.send_json(presets_view())
                if p == '/api/settings':
                    d = dict(state['settings']); k = gemini_key()
                    d['gemini_key_set'] = bool(k); d['gemini_key_hint'] = (k[:6] + '…' + k[-4:]) if len(k) > 12 else ''
                    return self.send_json(d)
                if p == '/api/status': return self.send_json(status_view())
                if p == '/api/items':
                    kind = (q.get('kind') or [''])[0]
                    out = [item_view(it) for it in state['items'].values() if (not kind or it['kind'] == kind) and (unit is None or it.get('unit') is None or it['unit'] == unit)]
                    return self.send_json(out)
                if p == '/api/sounds':
                    sub = (q.get('sub') or [''])[0]
                    out = [sound_view(s) for s in state['sounds'].values() if (not sub or s['sub'] == sub) and (unit is None or s.get('unit') is None or s['unit'] == unit)]
                    return self.send_json(out)
                if p == '/api/sheet.png': return self.send_bytes(make_sheet((q.get('kind') or ['word'])[0], unit), 'image/png')
                if len(parts) == 4 and parts[2] == 'items':
                    it = state['items'].get(parts[3]); return self.send_json(item_view(it)) if it else self.send_json({'error': '없는 항목'}, 404)
                if len(parts) == 4 and parts[2] == 'sounds':
                    s = state['sounds'].get(parts[3]); return self.send_json(sound_view(s)) if s else self.send_json({'error': '없는 항목'}, 404)
            return self.send_json({'error': '없는 주소'}, 404)
        except Exception as e:
            traceback.print_exc(); return self.send_json({'error': str(e)}, 500)

    def do_PUT(self):
        try:
            p = unquote(urlparse(self.path).path); parts = p.split('/')
            body = self.body_json()
            with lock:
                if p == '/api/settings':
                    for k in ('generator', 'auto_approve_ref', 'max_inflight', 'gemini_model', 'gemini_size', 'gemini_workers', 'tts_model', 'tts_workers', 'sound_variants', 'cut_ms', 'say_prefix', 'check_model'):
                        if k in body: state['settings'][k] = body[k]
                    if body.get('gemini_key'): state['secrets']['gemini_key'] = str(body['gemini_key']).strip(); save_secrets()
                    elif body.get('clear_key'): state['secrets']['gemini_key'] = ''; save_secrets()
                    save_settings(); d = dict(state['settings']); d['gemini_key_set'] = bool(gemini_key()); return self.send_json(d)
                if len(parts) == 4 and parts[2] == 'items':
                    it = state['items'].get(parts[3])
                    if not it: return self.send_json({'error': '없는 항목'}, 404)
                    if 'prompt' in body: it['prompt'] = body['prompt']; it['prompt_edited'] = True
                    if 'gen' in body: it['gen'] = body['gen'] or ''
                    save_item(it); return self.send_json(item_view(it))
                if len(parts) == 4 and parts[2] == 'sounds':
                    s = state['sounds'].get(parts[3])
                    if not s: return self.send_json({'error': '없는 항목'}, 404)
                    if 'text' in body: s['text'] = body['text']; s['text_edited'] = True
                    if 'voice' in body: s['voice'] = body['voice']
                    save_sound(s); return self.send_json(sound_view(s))
            return self.send_json({'error': '없는 주소'}, 404)
        except Exception as e:
            traceback.print_exc(); return self.send_json({'error': str(e)}, 400)

    def do_DELETE(self):
        try:
            p = unquote(urlparse(self.path).path); parts = p.split('/')
            with lock:
                if len(parts) == 6 and parts[2] == 'sounds' and parts[4] == 'cand':
                    s = state['sounds'].get(parts[3])
                    if not s: return self.send_json({'error': '없는 항목'}, 404)
                    delete_cand(s, parts[5]); return self.send_json(sound_view(s))
            return self.send_json({'error': '없는 주소'}, 404)
        except Exception as e:
            traceback.print_exc(); return self.send_json({'error': str(e)}, 400)

    def do_POST(self):
        try:
            u = urlparse(self.path); p = unquote(u.path); parts = p.split('/')
            # ---- 확장 프로그램 ----
            if p == '/functions/v1/flow-job-claim':
                self.body()
                with lock: job = claim_job()
                return self.send_json({'job': job})
            if p == '/functions/v1/flow-job-complete':
                body = self.body_json()
                with lock: complete_job(body)
                return self.send_json({'ok': True})
            if p.startswith('/auth/v1/token'):
                self.body(); return self.send_json({'access_token': 'local', 'refresh_token': 'local'})
            # ---- 화면 ----
            if p == '/api/gemini/test':
                # 작은 그림 한 장 (512px, 가장 싼 설정)으로 키·모델 확인. 결과는 files/_test.png
                try:
                    png = gemini_generate('A small hand-drawn picture-book style red apple on a plain white background, no text.', None, '1:1', None, '512px')
                    open(os.path.join(DATA, '_test.png'), 'wb').write(png)
                    return self.send_json({'ok': True, 'url': '/files/_test.png?v=%d' % int(time.time())})
                except Exception as e:
                    return self.send_json({'error': str(e)}, 400)
            if p == '/api/tts/test':
                try:
                    body = self.body_json()
                    wav, tokens = audio.tts(body.get('text') or 'apple', body.get('voice') or 'Kore', gemini_key(), state['settings'].get('tts_model', presets.TTS_MODEL))
                    tp = os.path.join(ADATA, '_test.wav'); open(tp, 'wb').write(wav)
                    with lock:
                        us = state['settings'].setdefault('tts_usage', {'count': 0, 'tokens': 0}); us['count'] += 1; us['tokens'] += int(tokens); save_settings()
                    return self.send_json({'ok': True, 'url': '/audio/_test.wav?v=%d' % int(time.time()), 'tokens': tokens, 'sec': round(audio.duration(tp), 2)})
                except Exception as e:
                    return self.send_json({'error': str(e)}, 400)
            with lock:
                if p == '/api/rebuild':
                    rebuild(); return self.send_json({'items': len(state['items']), 'sounds': len(state['sounds'])})
                if p == '/api/verify':
                    return self.send_json({'flagged': verify_all(bool(self.body_json().get('fix', True)))})
                if p == '/api/cast_sheet':
                    ok = ensure_cast_sheet(force=True)
                    if not ok: return self.send_json({'error': '캐릭터 기준 그림 4장이 모두 승인돼야 한다'}, 400)
                    return self.send_json(item_view(state['items']['cast_sheet']))
                if p == '/api/auto_all':
                    body = self.body_json(); on = body.get('on'); kind = body.get('kind') or ''; unit = body.get('unit')
                    n = 0
                    for it in state['items'].values():
                        if kind and it['kind'] != kind: continue
                        if unit not in (None, '', 'all') and it.get('unit') is not None and it['unit'] != int(unit): continue
                        if it['kind'] == 'cast': continue
                        if on and it['status'] in ('pending', 'failed'): item_action(it, 'queue'); n += 1
                        if not on and it['status'] in ('queued', 'generating'): item_action(it, 'dequeue'); n += 1
                    return self.send_json({'count': n})
                if p == '/api/apply_all':
                    return self.send_json({'count': apply_all()})
                if p == '/api/open':
                    which = self.body_json().get('which', 'art')
                    d = {'art': DATA, 'audio': ADATA, 'web': os.path.join(presets.WEB, 'images', 'p1')}.get(which, DATA)
                    os.makedirs(d, exist_ok=True); os.startfile(d); return self.send_json({'ok': True, 'dir': d})
                # 그림 항목
                if len(parts) == 5 and parts[2] == 'items':
                    it = state['items'].get(parts[3])
                    if not it: return self.send_json({'error': '없는 항목'}, 404)
                    a = parts[4]
                    if a == 'image':
                        data = self.body()
                        if self.headers.get('Content-Type', '').startswith('application/json'): data = base64.b64decode(json.loads(data)['data'])
                        put_image(it, data); return self.send_json(item_view(it))
                    if a == 'action': item_action(it, self.body_json().get('action')); return self.send_json(item_view(it))
                    if a == 'reprocess':
                        if not it.get('raw'): raise ValueError('원본이 없다')
                        put_image(it, open(os.path.join(item_dir(it), it['raw']), 'rb').read()); return self.send_json(item_view(it))
                    if a == 'apply': return self.send_json({'dst': apply_item(it), 'item': item_view(it)})
                # 소리 항목
                if len(parts) == 5 and parts[2] == 'sounds':
                    s = state['sounds'].get(parts[3])
                    if not s: return self.send_json({'error': '없는 항목'}, 404)
                    a = parts[4]
                    if a == 'generate':
                        body = self.body_json()
                        if not gemini_key(): raise ValueError('제미나이 API 키가 없다 (설정에서 넣기)')
                        texts = [t for t in (body.get('texts') or sound_variants_for(s)) if str(t).strip()]
                        voices = [v for v in (body.get('voices') or [s['voice']]) if v]
                        n = 0
                        for t in texts:
                            for v in voices: tts_enqueue(s, str(t).strip(), v); n += 1
                        if body.get('cut', s['sub'] == 'sound'): cut_enqueue(s); n += 1   # 낱소리는 잘라내기 후보도 기본으로
                        save_sound(s); return self.send_json({'queued': n, 'item': sound_view(s)})
                    if a == 'cut': return self.send_json({'cand': cut_candidate(s), 'item': sound_view(s)})
                    if a == 'recheck':
                        for c in s['cands']: state['tts_queue'].append({'kind': 'check', 'id': s['id'], 'n': c['n']}); s['busy'] = s.get('busy', 0) + 1
                        return self.send_json(sound_view(s))
                    if a == 'approve': approve_sound(s, self.body_json().get('n')); return self.send_json(sound_view(s))
                    if a == 'unapprove': unapprove_sound(s); return self.send_json(sound_view(s))
                    if a == 'apply': return self.send_json({'dst': apply_sound(s), 'item': sound_view(s)})
                    if a == 'upload':
                        data = self.body(); ext = (self.headers.get('X-File-Ext') or 'wav').strip('.').lower()
                        tmp = os.path.join(ADATA, f"_upload_{int(time.time() * 1000)}.{ext}"); open(tmp, 'wb').write(data)
                        try: add_cand(s, src_path=tmp, text=s['text'], voice='', how='upload')
                        finally:
                            if os.path.exists(tmp): os.remove(tmp)
                        return self.send_json(sound_view(s))
                if p == '/api/sounds/generate_all':
                    # 후보가 하나도 없는 소리 항목 전부 (분류·유닛으로 좁힐 수 있다). 낱소리는 변형 표 전부 × 기본 목소리
                    body = self.body_json(); sub = body.get('sub') or ''; unit = body.get('unit')
                    if not gemini_key(): raise ValueError('제미나이 API 키가 없다 (설정에서 넣기)')
                    n = 0
                    for s in state['sounds'].values():
                        if sub and s['sub'] != sub: continue
                        if unit not in (None, '', 'all') and s.get('unit') is not None and s['unit'] != int(unit): continue
                        if s['cands'] or s.get('busy'): continue
                        for t in sound_variants_for(s): tts_enqueue(s, t, s['voice']); n += 1
                        if s['sub'] == 'sound': cut_enqueue(s); n += 1
                    return self.send_json({'queued': n})
            return self.send_json({'error': '없는 주소'}, 404)
        except Exception as e:
            traceback.print_exc(); return self.send_json({'error': str(e)}, 400)


def open_browser(url):
    """크롬이 있으면 크롬으로 (확장 프로그램이 크롬에 있으니), 없으면 기본 브라우저로."""
    import subprocess
    cands = [os.path.join(os.environ.get(k, ''), 'Google', 'Chrome', 'Application', 'chrome.exe') for k in ('ProgramFiles', 'ProgramFiles(x86)', 'LocalAppData')]
    for c in cands:
        if c and os.path.exists(c):
            try:
                subprocess.Popen([c, url]); return
            except OSError:
                pass
    webbrowser.open(url)


def main():
    load_all()
    pt = port()
    threading.Thread(target=gemini_loop, daemon=True).start()
    threading.Thread(target=tts_loop, daemon=True).start()
    try:
        ThreadingHTTPServer.allow_reuse_address = False  # 같은 포트에 두 서버가 겹쳐 뜨지 않게
        srv = ThreadingHTTPServer(('127.0.0.1', pt), H)
    except OSError:
        print(f'토익 사진 공방이 이미 켜져 있어 화면만 엽니다: http://localhost:{pt}', flush=True)
        if '--no-browser' not in sys.argv: open_browser(f'http://localhost:{pt}')
        return
    srv.daemon_threads = True
    print(f'토익 사진 공방: http://localhost:{pt}   (그림: {DATA}, 소리: {ADATA})', flush=True)
    if '--no-browser' not in sys.argv:
        threading.Timer(0.8, lambda: open_browser(f'http://localhost:{pt}')).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
