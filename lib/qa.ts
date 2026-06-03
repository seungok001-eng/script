// ─────────────────────────────────────────────────────────────
// 대본 규칙 자동 검증(QA) — 절대 규칙을 사람 눈이 아닌 프로그램으로 측정
// ─────────────────────────────────────────────────────────────
//
// 측정 항목:
//  · 글자수(타깃 범위 대비)
//  · 문장 끝 어미 4단 변주 비율 (목표 40/40/15/5)
//  · 금지어('그런데 말입니다' 등 상투어)
//  · 괄호/특수기호 (TTS 가독성 — [챕터 N] 마커는 허용)
//  · 챕터 머리말 마커 존재 여부

export interface EndingCounts {
  seumnida: number; // ~습니다/합니다 (문어 격식)
  jyo: number; // ~죠/잖아요/~요 (구어)
  question: number; // ~습니까?/할까요?
  malimnida: number; // ~말입니다
  other: number;
  total: number;
}

export interface QAMetrics {
  charCount: number;
  withinRange: boolean | null; // 타깃 범위 미지정 시 null
  minChars?: number;
  maxChars?: number;
  endings: EndingCounts;
  ratios: { seumnida: number; jyo: number; question: number; malimnida: number };
  bannedHits: { phrase: string; count: number }[];
  specialCharCount: number;
  hasChapterMarker: boolean;
  warnings: string[];
}

const BANNED_PHRASES = ["그런데 말입니다", "여러분도 아시다시피"];
const CHAPTER_MARKER = /\[\s*챕터\s*\d+\s*\]/g;

// 목표 어미 비율(%)과 허용 오차
const TARGET = { seumnida: 40, jyo: 40, question: 15, malimnida: 5 };

function classifyEnding(sentence: string): keyof Omit<EndingCounts, "total"> {
  const s = sentence.trim().replace(/["'”’)\]]+$/, "");
  if (/[?？]$/.test(s) || /(까요|습니까|십니까|을까요|ㄹ까요|런가요)$/.test(s)) {
    return "question";
  }
  if (/말입니다$/.test(s)) return "malimnida";
  if (/니다$/.test(s)) return "seumnida";
  if (/(죠|쥬|잖아요|네요|군요|거든요|는데요|에요|예요|아요|어요|요)$/.test(s)) {
    return "jyo";
  }
  return "other";
}

export interface AnalyzeOpts {
  minChars?: number;
  maxChars?: number;
}

export function analyzeScript(text: string, opts: AnalyzeOpts = {}): QAMetrics {
  const charCount = text.length;

  // 챕터 마커를 제거한 본문을 기준으로 어미/특수기호 측정
  const body = text.replace(CHAPTER_MARKER, " ");

  const sentences = body
    .split(/[.!?。？！\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  const endings: EndingCounts = {
    seumnida: 0,
    jyo: 0,
    question: 0,
    malimnida: 0,
    other: 0,
    total: 0,
  };
  for (const s of sentences) {
    endings[classifyEnding(s)] += 1;
    endings.total += 1;
  }

  const pct = (n: number) =>
    endings.total ? Math.round((n / endings.total) * 100) : 0;
  const ratios = {
    seumnida: pct(endings.seumnida),
    jyo: pct(endings.jyo),
    question: pct(endings.question),
    malimnida: pct(endings.malimnida),
  };

  const bannedHits = BANNED_PHRASES.map((phrase) => ({
    phrase,
    count: text.split(phrase).length - 1,
  })).filter((h) => h.count > 0);

  const specialCharCount = (body.match(/[()[\]{}（）*#~_`]/g) ?? []).length;
  const hasChapterMarker = new RegExp(CHAPTER_MARKER.source).test(text);

  // ── 경고 산출 ──
  const warnings: string[] = [];
  const { minChars, maxChars } = opts;
  let withinRange: boolean | null = null;
  if (minChars != null && maxChars != null) {
    withinRange = charCount >= minChars && charCount <= maxChars;
    if (charCount < minChars)
      warnings.push(`분량 부족 (${charCount}자 < 목표 ${minChars}자)`);
    else if (charCount > maxChars)
      warnings.push(`분량 초과 (${charCount}자 > 목표 ${maxChars}자)`);
  }
  if (endings.total >= 10) {
    if (Math.abs(ratios.seumnida - TARGET.seumnida) > 20)
      warnings.push(`'~습니다' 비율 ${ratios.seumnida}% (목표 ${TARGET.seumnida}%)`);
    if (Math.abs(ratios.jyo - TARGET.jyo) > 20)
      warnings.push(`'~죠/~요' 비율 ${ratios.jyo}% (목표 ${TARGET.jyo}%)`);
    if (ratios.question < 5)
      warnings.push(`질문형 어미 부족 (${ratios.question}%)`);
  }
  for (const h of bannedHits) warnings.push(`금지어 '${h.phrase}' ${h.count}회`);
  if (specialCharCount > 0)
    warnings.push(`괄호/특수기호 ${specialCharCount}개 (TTS 비권장)`);
  if (!hasChapterMarker) warnings.push("[챕터 N] 머리말 마커 없음");

  return {
    charCount,
    withinRange,
    minChars,
    maxChars,
    endings,
    ratios,
    bannedHits,
    specialCharCount,
    hasChapterMarker,
    warnings,
  };
}
