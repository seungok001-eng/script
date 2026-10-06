"""음성 파일 만들기 (다시 돌려도 안전 — 이미 만든 파일은 건너뛴다).

1) 단어 음성: Kokoro-82M(Apache-2.0)의 af_heart(미국 여성) 목소리로 만든다 — 앱 전체 음성을 한 모델로 통일.
   (--reuse-gemini 를 주면 예전처럼 voca-yun 의 Gemini TTS 음성(Kore)이 있는 단어는 복사해 재사용한다)
2) 예문·Part 1 문장 음성: Kokoro로 만든다. 토익처럼 여러 억양을 듣도록 미국·영국 남녀 목소리를 문장마다 고정 배정한다.

파일 이름은 단어 id(예: w/01-05.mp3). audio-manifest.json 에 (파일 → 문장·목소리)를 기록해서
문장이 바뀐 경우에만 다시 만든다.

준비:
  python3 -m venv venv && venv/bin/pip install kokoro-onnx soundfile
  KOKORO_DIR = expo-kokoro npm 패키지(build/kokoro-quantized.onnx, build/voices/*.bin)를 푼 폴더
  REF_AUDIO_DIR = voca-yun 저장소 경로 (data/word-audio-index.json, public/audio)
사용: venv/bin/python toeic/scripts/build_audio.py [--words] [--sentences] [--workers 3]
"""
import argparse, glob, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from concurrent.futures import ProcessPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app")
AUDIO = os.path.join(APP, "audio")
MANIFEST = os.path.join(ROOT, "data", "audio-manifest.json")
KOKORO_DIR = os.environ.get("KOKORO_DIR", "/tmp/claude-0/tts/package")
REF = os.environ.get("REF_AUDIO_DIR", "/home/user/seungok001-eng/voca-yun")
WORD_VOICE = "af_heart"
# mp3 비트레이트 (24kHz 모노). 48k 와 비교해 들어 보고 32k 로 정함 — 음성 용량 약 2/3
BITRATE = "32k"
# 예문 목소리: 미국 여/남, 영국 여/남 (토익 LC처럼 억양 다양화) — 미국 4 : 영국 2, 여 3 : 남 3.
# 샘플을 들어 보고 고른 목소리: 미국 여 heart · 미국 남 liam · 영국 여 alice · 영국 남 fable
SENT_VOICES = ["af_heart", "am_liam", "af_heart", "bf_alice", "bm_fable", "am_liam"]


def voice_for(key):
    h = int(hashlib.md5(key.encode()).hexdigest(), 16)
    return SENT_VOICES[h % len(SENT_VOICES)]


def plain(s):
    return re.sub(r"\s+", " ", s.replace("*", "")).strip()


def load_entries():
    plan = json.load(open(os.path.join(ROOT, "data", "plan.json"), encoding="utf-8"))
    words, sents = [], []
    for d in plan:
        path = os.path.join(ROOT, "data", "days", f"day-{d['day']:02d}.json")
        entries = {}
        if os.path.exists(path):
            try:
                entries = {e["w"]: e for e in json.load(open(path, encoding="utf-8"))}
            except Exception:
                entries = {}
        for i, w in enumerate(d["words"], 1):
            wid = f"{d['day']:02d}-{i:02d}"
            words.append((wid, w))
            e = entries.get(w)
            if e and e.get("ex"):
                sents.append((f"s/{wid}.mp3", plain(e["ex"]), voice_for(wid)))
    ex = os.path.join(ROOT, "data", "extras.json")
    if os.path.exists(ex):
        try:
            extras = json.load(open(ex, encoding="utf-8"))
            for i, it in enumerate(extras.get("part1", []), 1):
                sents.append((f"p1/{i:03d}.mp3", plain(it["e"]), voice_for(f"p1-{i}")))
            for rel, text, v in lc_jobs(extras.get("lc", [])):
                sents.append((rel, text, v))
        except Exception:
            pass
    for rel, text, v in p34_jobs():
        sents.append((rel, text, v))
    for rel, text, v in p1q_jobs():
        sents.append((rel, text, v))
    for rel, text, v in fm_jobs():
        sents.append((rel, text, v))
    return words, sents


