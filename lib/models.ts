// ─────────────────────────────────────────────────────────────
// 모델 프리셋 + 토큰 요율(Pricing) 매핑 테이블
// ─────────────────────────────────────────────────────────────
//
// 2026-06 기준 Google Gemini API에서 호출 가능한 실제 모델 ID로 검증·갱신.
//  · gemini-3.5-flash       : GA (2026-05-19), 1M 컨텍스트 / 65,536 출력
//  · gemini-3.1-pro-preview : 프리뷰 단계 (현재 호출 ID에 -preview 접미사 유지)
//  · gemini-3.1-flash-lite  : GA, 최저가 고속
//  · gemini-2.5-pro / flash : 스테이블
// 단가는 USD / 1,000,000 토큰 기준이며, 200K 토큰 초과 구간 가산은 무시한 기본가.
// 최신 공식 요금표: https://ai.google.dev/gemini-api/docs/pricing

export interface ModelPreset {
  id: string;
  label: string;
  description: string;
  /** Thinking/추론 버퍼 파라미터 지원 여부 (익스텐디드 모드용) */
  supportsThinking: boolean;
  /** 모델이 허용하는 최대 출력 토큰 (익스텐디드 모드에서 강제 확장값) */
  maxOutputTokens: number;
  pricing: {
    inputPerMillion: number; // 입력(프롬프트) 토큰 단가 (USD / 1M)
    outputPerMillion: number; // 출력(후보) 토큰 단가 (USD / 1M)
  };
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    description: "기본 추천 · GA · 에이전틱/속도 최적 (1M 컨텍스트)",
    supportsThinking: true,
    maxOutputTokens: 65536,
    pricing: { inputPerMillion: 1.5, outputPerMillion: 9.0 },
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro (Preview)",
    description: "고난도 심층 추론 · 작가 모드 (프리뷰)",
    supportsThinking: true,
    maxOutputTokens: 65536,
    pricing: { inputPerMillion: 2.0, outputPerMillion: 12.0 },
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    description: "GA · 초고속 · 비용 절감형",
    supportsThinking: false,
    maxOutputTokens: 65536,
    pricing: { inputPerMillion: 0.25, outputPerMillion: 1.5 },
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro (Stable)",
    description: "기존 스테이블 · 심층 추론",
    supportsThinking: true,
    maxOutputTokens: 65536,
    pricing: { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash (Stable)",
    description: "기존 스테이블 · 범용 고속",
    supportsThinking: true,
    maxOutputTokens: 65536,
    pricing: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  },
];

export const DEFAULT_MODEL_ID = MODEL_PRESETS[0].id;

/** USD → KRW 환율 (수동 갱신용 상수) */
export const USD_TO_KRW = 1380;

export function getModelPreset(id: string): ModelPreset {
  return MODEL_PRESETS.find((m) => m.id === id) ?? MODEL_PRESETS[0];
}

/** 누적 토큰을 기반으로 소모 비용(USD)을 계산 */
export function calcCostUsd(
  modelId: string,
  promptTokens: number,
  candidatesTokens: number,
): number {
  const { pricing } = getModelPreset(modelId);
  const inputCost = (promptTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (candidatesTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
}
