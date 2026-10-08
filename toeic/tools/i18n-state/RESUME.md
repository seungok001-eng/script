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
