// ─────────────────────────────────────────────────────────────
// 챕터 분할/조립 + 인트로 세트 파싱 유틸 (6·7·5단계 공용)
// ─────────────────────────────────────────────────────────────

import type { IntroSet, ScriptProjectState } from "./types";

export const CHAPTER_PAIRS: [number, number][] = [
  [1, 2],
  [3, 4],
  [5, 6],
  [7, 8],
];

/**
 * "[챕터 N]" 마커 기준으로 본문을 개별 챕터로 분리한다.
 * 마커가 없으면 fallbackChapter 키 하나에 통째로 담는다.
 */
/** 모델이 지시어를 그대로 받아써 본문에 남는 '줄바꿈' 등 군더더기 라인 제거 */
export function sanitizeScript(text: string): string {
  return text.replace(/^[\s>*-]*줄바꿈[\s.!]*$/gm, "").replace(/\n{3,}/g, "\n\n");
}

export function splitChapters(
  text: string,
  fallbackChapter: number,
): Record<number, string> {
  text = sanitizeScript(text);
  const result: Record<number, string> = {};
  const regex = /\[\s*챕터\s*(\d+)\s*\]/g;
  const matches: { num: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    matches.push({ num: Number(m[1]), index: m.index });
  }

  if (matches.length === 0) {
    result[fallbackChapter] = text.trim();
    return result;
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    result[matches[i].num] = text.slice(start, end).trim();
  }
  return result;
}

/** 지정 챕터 번호 미만의 완성 본문을 연결(컨텍스트 고립용) */
export function joinChaptersBelow(
  chapters: { [key: number]: string },
  below: number,
): string {
  return Object.keys(chapters)
    .map(Number)
    .filter((n) => n < below)
    .sort((a, b) => a - b)
    .map((n) => chapters[n])
    .join("\n\n");
}

/**
 * 직전 모듈(2챕터)의 본문만 반환한다.
 * 컨텍스트가 누적되지 않도록 본문은 항상 직전 모듈로 바운딩한다.
 * (전 챕터에 걸친 떡밥 회수는 별도의 '떡밥 원장'이 담당한다.)
 */
export function previousModuleText(
  chapters: { [key: number]: string },
  moduleIdx: number,
): string {
  if (moduleIdx <= 0) return "";
  const p = CHAPTER_PAIRS[moduleIdx - 1];
  return [chapters[p[0]], chapters[p[1]]].filter(Boolean).join("\n\n");
}

/** 챕터 맵 → 전체 대본 문자열 */
export function joinAllChapters(chapters: { [key: number]: string }): string {
  return Object.keys(chapters)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => chapters[n])
    .join("\n\n");
}

export function countChapters(chapters: { [key: number]: string }): number {
  return Object.values(chapters).filter((c) => c && c.trim()).length;
}

export function totalChars(chapters: { [key: number]: string }): number {
  return Object.values(chapters).reduce((sum, c) => sum + (c?.length ?? 0), 0);
}

/**
 * 5단계 인트로 세트 파싱.
 * "### 세트 N / 제목: / 썸네일: / 인트로:" 형식을 카드 객체 배열로 변환.
 */
export function parseIntroSets(text: string): IntroSet[] {
  const blocks = text.split(/#{2,4}\s*세트\s*\d+/g).map((b) => b.trim());
  const sets: IntroSet[] = [];
  for (const block of blocks) {
    if (!block) continue;
    const title = block.match(/제목\s*[:：]\s*(.+)/)?.[1]?.trim() ?? "";
    const thumbnail = block.match(/썸네일\s*[:：]\s*(.+)/)?.[1]?.trim() ?? "";
    // 인트로 본문은 다음 마크다운 헤더(예: 트레일링 '## 몰입 추천') 직전까지만 캡처
    const introMatch = block.match(/인트로\s*[:：]\s*([\s\S]+?)(?=\n#{1,4}\s|$)/);
    const introText = introMatch?.[1]?.trim() ?? "";
    if (title || thumbnail || introText) {
      sets.push({ title, thumbnail, text: introText });
    }
  }
  return sets;
}

/** 6/7단계 진행 표시용: 특정 pair 챕터가 채워졌는지 */
export function pairFilled(
  chapters: { [key: number]: string },
  pair: [number, number],
): boolean {
  return Boolean(chapters[pair[0]]?.trim() && chapters[pair[1]]?.trim());
}

export function allChaptersReady(state: ScriptProjectState, which: "draft" | "final"): boolean {
  const map = which === "draft" ? state.draftChapters : state.finalChapters;
  return [1, 2, 3, 4, 5, 6, 7, 8].every((n) => Boolean(map[n]?.trim()));
}
