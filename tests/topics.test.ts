import test from "node:test";
import assert from "node:assert/strict";
import { parseTopicCards } from "../lib/topics.ts";

const sample = `리서치 결과 아래와 같이 추천합니다.

## 주제 1: 한국 방산 수출 신기록
- 시의성: 2026년 폴란드 2차 계약 임박
- 후킹 포인트: K9 자주포 유럽 표준화

## 주제 2: 엔비디아 HBM 주도권
- 시의성: 차세대 HBM 양산 발표
- 후킹 포인트: 메모리 패권 전환

## 추천 종합
1순위는 주제 1입니다. 이유는 ...`;

test("parseTopicCards: 주제만 카드로 분리하고 추천 종합은 제외", () => {
  const cards = parseTopicCards(sample);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].n, 1);
  assert.equal(cards[0].title, "한국 방산 수출 신기록");
  assert.match(cards[0].body, /시의성/);
  assert.equal(cards[1].n, 2);
  assert.match(cards[1].full, /엔비디아 HBM/);
});

test("parseTopicCards: 빈 입력은 빈 배열", () => {
  assert.deepEqual(parseTopicCards(""), []);
  assert.deepEqual(parseTopicCards("   "), []);
});

test("parseTopicCards: 헤더 변형(### / 전각 콜론) 허용", () => {
  const cards = parseTopicCards("### 주제 1： 제목입니다\n- 내용");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].title, "제목입니다");
});
