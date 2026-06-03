import test from "node:test";
import assert from "node:assert/strict";
import {
  splitChapters,
  parseIntroSets,
  previousModuleText,
  joinChaptersBelow,
  pairFilled,
} from "../lib/chapters.ts";

test("splitChapters: 마커 기준으로 개별 챕터 분리", () => {
  const text = "[챕터 1]\n첫 챕터 본문\n\n[챕터 2]\n둘째 챕터 본문";
  const r = splitChapters(text, 1);
  assert.equal(Object.keys(r).length, 2);
  assert.match(r[1], /첫 챕터/);
  assert.match(r[2], /둘째 챕터/);
});

test("splitChapters: 마커 없으면 fallback 챕터에 통째로", () => {
  const r = splitChapters("마커 없는 본문", 3);
  assert.equal(Object.keys(r).length, 1);
  assert.match(r[3], /마커 없는/);
});

test("splitChapters: 본문에 박힌 '줄바꿈' 지시어 라인 제거", () => {
  const r = splitChapters("[챕터 1]\n첫 챕터\n줄바꿈\n\n줄바꿈\n[챕터 2]\n둘째", 1);
  assert.doesNotMatch(r[1], /줄바꿈/);
  assert.match(r[1], /첫 챕터/);
  assert.match(r[2], /둘째/);
});

test("splitChapters: 공백 허용 마커도 인식", () => {
  const r = splitChapters("[ 챕터  5 ] 내용", 5);
  assert.ok(r[5]);
});

test("parseIntroSets: 세트 카드 파싱", () => {
  const text = `### 세트 1
제목: 첫 제목
썸네일: 첫 썸네일
인트로:
인트로 본문 1

### 세트 2
제목: 둘째 제목
썸네일: 둘째 썸네일
인트로:
인트로 본문 2`;
  const sets = parseIntroSets(text);
  assert.equal(sets.length, 2);
  assert.equal(sets[0].title, "첫 제목");
  assert.equal(sets[0].thumbnail, "첫 썸네일");
  assert.match(sets[0].text, /인트로 본문 1/);
  assert.equal(sets[1].title, "둘째 제목");
});

test("parseIntroSets: 트레일링 '## 몰입 추천'이 마지막 세트 본문을 오염시키지 않음", () => {
  const text = `### 세트 1
제목: 첫 제목
썸네일: 첫 썸네일
인트로:
인트로 본문 1

## 몰입 추천
1순위: 세트 1 - 강렬함`;
  const sets = parseIntroSets(text);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].text.trim(), "인트로 본문 1");
  assert.doesNotMatch(sets[0].text, /몰입 추천|1순위/);
});

test("previousModuleText: 직전 모듈 2챕터만 반환(컨텍스트 바운딩)", () => {
  const chapters = { 1: "ch1", 2: "ch2", 3: "ch3", 4: "ch4", 5: "ch5", 6: "ch6" };
  // moduleIdx 0 → 직전 없음
  assert.equal(previousModuleText(chapters, 0), "");
  // moduleIdx 1(챕터 3-4 생성) → 직전 모듈 = 챕터 1-2
  assert.equal(previousModuleText(chapters, 1), "ch1\n\nch2");
  // moduleIdx 3(챕터 7-8 생성) → 직전 모듈 = 챕터 5-6 (1~4는 포함 안 됨)
  assert.equal(previousModuleText(chapters, 3), "ch5\n\nch6");
});

test("joinChaptersBelow: 지정 미만 챕터 연결", () => {
  const chapters = { 1: "a", 2: "b", 3: "c" };
  assert.equal(joinChaptersBelow(chapters, 3), "a\n\nb");
});

test("pairFilled: 두 챕터 모두 채워졌는지", () => {
  assert.equal(pairFilled({ 1: "x", 2: "y" }, [1, 2]), true);
  assert.equal(pairFilled({ 1: "x" }, [1, 2]), false);
  assert.equal(pairFilled({ 1: "x", 2: "  " }, [1, 2]), false);
});
