import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTopicCards,
  parseProfileCards,
  parseProfileRanks,
} from "../lib/topics.ts";

const topicSample = `리서치 결과 아래와 같이 추천합니다.

## 주제 1: 한국 방산 수출 신기록
- 시의성: 2026년 폴란드 2차 계약 임박
- 후킹 포인트: K9 자주포 유럽 표준화

## 주제 2: 엔비디아 HBM 주도권
- 시의성: 차세대 HBM 양산 발표
- 후킹 포인트: 메모리 패권 전환

## 추천 종합
1순위는 주제 1입니다. 이유는 ...`;

test("parseTopicCards: 주제만 카드로 분리하고 추천 종합/프리앰블은 제외", () => {
  const cards = parseTopicCards(topicSample);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].badge, "주제 1");
  assert.equal(cards[0].title, "한국 방산 수출 신기록");
  assert.match(cards[0].body, /시의성/);
  assert.equal(cards[1].badge, "주제 2");
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

const profileSample = `## 프로필 1: 패권주의 전략가
- 시점: 워싱턴 인사이더
- 말투: 단호하고 냉소적

## 프로필 2: 냉철한 글로벌 자본가
- 시점: 월가 헤지펀드 매니저
- 말투: 숫자로 말함`;

test("parseProfileCards: 프로필을 카드로 분리", () => {
  const cards = parseProfileCards(profileSample);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].badge, "프로필 1");
  assert.equal(cards[0].title, "패권주의 전략가");
  assert.match(cards[1].body, /월가/);
});

test("parseProfileRanks: 몰입 추천 1·2순위와 이유 추출", () => {
  const text = `## 프로필 1: A\n## 프로필 2: B\n\n## 몰입 추천\n1순위: 프로필 2 - 외국인 시점이 강렬\n2순위: 프로필 1 - 안정적 신뢰감`;
  const r = parseProfileRanks(text);
  assert.equal(r.first, 2);
  assert.equal(r.second, 1);
  assert.match(r.reasons[2], /외국인 시점/);
  assert.match(r.reasons[1], /신뢰감/);
});

test("parseProfileRanks: 추천 섹션 없으면 빈 결과", () => {
  const r = parseProfileRanks("## 프로필 1: A");
  assert.equal(r.first, undefined);
  assert.deepEqual(r.reasons, {});
});
