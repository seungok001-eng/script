"""Part 6·7 보강분 합치기: <dir>/out/p6*.json · p7*.json → data/practice/p6.json · p7.json (기존 세트 뒤에 id 순서로 붙인다)
다시 돌려도 안전: 이미 들어간 id 는 새 내용으로 바꾼다 (고친 것 반영). 문서 종류 이름은 기존 이름으로 맞춘다.
사용: python3 toeic/scripts/merge_rc.py <작업 폴더(out/ 가 있는 곳)>
"""
import json, os, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = sys.argv[1]
DOC = {"청구서": "송장", "신청서": "양식", "후기": "리뷰", "온라인 후기": "리뷰"}
for part in ("p6", "p7"):
    path = os.path.join(ROOT, "data", "practice", part + ".json")
    sets = json.load(open(path, encoding="utf-8"))
    by = {x["id"]: i for i, x in enumerate(sets)}
    new = []
    for f in sorted(glob.glob(os.path.join(G, "out", part + "*.json"))):
        new += json.load(open(f, encoding="utf-8"))
    for x in sorted(new, key=lambda x: x["id"]):
        if "doc" in x: x["doc"] = DOC.get(x["doc"], x["doc"])
        for d in x.get("docs", []): d["doc"] = DOC.get(d["doc"], d["doc"])
        if x["id"] in by: sets[by[x["id"]]] = x
        else: by[x["id"]] = len(sets); sets.append(x)
    json.dump(sets, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{part}: {len(sets)}세트 · {sum(len(x['qs']) for x in sets)}문제 (보강 {len(new)}세트)")
