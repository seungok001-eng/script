"""Part 1 사진을 탑뷰(Topview) API로 만든다 — data/part1.json 의 영어 프롬프트를 그대로 보낸다.

키는 이 파일·저장소에 두지 않는다. 클라우드 환경의 '네트워크 시크릿'(api.topview.ai 에
Authorization: Bearer … 와 Topview-Uid 헤더)이 요청에 붙여 준다. 그래서 여기서는 인증 헤더를 보내지 않는다.

사용:
  python3 toeic/tools/topview_p1.py probe                 # 접속·인증·요청 형식 확인 (생성 안 함)
  python3 toeic/tools/topview_p1.py gen p1-151 p1-152     # 지정한 문제만 생성
  python3 toeic/tools/topview_p1.py gen --missing         # 앱에 사진이 없는 문제 전부
  python3 toeic/tools/topview_p1.py apply p1-151:2        # 후보 2번을 승인 → app/images/p1/p1-151.webp (960×720)

결과: art-src/forge/p1/<id>/tv_<n>.png (원본) · tv_<n>_cut.png (4:3 가운데 자르기 1200×900)
검수 기준은 문제의 must(반드시 보일 것) · must_not(보이면 안 되는 것) — tools/PHOTO-FORGE.md 4번과 같다.
"""
import json, os, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.topview.ai"
# 탑뷰 공통 작업(common_task) 규칙: …/task/submit 으로 맡기고 …/task/query?taskId= 로 결과를 받는다.
# 정확한 경로·모델 이름은 probe 로 확인한 뒤 여기 고친다.
SUBMIT = "/v1/common_task/text2image/task/submit"
QUERY = "/v1/common_task/text2image/task/query"
MODEL = os.environ.get("TOPVIEW_IMAGE_MODEL", "nano-banana-2.1")  # 나노바나나 2.1 — 탑뷰 모델 이름 표기는 probe 로 확인 (페이지에는 nano-banana-2, nano-banana-2-lite 로 나온다)
CUT = (1200, 900)
APP = (960, 720)
WEBP_Q = 78


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        txt = e.read().decode("utf-8", "replace")
        try: return e.code, json.loads(txt)
        except Exception: return e.code, {"raw": txt[:500]}


def items():
    return {q["id"]: q for q in json.load(open(os.path.join(ROOT, "data", "part1.json")))["items"]}


def submit(q):
    body = {"prompt": q["prompt"], "aspectRatio": "4:3"}
    if MODEL: body["model"] = MODEL
    st, r = call("POST", SUBMIT, body)
    tid = (r.get("result") or r.get("data") or {}).get("taskId") if isinstance(r, dict) else None
    if not tid: raise RuntimeError(f"submit {q['id']}: {st} {json.dumps(r)[:300]}")
    return tid


def wait(tid, limit=600):
    t0 = time.time()
    while time.time() - t0 < limit:
        st, r = call("GET", f"{QUERY}?taskId={tid}")
        res = (r.get("result") or r.get("data") or {}) if isinstance(r, dict) else {}
        status = str(res.get("status", "")).lower()
        if status in ("success", "succeeded", "completed", "done"):
            urls = []
            def walk(x):
                if isinstance(x, str) and x.startswith("http") and any(e in x.lower() for e in (".png", ".jpg", ".jpeg", ".webp")): urls.append(x)
                elif isinstance(x, dict): [walk(v) for v in x.values()]
                elif isinstance(x, list): [walk(v) for v in x]
            walk(res)
            return urls
        if status in ("fail", "failed", "error"): raise RuntimeError(f"task {tid}: {json.dumps(res)[:300]}")
        time.sleep(5)
    raise TimeoutError(tid)


def cut43(src, dst):
    from PIL import Image
    im = Image.open(src).convert("RGB"); w, h = im.size
    if w / h > 4 / 3: nw = round(h * 4 / 3); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else: nh = round(w * 3 / 4); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    im.resize(CUT, Image.LANCZOS).save(dst)


def gen(ids):
    Q = items()
    for i in ids:
        d = os.path.join(ROOT, "art-src", "forge", "p1", i); os.makedirs(d, exist_ok=True)
        n = len([f for f in os.listdir(d) if f.startswith("tv_") and f.endswith("_cut.png")])
        try:
            urls = wait(submit(Q[i]))
        except Exception as e:
            print("실패", i, e); continue
        for u in urls:
            n += 1
            raw = os.path.join(d, f"tv_{n}.png")
            urllib.request.urlretrieve(u, raw)
            cut43(raw, os.path.join(d, f"tv_{n}_cut.png"))
            print(i, f"후보 {n}", os.path.relpath(raw, ROOT))


def apply(spec):
    from PIL import Image
    i, n = spec.split(":")
    src = os.path.join(ROOT, "art-src", "forge", "p1", i, f"tv_{n}_cut.png")
    dst = os.path.join(ROOT, "app", "images", "p1", f"{i}.webp")
    Image.open(src).convert("RGB").resize(APP, Image.LANCZOS).save(dst, "WEBP", quality=WEBP_Q, method=6)
    print(os.path.relpath(dst, ROOT))


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] == "probe":
        print("submit(빈 요청):", *call("POST", SUBMIT, {}))
        print("query(가짜 id):", *call("GET", f"{QUERY}?taskId=probe"))
    elif a[0] == "gen":
        ids = a[1:]
        if ids == ["--missing"]:
            ids = [i for i in items() if not os.path.exists(os.path.join(ROOT, "app", "images", "p1", f"{i}.webp"))]
        gen(ids)
    elif a[0] == "apply":
        for s in a[1:]: apply(s)
