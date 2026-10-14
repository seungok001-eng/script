"""문법 보강분 합치기: <dir>/out/<ID>.json → data/practice/grammar.json

- g01~g30: lesson_add 를 lesson 뒤에, qs 를 기존 문항 뒤에 붙인다 (기존 문항·순서는 그대로 → 모의고사·진단 고정)
- b01~b04 (문법 기초): 새 주제로 맨 앞에 넣는다
다시 돌려도 안전: 이미 들어간 문항 id 는 건너뛴다.
사용: python3 toeic/scripts/merge_grammar.py <작업 폴더(in/ · out/ 가 있는 곳)>
"""
import json, os, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = sys.argv[1]
path = os.path.join(ROOT, "data", "practice", "grammar.json")
topics = json.load(open(path, encoding="utf-8"))
by_id = {t["id"]: t for t in topics}
added_q = added_l = 0
basics = []
for f in sorted(glob.glob(os.path.join(G, "out", "*.json"))):
    o = json.load(open(f, encoding="utf-8"))
    tid = o["id"]
    inp = json.load(open(os.path.join(G, "in", tid + ".json"), encoding="utf-8"))
    if inp.get("basic"):
        t = by_id.get(tid) or {"id": tid, "title": inp["title"], "cat": inp["cat"], "lesson": [], "trap": "", "qs": []}
        if tid not in by_id: basics.append(t); by_id[tid] = t
        if not t["lesson"]: t["lesson"] = o["lesson_add"]; added_l += len(o["lesson_add"])
        t["trap"] = t["trap"] or o.get("trap", "")
    else:
        t = by_id[tid]
        have_h = {l["h"] for l in t["lesson"]}
        for l in o.get("lesson_add", []):
            if l["h"] not in have_h: t["lesson"].append(l); added_l += 1
    have = {q["id"] for q in t["qs"]}
    for q in o["qs"]:
        if q["id"] in have: continue
        t["qs"].append({k: q[k] for k in ("s", "o", "a", "lv", "exp", "id")})
        added_q += 1
topics = sorted(basics, key=lambda t: t["id"]) + topics
json.dump(topics, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
n = sum(len(t["qs"]) for t in topics)
print(f"문법: 주제 {len(topics)}개 · 문항 {n}개 (이번에 문항 {added_q}개 · 강의 {added_l}개 추가)")
