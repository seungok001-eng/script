# 번역 작업 이어가기 (zh-TW · vi · fr 실전/모의고사 해설)

완료: 2026-10-08. 6개 언어(en · ja · vi · zh-TW · es · fr) 모두 100% 번역, 앱에 표시 중.
남은 일: 없음. 콘텐츠를 추가·수정하면 src 를 다시 뽑아 바뀐 키만 번역하면 된다.

## 복원
```sh
mkdir -p "$SCRATCH" && tar -xJf toeic/tools/i18n-state/tr-state.tar.xz -C "$SCRATCH"
```
`tr/` 안: `JOB.md`(작업 지시), `TRANSLATE.md`(규칙), `check.py`(검사), `assemble.py <lang>`(data/i18n 생성),
`pop.sh N`(대기열에서 꺼내기), `out/<lang>/`(완료 묶음), `out/<lang>-glossary.md`(용어·표기 규칙), `NOTES.txt`(남은 정리 작업).

## 완료 후 언어마다
1. NOTES.txt 의 해당 언어 정리 (zh-TW: 正解→答案, 醫師/Dr. 통일 · vi: 거리 이름 영어로 · fr: 축약, la Dre, 층수)
2. `python3 assemble.py <lang>` → `node toeic/scripts/i18n.mjs build` (98% 이상이면 앱에 표시)
3. 화면 점검(langtour.mjs) · 단위 테스트 · e2e → 커밋

## 2026-10-14 문법 보강(1,500문항) 번역
- 새 키만 묶음으로: `python3 tr/gram_chunks.py` → src/p-31..36 (영어는 src-en/, 예문 해석은 out/en/_prefill_gram.json)
- 번역 후 앱 파일에 합치기: `python3 tr/merge_p.py <lang>...` (기존 ui·labels 는 건드리지 않는다)
- 주의: `assemble.py` 는 out/<lang>-ui.json 만으로 ui 를 다시 만들어, 나중에 data/i18n 에 직접 넣은 사업자 정보·출시 할인 문구가 빠진다. 새로 합칠 때는 merge_p.py 를 쓴다.
- `gram/`: 문항 작성 규칙(SPEC.md), 겹침 검사(check.py), 별도 풀이 검증(SOLVE.md · blind.py), 결과(out/)

## 2026-10-14 Part 5 어휘 900 · Part 6 100 · Part 7 140세트 번역
- 새 키 묶음: `python3 tr/rc_chunks.py` → src/p-41..52 (영어는 src-en/, 지문·문항 영어는 out/en/_prefill_rc.json), 화면 문구는 src-ui3/
- 합치기: `python3 tr/merge_p.py <lang>...` (p-31..59 범위) · 화면 문구 out/<L>-ui3-1.json 은 src.ko.json 의 ui/labels 에 있는 키로 넣는다
- 번역 뒤 원문 고침은 `tr/fix_src.py` 참고 (원문과 번역에 같은 고침을 적용; 키는 경로라 그대로)
- 6개 언어 모두 100% (화면 1051 · 분류 521 · 단어 33553 · 실전 18408)
