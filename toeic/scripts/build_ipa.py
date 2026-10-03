"""CMU 발음 사전(ARPAbet) → 미국식 IPA. 결과: data/ipa.json {단어(소문자): IPA}
품사에 따라 강세가 달라지는 단어(permit, export …)는 명사면 앞 강세, 동사면 뒤 강세 발음을 고른다.
사용: python3 toeic/scripts/build_ipa.py [cmudict 경로]   (기본: VOCARD의 data/pron/cmudict.txt)
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DICT = sys.argv[1] if len(sys.argv) > 1 else "/home/user/yun/vocard/data/pron/cmudict.txt"

V = {"AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ", "EH": "ɛ", "ER": "ɜr", "EY": "eɪ",
     "IH": "ɪ", "IY": "i", "OW": "oʊ", "OY": "ɔɪ", "UH": "ʊ", "UW": "u"}
C = {"B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h", "JH": "dʒ", "K": "k", "L": "l",
     "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "r", "S": "s", "SH": "ʃ", "T": "t", "TH": "θ", "V": "v",
     "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ"}
ONSETS = {"pl", "pr", "bl", "br", "tr", "dr", "kl", "kr", "gl", "gr", "ɡl", "ɡr", "fl", "fr", "θr", "ʃr", "sp", "st", "sk",
          "sm", "sn", "sl", "sw", "tw", "kw", "dw", "pj", "bj", "kj", "mj", "fj", "vj", "hj", "spr", "str", "skr", "spl", "skw"}


def to_ipa(phones):
    syl = []  # (onset consonants list, vowel, stress, coda handled by next onset split)
    cons = []
    units = []
    for p in phones:
        base = re.sub(r"\d", "", p)
        if base in V:
            st = int(p[-1]) if p[-1].isdigit() else 0
            v = V[base]
            if base == "AH" and st == 0:
                v = "ə"
            if base == "ER" and st == 0:
                v = "ər"
            units.append(("C", cons))
            units.append(("V", v, st))
            cons = []
        else:
            cons.append(C.get(base, base.lower()))
    units.append(("C", cons))
    out = []
    first_vowel = True
    for i, u in enumerate(units):
        if u[0] != "C":
            continue
        cs = u[1]
        nxt = units[i + 1] if i + 1 < len(units) else None
        if not nxt:
            out.extend(cs)
            continue
        _, v, st = nxt
        mark = "ˈ" if st == 1 else "ˌ" if st == 2 else ""
        # 앞 음절 끝(코다)과 다음 음절 첫소리(온셋) 나누기
        if first_vowel:
            coda, onset = [], cs
        else:
            k = 0
            for n in (3, 2, 1):
                if len(cs) >= n and ("".join(cs[-n:]) in ONSETS or n == 1):
                    k = n
                    break
            coda, onset = cs[:len(cs) - k], cs[len(cs) - k:]
        out.extend(coda)
        out.append(mark)
        out.extend(onset)
        out.append(v)
        first_vowel = False
    s = "".join(out)
    if s.count("ˈ") + s.count("ˌ") == 1 and len(re.findall("[ˈˌ]", s)) == 1 and sum(1 for u in units if u[0] == "V") == 1:
        s = s.replace("ˈ", "").replace("ˌ", "")  # 한 음절 단어는 강세 표시 생략
    return s


def load():
    d = {}
    for line in open(DICT, encoding="utf-8"):
        if not line or line.startswith("#") or "\t" not in line:
            continue
        w, p = line.rstrip("\n").split("\t", 1)
        d[w] = [x.split() for x in p.split("|")]
    return d


def pick(prons, pos):
    if len(prons) == 1 or pos not in ("n", "v", "adj"):
        return prons[0]
    def first_stress(p):
        vs = [x for x in p if x[-1].isdigit()]
        return vs[0][-1] == "1" if vs else False
    if pos in ("n", "adj"):
        c = [p for p in prons if first_stress(p)]
    else:
        c = [p for p in prons if not first_stress(p)]
    return (c or prons)[0]


def main():
    d = load()
    plan = json.load(open(os.path.join(ROOT, "data", "plan.json"), encoding="utf-8"))
    pos_of = {}
    for day in plan:
        p = os.path.join(ROOT, "data", "days", f"day-{day['day']:02d}.json")
        if os.path.exists(p):
            try:
                for e in json.load(open(p, encoding="utf-8")):
                    pos_of[e["w"]] = e.get("pos")
            except Exception:
                pass
    res, miss = {}, []
    for day in plan:
        for w in day["words"]:
            key = w.lower().replace("é", "e")
            if " " in key:
                continue  # 구·숙어는 음성으로 듣는다
            parts = key.replace("-", " ").split()
            ipas = []
            for part in parts:
                pr = d.get(part)
                if pr:
                    ipas.append(to_ipa(pick(pr, pos_of.get(w))))
                    continue
                # 사전에 없는 합성어는 두 단어로 나눠 본다 (whiteboard = white + board)
                split = next(((part[:i], part[i:]) for i in range(3, len(part) - 2)
                              if d.get(part[:i]) and d.get(part[i:])), None)
                if not split:
                    ipas = None
                    break
                a_, b_ = (to_ipa(d[x][0]) for x in split)
                # 합성어는 앞 단어에 주강세, 뒤 단어는 보조 강세
                ipas.append(a_ + b_.replace("ˈ", "ˌ") if "ˈ" in a_ or "ˌ" in a_ else "ˈ" + a_ + b_.replace("ˈ", "ˌ"))
            if ipas:
                res[w] = "/" + "-".join(ipas) + "/" if "-" in key else "/" + ipas[0] + "/"
            else:
                miss.append(w)
    json.dump(res, open(os.path.join(ROOT, "data", "ipa.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0, sort_keys=True)
    print(f"IPA {len(res)}개, 사전에 없음 {len(miss)}: {miss}")


if __name__ == "__main__":
    main()
