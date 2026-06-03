// ─────────────────────────────────────────────────────────────
// 선택 카드 파서 — AI 출력(마크다운)을 개별 선택 카드로 분리
// ─────────────────────────────────────────────────────────────
//
// 1단계 추천 주제(## 주제 N: …)와 3단계 화자 프로필(## 프로필 N: …)처럼
// 여러 후보를 카드로 나눠 클릭 선택할 수 있게 한다.
// '추천 종합'·'요약' 같은 마무리 섹션과 프리앰블은 카드에서 제외한다.

export interface Card {
  badge: string; // "주제 1" | "프로필 A" 등 헤더 앞 라벨
  title: string; // 라벨을 제거한 제목
  body: string; // 헤더 아래 본문(불릿)
  full: string; // 헤더+본문 원문 (확정값으로 사용)
}

// labelRe: 헤더 앞부분에 매칭할 라벨 정규식 (예: 주제 번호, 프로필 번호 패턴)
export function parseCards(text: string, labelRe: RegExp): Card[] {
  if (!text?.trim()) return [];
  // 마크다운 헤더(#, ##, ###) 단위로 분할
  const parts = text.split(/\n(?=#{1,3}\s)/);
  const cards: Card[] = [];
  for (const part of parts) {
    const lines = part.split("\n");
    const header = lines[0]
      .replace(/^#{1,3}\s*/, "")
      .replace(/\*+/g, "")
      .trim();
    const m = header.match(labelRe);
    if (!m) continue; // 프리앰블·'추천 종합' 등 라벨 불일치 섹션 제외
    const badge = m[0].trim();
    const title =
      header.slice(m[0].length).replace(/^\s*[:：.\-)]\s*/, "").trim() || badge;
    const body = lines.slice(1).join("\n").trim();
    cards.push({ badge, title, body, full: part.trim() });
  }
  return cards;
}

/** 1단계 추천 주제 카드 (## 주제 N: …) */
export function parseTopicCards(text: string): Card[] {
  return parseCards(text, /^주제\s*\d*/);
}

/** 3단계 화자 프로필 카드 (## 프로필 N: …) */
export function parseProfileCards(text: string): Card[] {
  return parseCards(text, /^프로필\s*[A-Za-z0-9]*/);
}

export interface ProfileRanks {
  first?: number; // 1순위 프로필 번호
  second?: number; // 2순위 프로필 번호
  reasons: Record<number, string>; // 프로필 번호 → 추천 이유
}

/**
 * '## 몰입 추천' 섹션에서 1·2순위 프로필 번호와 이유를 추출한다.
 *   1순위: 프로필 3 - 이유
 *   2순위: 프로필 1 - 이유
 */
export function parseProfileRanks(text: string): ProfileRanks {
  const res: ProfileRanks = { reasons: {} };
  if (!text?.trim()) return res;
  const lines = text.split("\n");
  const grab = (label: string): number | undefined => {
    const line = lines.find((l) => l.includes(label));
    if (!line) return undefined;
    const m = line.match(/프로필\s*(\d+)/);
    if (!m) return undefined;
    const n = parseInt(m[1], 10);
    const reason = line
      .slice(line.indexOf(m[0]) + m[0].length)
      .replace(/^[\s:：.\-–—()]+/, "")
      .trim();
    if (reason) res.reasons[n] = reason;
    return n;
  };
  res.first = grab("1순위");
  res.second = grab("2순위");
  return res;
}