def fm_jobs():
    """정규 모의고사(data/fullmock.json): Part 2 질문(-q)·보기(-0,-1,-2), Part 3·4 문장(-NN). 모두 fm/ 아래.
    Part 2 보기 세 개는 답하는 사람 목소리 하나로 읽어 목소리로 정답이 드러나지 않게 한다."""
    f = os.path.join(ROOT, "data", "fullmock.json")
    if not os.path.exists(f):
        return []
    out = []
    for m in json.load(open(f, encoding="utf-8"))["mocks"]:
        for it in m["p2"]:
            v = voice_for(it["id"])
            out.append((f"fm/{it['id']}-q.mp3", plain(it["q"]), v))
            for i, o in enumerate(it["o"]):
                out.append((f"fm/{it['id']}-{i}.mp3", plain(o), OTHER[v]))
        for st in m["p3"] + m["p4"]:
            vo = p34_voices(st["id"])
            for i, ln in enumerate(st["lines"], 1):
                out.append((f"fm/{st['id']}-{i:02d}.mp3", plain(ln["en"]), vo[ln["sp"]]))
    return out


def p1q_jobs():
    """Part 1 사진 문제: 보기 문장 4개를 따로 (p1q/<id>-N.mp3). 사진(app/images/p1/<id>.webp)이 들어온 문제만.
    한 문제의 네 문장은 같은 목소리 (실제 시험처럼 한 사람이 읽는다)."""
    f = os.path.join(ROOT, "data", "part1.json")
    if not os.path.exists(f):
        return []
    out = []
    for q in json.load(open(f, encoding="utf-8"))["items"]:
        if not os.path.exists(os.path.join(ROOT, "app", "images", "p1", f"{q['id']}.webp")):
            continue
        v = voice_for(q["id"])
        for i, o in enumerate(q["o"]):
            out.append((f"p1q/{q['id']}-{i}.mp3", plain(o), v))
    return out


# Part 3·4: 문장마다 따로 (p34/<id>-NN.mp3). 세트마다 여자·남자 목소리를 고정 배정 —
# 미국/영국을 섞고, 3인 대화의 같은 성별 두 사람(W·W2, M·M2)은 서로 다른 목소리로
P34_PAIRS = [("af_heart", "am_liam"), ("bf_alice", "bm_fable"), ("af_heart", "bm_fable"), ("bf_alice", "am_liam")]
OTHER_SEX = {"af_heart": "bf_alice", "bf_alice": "af_heart", "am_liam": "bm_fable", "bm_fable": "am_liam"}


def p34_voices(set_id):
    w, m = P34_PAIRS[int(hashlib.md5(set_id.encode()).hexdigest(), 16) % len(P34_PAIRS)]
    return {"W": w, "M": m, "W2": OTHER_SEX[w], "M2": OTHER_SEX[m]}


def p34_jobs():
    out = []
    for part in ("p3", "p4"):
        f = os.path.join(ROOT, "data", "practice", f"{part}.json")
        if not os.path.exists(f):
            continue
        for st in json.load(open(f, encoding="utf-8")):
            vo = p34_voices(st["id"])
            for i, ln in enumerate(st["lines"], 1):
                out.append((f"p34/{st['id']}-{i:02d}.mp3", plain(ln["en"]), vo[ln["sp"]]))
    return out


OTHER = {"af_heart": "am_liam", "am_liam": "bf_alice", "bf_alice": "am_liam", "bm_fable": "af_heart"}  # 대화의 답하는 사람 목소리


