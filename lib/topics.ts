// ─────────────────────────────────────────────────────────────
// 1단계 추천 주제 파서 — AI 출력(마크다운)을 개별 주제 카드로 분리
// ─────────────────────────────────────────────────────────────
//
// 입력 예:
//   ## 주제 1: 한국 방산 수출 신기록
//   - 시의성: ...
//   - 후킹 포인트: ...
//   ## 주제 2: ...
//   ## 추천 종합  ← 주제가 아니므로 카드에서 제외

export interface TopicCard {
  n: number; // 주제 번호
  title: string; // "주제 N:" 접두를 제거한 깔끔한 제목
  body: string; // 제목 아래 본문(불릿)
  full: string; // 헤더+본문 원문 (확정 주제로 사용)
}

export function parseTopicCards(text: string): TopicCard[] {
  if (!text?.trim()) return [];
  // 마크다운 헤더(#, ##, ###) 단위로 분할
  const parts = text.split(/\n(?=#{1,3}\s)/);
  const cards: TopicCard[] = [];
  for (const part of parts) {
    const lines = part.split("\n");
    const header = lines[0]
      .replace(/^#{1,3}\s*/, "")
      .replace(/\*+/g, "")
      .trim();
    const m = header.match(/^주제\s*(\d+)?\s*[:：.\)]?\s*(.*)$/);
    if (!m) continue; // 프리앰블·'추천 종합' 등은 제외
    const n = m[1] ? parseInt(m[1], 10) : cards.length + 1;
    const title = (m[2] || header).trim() || `주제 ${n}`;
    const body = lines.slice(1).join("\n").trim();
    cards.push({ n, title, body, full: part.trim() });
  }
  return cards;
}
