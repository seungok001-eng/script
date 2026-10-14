"""Part 5 어휘 모으기: <dir>/out/<vNN>.json + <dir>/in/<vNN>.json → data/practice/vocab5.json

주제마다 {id, title, cat, lesson, colloc, trap, qs}. 지금 있는 out 파일만으로 만들고, 다시 돌려도 같은 결과(통째로 다시 쓴다).
사용: python3 toeic/scripts/merge_vocab5.py <작업 폴더(in/ · out/ 가 있는 곳)>
"""
import json, os, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = sys.argv[1]
path = os.path.join(ROOT, "data", "practice", "vocab5.json")
topics = []
for f in sorted(glob.glob(os.path.join(V, "out", "v*.json"))):
    o = json.load(open(f, encoding="utf-8"))
    tid = o["id"]
    inp = json.load(open(os.path.join(V, "in", tid + ".json"), encoding="utf-8"))
    qs = [{k: q[k] for k in ("id", "s", "o", "a", "lv", "exp")} for q in o["qs"]]
    topics.append({
        "id": tid, "title": inp["title"], "cat": inp["cat"],
        "lesson": [{"h": l["h"], "t": l["t"], "ex": [{"en": e["en"], "ko": e["ko"]} for e in l.get("ex", [])]} for l in o["lesson"]],
        "colloc": [{"en": c["en"], "ko": c["ko"]} for c in o.get("colloc", [])],
        "trap": o.get("trap", ""), "qs": qs,
    })
topics.sort(key=lambda t: t["id"])
with open(path, "w", encoding="utf-8") as fh:
    fh.write(json.dumps(topics, indent=1, ensure_ascii=False) + "\n")
n = sum(len(t["qs"]) for t in topics)
print(f"Part 5 어휘: 주제 {len(topics)}개 ({', '.join(t['id'] for t in topics)}) · 문항 {n}개")
