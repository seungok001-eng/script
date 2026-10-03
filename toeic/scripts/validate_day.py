"""day-XX.json 검증: python3 toeic/scripts/validate_day.py 1 2 3  (인자 없으면 존재하는 전부)"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN = json.load(open(os.path.join(ROOT, "data", "plan.json"), encoding="utf-8"))
POS = {"n", "v", "adj", "adv", "phr", "prep", "conj"}
HANGUL = re.compile(r"[가-힣]")


def check(day):
    path = os.path.join(ROOT, "data", "days", f"day-{day:02d}.json")
    errs = []
    if not os.path.exists(path):
        return [f"없음: {path}"]
    try:
        data = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        return [f"JSON 오류: {e}"]
    want = PLAN[day - 1]["words"]
    got = [e.get("w") for e in data]
    if got != want:
        missing = [w for w in want if w not in got]
        extra = [w for w in got if w not in want]
        errs.append(f"단어 목록/순서 불일치 missing={missing} extra={extra}" if (missing or extra) else "단어 순서 불일치")
    answers = []
    for e in data:
        w = e.get("w", "?")
        p = lambda m: errs.append(f"[{w}] {m}")
        if e.get("pos") not in POS: p(f"pos={e.get('pos')}")
        m = e.get("m")
        if not (isinstance(m, list) and 1 <= len(m) <= 3 and all(HANGUL.search(x) for x in m)): p("m")
        if e.get("tier") not in (1, 2, 3): p("tier")
        if not (isinstance(e.get("parts"), list) and e["parts"] and all(x in range(1, 8) for x in e["parts"])): p("parts")
        ex = e.get("ex", "")
        if ex.count("*") < 2 or ex.count("*") % 2: p("ex 강조 * 누락/홀수")
        n = len(re.sub(r"\*", "", ex).split())
        if not 6 <= n <= 24: p(f"ex 길이 {n}")
        if re.search(r"[“”‘’]", ex): p("ex 굽은 따옴표")
        if not HANGUL.search(e.get("exKo", "")): p("exKo")
        col = e.get("col", [])
        if not (1 <= len(col) <= 3 and all(c.get("e") and HANGUL.search(c.get("k", "")) for c in col)): p("col")
        der = e.get("der", [])
        if len(der) > 3 or any(not (d.get("w") and d.get("pos") in POS and HANGUL.search(d.get("m", ""))) for d in der): p("der")
        if any(d.get("w", "").lower() == w.lower() for d in der): p("der에 표제어")
        if not isinstance(e.get("para"), list): p("para")
        if not isinstance(e.get("ant", ""), str): p("ant")
        if not HANGUL.search(e.get("tip", "")): p("tip")
        q = e.get("q") or {}
        s = q.get("s", "")
        if s.count("-------") != 1 or "--------" in s: p("q.s 빈칸(-------) 정확히 1개")
        o = q.get("o", [])
        if len(o) != 4 or len(set(x.lower() for x in o)) != 4: p("q.o 4개/중복")
        if q.get("a") not in (0, 1, 2, 3): p("q.a")
        else: answers.append(q["a"])
        if not HANGUL.search(q.get("k", "")): p("q.k")
        if re.sub(r"\*", "", ex).strip().lower() == s.replace("-------", "").strip().lower(): p("q.s가 예문과 같음")
    if answers:
        share0 = answers.count(0) / len(answers)
        if share0 > 0.45: errs.append(f"정답 위치 쏠림: a=0 비율 {share0:.0%}")
    tiers = [e.get("tier") for e in data]
    return errs


if __name__ == "__main__":
    days = [int(x) for x in sys.argv[1:]] or [d["day"] for d in PLAN if os.path.exists(os.path.join(ROOT, "data", "days", f"day-{d['day']:02d}.json"))]
    bad = 0
    for d in days:
        errs = check(d)
        print(f"Day {d:02d}: {'OK' if not errs else str(len(errs)) + ' 문제'}")
        for x in errs[:40]:
            print("   ", x)
        bad += bool(errs)
    sys.exit(1 if bad else 0)