def lc_jobs(items):
    """LC 표현 음성 목록. "Q: … / A: …" 대화는 질문(-q)·정답(-a)·오답(-x1, -x2)을 따로 만든다.
    앱이 질문 → 쉼 → 대답 순서로 이어 재생하고, Part 2 응답 고르기 퀴즈는 질문과 보기 3개를 따로 들려준다.
    보기 3개는 모두 답하는 사람 목소리 하나로 읽어 목소리로 정답이 드러나지 않게 한다."""
    out = []
    for i, it in enumerate(items, 1):
        text = plain(it["e"])
        v = voice_for(f"lc-{i}")
        if text.startswith("Q: ") and " / A: " in text:
            q, a = text[3:].split(" / A: ", 1)
            out.append((f"lc/{i:03d}-q.mp3", q.strip(), v))
            out.append((f"lc/{i:03d}-a.mp3", a.strip(), OTHER[v]))
            for j, x in enumerate(it.get("x", [])[:2], 1):
                out.append((f"lc/{i:03d}-x{j}.mp3", plain(x), OTHER[v]))
        else:
            out.append((f"lc/{i:03d}.mp3", text, v))
    return out


_k = None


def kokoro():
    global _k
    if _k is None:
        import numpy as np
        from kokoro_onnx import Kokoro
        vb = os.path.join(tempfile.gettempdir(), "toeic-kokoro-voices.bin")
        if not os.path.exists(vb):
            v = {os.path.basename(p)[:-4]: np.fromfile(p, dtype=np.float32).reshape(510, 1, 256)
                 for p in glob.glob(os.path.join(KOKORO_DIR, "build", "voices", "*.bin"))
                 if os.path.basename(p)[:2] in ("af", "am", "bf", "bm")}
            with open(vb + ".tmp", "wb") as f:
                np.savez(f, **v)
            os.replace(vb + ".tmp", vb)
        import onnxruntime as ort
        so = ort.SessionOptions()
        # 프로세스마다 스레드 1개 — 여러 프로세스가 코어를 나눠 쓰는 편이 훨씬 빠르다
        so.intra_op_num_threads = int(os.environ.get("KOKORO_THREADS", "1"))
        so.inter_op_num_threads = 1
        sess = ort.InferenceSession(os.path.join(KOKORO_DIR, "build", "kokoro-quantized.onnx"), so, providers=["CPUExecutionProvider"])
        _k = Kokoro.from_session(sess, vb)
    return _k


