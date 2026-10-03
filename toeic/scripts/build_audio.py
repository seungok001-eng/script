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
# 예문 목소리: 미국 여/남, 영국 여/남 (토익 LC처럼 억양 다양화). 가중치는 품질 순.
SENT_VOICES = ["af_heart", "af_heart", "am_michael", "bf_emma", "bm_george", "af_bella"]


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
            for i, it in enumerate(json.load(open(ex, encoding="utf-8")).get("part1", []), 1):
                sents.append((f"p1/{i:03d}.mp3", plain(it["e"]), voice_for(f"p1-{i}")))
        except Exception:
            pass
    return words, sents


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
                    "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-ar", "24000", "-b:a", "48k", tmp],
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
                want = {"text": w, "src": "kokoro", "voice": WORD_VOICE}
                if man.get(rel) != want or not os.path.exists(out):
                    jobs.append((rel, w, WORD_VOICE))
        print(f"단어 {len(words)}개 · 기존 음성 재사용 {reused}개")
    if a.sentences:
        for rel, text, voice in sents:
            want = {"text": text, "src": "kokoro", "voice": voice}
            if man.get(rel) != want or not os.path.exists(os.path.join(AUDIO, rel)):
                jobs.append((rel, text, voice))
    print(f"새로 만들 음성 {len(jobs)}개")
    meta = {rel: {"text": t, "src": "kokoro", "voice": v} for rel, t, v in jobs}
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
