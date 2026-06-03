// ─────────────────────────────────────────────────────────────
// 모델 프리셋 + 토큰 요율(Pricing) 매핑 테이블
// ─────────────────────────────────────────────────────────────
//
// 주의: 아래 모델 ID와 단가는 명세서에 기재된 프리셋을 따른 것이며,
// 일부(gemini-3.x 라인업)는 향후/가상 모델 ID일 수 있습니다.
// 실제 배포 시에는 Google AI Studio에서 사용 가능한 모델 ID와
// 최신 공식 요금표(https://ai.google.dev/pricing)로 갱신하세요.
// 단가는 USD / 1,000,000 토큰 기준입니다.

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
    description: "기본 추천 · 속도/에이전틱 최적화",
    supportsThinking: true,
    maxOutputTokens: 8192,
    pricing: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  },
  {
    id: "gemini-3.1-pro",
    label: "Gemini 3.1 Pro",
    description: "고난도 심층 추론 · 작가 모드",
    supportsThinking: true,
    maxOutputTokens: 8192,
    pricing: { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    description: "초고속 · 비용 절감형",
    supportsThinking: false,
    maxOutputTokens: 8192,
    pricing: { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro (Stable)",
    description: "기존 스테이블 · 심층 추론",
    supportsThinking: true,
    maxOutputTokens: 8192,
    pricing: { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash (Stable)",
    description: "기존 스테이블 · 범용 고속",
    supportsThinking: true,
    maxOutputTokens: 8192,
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
