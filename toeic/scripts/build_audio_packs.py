"""(선택) 웹 미리보기용 음성 묶음 만들기 — 파일 개수 제한이 있는 호스팅에 올릴 때만 쓴다.

audio/w, audio/s 를 Day별 묶음(pack-01.mp3 … pack-30.mp3)으로, audio/p1 을 pack-p1.mp3 으로 합치고
js/audio-packs.js (window.VOCA_AUDIO_PACKS 색인)를 만든다. index.html 에서 app.js 보다 먼저 불러오면
앱이 묶음에서 잘라 재생한다.
사용: python3 toeic/scripts/build_audio_packs.py <출력 폴더>
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, "app", "audio")
out = sys.argv[1]
os.makedirs(os.path.join(out, "audio"), exist_ok=True)
os.makedirs(os.path.join(out, "js"), exist_ok=True)
groups = {}
for sub in ("w", "s", "p1", "lc"):
    d = os.path.join(AUDIO, sub)
    for f in (sorted(os.listdir(d)) if os.path.isdir(d) else []):
        if f.endswith(".mp3"):
            key = "p1" if sub == "p1" else f"lc{int(f[:3]) // 100}" if sub == "lc" else f[:2]  # LC 는 100개씩 묶음
            groups.setdefault(key, []).append(f"{sub}/{f}")
index = {}
for key, rels in groups.items():
    name = f"pack-{key}.mp3"  # 이어 붙인 mp3 도 mp3 — 어디서나 mp3 로 서빙된다
    off = 0
    with open(os.path.join(out, "audio", name), "wb") as fo:
        for rel in rels:
            data = open(os.path.join(AUDIO, rel), "rb").read()
            fo.write(data)
            index[rel] = [name, off, len(data)]
            off += len(data)
with open(os.path.join(out, "js", "audio-packs.js"), "w") as f:
    f.write("window.VOCA_AUDIO_PACKS=" + json.dumps({"index": index}, separators=(",", ":")) + ";\n")
print(f"묶음 {len(groups)}개, 음성 {len(index)}개")