def synth(job):
    rel, text, voice = job
    out = os.path.join(AUDIO, rel)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    import numpy as np
    lang = "en-gb" if voice.startswith("b") else "en-us"
    samples, sr = kokoro().create(text, voice=voice, speed=0.95 if rel.startswith("w/") else 1.0, lang=lang)
    # 앞뒤 무음 정리 + 짧은 여백
    a = np.asarray(samples, dtype=np.float32)
    nz = np.where(np.abs(a) > 0.01)[0]
    if len(nz):
        a = a[max(0, nz[0] - int(0.05 * sr)): nz[-1] + int(0.12 * sr)]
    pcm = (np.clip(a, -1, 1) * 32767).astype("<i2").tobytes()
    tmp = out + ".tmp.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(sr), "-ac", "1", "-i", "pipe:0",
                    "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-ar", "24000", "-b:a", BITRATE, tmp],
                   input=pcm, check=True)
    os.replace(tmp, out)
    return rel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--words", action="store_true")
    ap.add_argument("--sentences", action="store_true")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--reuse-gemini", action="store_true", help="voca-yun 의 기존 Gemini 단어 음성을 재사용")
    a = ap.parse_args()
    if not a.words and not a.sentences:
        a.words = a.sentences = True
    man = json.load(open(MANIFEST, encoding="utf-8")) if os.path.exists(MANIFEST) else {}
    words, sents = load_entries()
    jobs = []
    if a.words:
        idx = json.load(open(os.path.join(REF, "data", "word-audio-index.json"), encoding="utf-8")) if a.reuse_gemini else {}
        reused = 0
        for wid, w in words:
            rel = f"w/{wid}.mp3"
            out = os.path.join(AUDIO, rel)
            src = idx.get(w.lower())
            srcp = os.path.join(REF, "public", src.lstrip("/")) if src else None
            if srcp and os.path.exists(srcp):
                want = {"text": w, "src": "gemini-kore", "from": src}
                if man.get(rel) != want or not os.path.exists(out):
                    os.makedirs(os.path.dirname(out), exist_ok=True)
                    shutil.copyfile(srcp, out)
                    man[rel] = want
                reused += 1
            else:
                want = {"text": w, "src": "kokoro", "voice": WORD_VOICE, "br": BITRATE}
                if man.get(rel) != want or not os.path.exists(out):
                    jobs.append((rel, w, WORD_VOICE))
        print(f"단어 {len(words)}개 · 기존 음성 재사용 {reused}개")
    if a.sentences:
        # LC 표현은 번호·형식이 바뀌면 옛 파일이 남는다 — 이 앱 음성 폴더(app/audio/lc) 안의 쓰지 않는 파일만 지운다
        want_lc = {rel for rel, _, _ in sents if rel.startswith("lc/")}
        lc_dir = os.path.join(AUDIO, "lc")
        if want_lc and os.path.isdir(lc_dir):
            for f in os.listdir(lc_dir):
                if f.endswith(".mp3") and f"lc/{f}" not in want_lc:
                    os.remove(os.path.join(lc_dir, f))
        for rel in [r for r in man if want_lc and r.startswith("lc/") and r not in want_lc]:
            del man[rel]
        want_p34 = {rel for rel, _, _ in sents if rel.startswith("p34/")}
        p34_dir = os.path.join(AUDIO, "p34")
        if want_p34 and os.path.isdir(p34_dir):
            for f in os.listdir(p34_dir):
                if f.endswith(".mp3") and f"p34/{f}" not in want_p34:
                    os.remove(os.path.join(p34_dir, f))
            for rel in [r for r in man if r.startswith("p34/") and r not in want_p34]:
                del man[rel]
        want_fm = {rel for rel, _, _ in sents if rel.startswith("fm/")}
        fm_dir = os.path.join(AUDIO, "fm")
        if want_fm and os.path.isdir(fm_dir):
            for f in os.listdir(fm_dir):
                if f.endswith(".mp3") and f"fm/{f}" not in want_fm:
                    os.remove(os.path.join(fm_dir, f))
        want_p1q = {rel for rel, _, _ in sents if rel.startswith("p1q/")}
        p1q_dir = os.path.join(AUDIO, "p1q")
        if os.path.isdir(p1q_dir):
            for f in os.listdir(p1q_dir):
                if f.endswith(".mp3") and f"p1q/{f}" not in want_p1q:
                    os.remove(os.path.join(p1q_dir, f))
        for rel in [r for r in man if r.startswith("p1q/") and r not in want_p1q]:
            del man[rel]
        for rel, text, voice in sents:
            want = {"text": text, "src": "kokoro", "voice": voice, "br": BITRATE}
            if man.get(rel) != want or not os.path.exists(os.path.join(AUDIO, rel)):
                jobs.append((rel, text, voice))
    print(f"새로 만들 음성 {len(jobs)}개")
    meta = {rel: {"text": t, "src": "kokoro", "voice": v, "br": BITRATE} for rel, t, v in jobs}
    done = 0
    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        futs = [ex.submit(synth, j) for j in jobs]
        for f in as_completed(futs):
            try:
                rel = f.result()
                man[rel] = meta[rel]
                done += 1
                if done % 25 == 0:
                    print(f"  {done}/{len(jobs)}", flush=True)
                    json.dump(man, open(MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=0, sort_keys=True)
            except Exception as e:
                print("실패:", e, flush=True)
    json.dump(man, open(MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=0, sort_keys=True)
    print(f"완료 {done}/{len(jobs)}")


if __name__ == "__main__":
    main()
