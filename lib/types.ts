// ─────────────────────────────────────────────────────────────
// 전역 프로젝트 상태 및 공용 타입 정의
// ─────────────────────────────────────────────────────────────

export interface IntroSet {
  title: string;
  thumbnail: string;
  text: string;
}

export interface AppConfig {
  selectedModel: string;
  isExtendedMode: boolean;
  apiKey: string;
}

/**
 * 워크플로우 전체를 관통하는 단일 진실 공급원(Single Source of Truth).
 * 각 단계에서 [최종 승인]된 Artifact만 이 객체에 바인딩되어
 * 다음 단계 프롬프트의 인풋으로 조립된다. (컨텍스트 다이어트)
 */
export interface ScriptProjectState {
  currentStep: number;
  config: AppConfig;
  topic: string; // 1단계 확정 주제
  factReport: string; // 2단계 승인된 팩트 리포트
  speakerProfile: string; // 3단계 선택된 화자 프로필
  synopsis: string; // 4단계 확정된 8챕터 시놉시스
  introRaw: string; // 5단계 AI가 생성한 인트로 세트 원문(카드 영속화용)
  introSet: IntroSet; // 5단계 선택 인트로 세트
  draftChapters: { [key: number]: string }; // 6단계 생성된 1~8챕터 초안
  finalChapters: { [key: number]: string }; // 7단계 퇴고 완료된 1~8챕터 최종본
  foreshadowLedger: string; // 6단계 러닝 떡밥(복선) 원장 — 전 챕터 회수 추적
  metadata: string; // 8단계 메타데이터
}

/** 누적 토큰/비용 트래커 */
export interface UsageState {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

/**
 * Gemini 응답에서 안전 파싱한 사용량 메타데이터.
 * candidatesTokens에는 사고(thinking) 토큰이 합산된다(둘 다 출력 요금으로 과금).
 */
export interface UsageMetadata {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

/** 웹 검색 그라운딩 출처 */
export interface Source {
  title: string;
  uri: string;
}

/** 비스트리밍 API 응답 형태 */
export interface GenerateResponse {
  text: string;
  usage: UsageMetadata;
  sources: Source[];
}

/** 스트리밍 NDJSON 프레임 */
export type StreamFrame =
  | { type: "chunk"; text: string }
  | { type: "done"; usage: UsageMetadata; sources: Source[] }
  | { type: "error"; status: number; message: string };

export const STEP_TITLES = [
  "주제 선정",
  "딥리서치 · 팩트",
  "화자 프로필",
  "8챕터 시놉시스",
  "인트로 · 클릭률",
  "초안 작성",
  "정밀 퇴고",
  "메타데이터",
] as const;

export const TOTAL_STEPS = STEP_TITLES.length;
