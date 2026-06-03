import test from "node:test";
import assert from "node:assert/strict";
import { analyzeScript } from "../lib/qa.ts";

test("analyzeScript: 금지어 탐지", () => {
  const m = analyzeScript("그런데 말입니다 이것은 함정입니다.");
  assert.ok(m.bannedHits.some((h) => h.phrase === "그런데 말입니다" && h.count === 1));
  assert.ok(m.warnings.some((w) => w.includes("금지어")));
});

test("analyzeScript: 특수기호/괄호 탐지(챕터 마커는 허용)", () => {
  const m = analyzeScript("[챕터 1] 본문에 (괄호)가 있습니다.");
  assert.ok(m.specialCharCount >= 2); // ( 와 )
  assert.equal(m.hasChapterMarker, true);
});

test("analyzeScript: 챕터 마커 부재 경고", () => {
  const m = analyzeScript("마커 없는 평범한 본문입니다.");
  assert.equal(m.hasChapterMarker, false);
  assert.ok(m.warnings.some((w) => w.includes("머리말 마커")));
});

test("analyzeScript: 어미 분류 비율 계산", () => {
  const text =
    "이것은 사실입니다. 정말 그렇죠. 어떻게 될까요? 바로 그 부분 말입니다. 확실합니다. 맞잖아요.";
  const m = analyzeScript(text);
  assert.equal(m.endings.total, 6);
  assert.ok(m.endings.question >= 1);
  assert.ok(m.endings.malimnida >= 1);
  assert.ok(m.endings.seumnida >= 1);
  assert.ok(m.endings.jyo >= 1);
});

test("analyzeScript: 분량 범위 경고", () => {
  const short = analyzeScript("짧음", { minChars: 100, maxChars: 200 });
  assert.equal(short.withinRange, false);
  assert.ok(short.warnings.some((w) => w.includes("분량")));

  const ok = analyzeScript("가".repeat(150), { minChars: 100, maxChars: 200 });
  assert.equal(ok.withinRange, true);
});
