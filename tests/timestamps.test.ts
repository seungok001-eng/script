import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDurationToSeconds,
  formatSeconds,
  buildTimestamps,
  timestampsToText,
} from "../lib/timestamps.ts";

test("parseDurationToSeconds: 다양한 형식", () => {
  assert.equal(parseDurationToSeconds("12:34"), 12 * 60 + 34);
  assert.equal(parseDurationToSeconds("1:02:03"), 3600 + 2 * 60 + 3);
  assert.equal(parseDurationToSeconds("750"), 750);
  assert.equal(parseDurationToSeconds("12분 30초"), 750);
  assert.equal(parseDurationToSeconds("10분"), 600);
  assert.equal(parseDurationToSeconds(""), null);
  assert.equal(parseDurationToSeconds("abc"), null);
});

test("formatSeconds: 표기", () => {
  assert.equal(formatSeconds(0), "0:00");
  assert.equal(formatSeconds(83), "1:23");
  assert.equal(formatSeconds(3723), "1:02:03");
});

test("buildTimestamps: 글자수 비율로 배분, 첫 마커는 0:00", () => {
  const segs = buildTimestamps(
    [
      { label: "오프닝", chars: 100 },
      { label: "챕터 1", chars: 100 },
      { label: "챕터 2", chars: 200 },
    ],
    400, // 총 400초, 총 400자 → 1자=1초
  );
  assert.equal(segs.length, 3);
  assert.equal(segs[0].time, "0:00");
  assert.equal(segs[1].seconds, 100); // 0.25*400
  assert.equal(segs[2].seconds, 200); // 0.5*400
  assert.equal(segs[2].time, "3:20");
});

test("buildTimestamps: 길이 0 또는 글자수 0이면 빈 배열", () => {
  assert.deepEqual(buildTimestamps([{ label: "a", chars: 0 }], 100), []);
  assert.deepEqual(buildTimestamps([{ label: "a", chars: 100 }], 0), []);
});

test("timestampsToText: 줄 단위 포맷", () => {
  const text = timestampsToText([
    { time: "0:00", seconds: 0, label: "오프닝" },
    { time: "1:23", seconds: 83, label: "챕터 1" },
  ]);
  assert.equal(text, "0:00 오프닝\n1:23 챕터 1");
});
