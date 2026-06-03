// ─────────────────────────────────────────────────────────────
// 서버 사이드 Gemini 모델 팩토리 + 에러/사용량 유틸 (라우트 핸들러 전용)
// ─────────────────────────────────────────────────────────────

import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { getModelPreset } from "./models";
import type { UsageMetadata } from "./types";

export interface BuildModelOptions {
  apiKey: string;
  modelId: string;
  isExtendedMode: boolean;
  systemInstruction: string;
}

/**
 * 클라이언트 헤더(x-api-key)로 전달된 키로 모델 인스턴스를 동적 초기화한다.
 * 익스텐디드 모드에서는 maxOutputTokens를 모델 최대치로 강제 확장하고,
 * Thinking 파라미터를 지원하는 최신 모델에 한해 추론 버퍼 옵션을 활성화한다.
 */
export function buildModel(opts: BuildModelOptions) {
  const preset = getModelPreset(opts.modelId);
  const genAI = new GoogleGenerativeAI(opts.apiKey);

  const generationConfig: GenerationConfig = {
    temperature: 0.9,
    topP: 0.95,
    maxOutputTokens: opts.isExtendedMode ? preset.maxOutputTokens : 4096,
  };

  // 동적 옵션 핸들러: Thinking 지원 모델 + 익스텐디드 모드일 때만 추론 버퍼 확장.
  // (SDK 버전에 따라 무시될 수 있는 실험적 필드는 안전하게 캐스팅하여 주입한다.)
  if (opts.isExtendedMode && preset.supportsThinking) {
    (generationConfig as Record<string, unknown>).thinkingConfig = {
      thinkingBudget: 4096,
    };
  }

  return genAI.getGenerativeModel({
    model: opts.modelId,
    systemInstruction: opts.systemInstruction,
    generationConfig,
  });
}

/** Gemini 응답의 usageMetadata를 안전하게 파싱한다(없으면 0). */
export function parseUsage(raw: unknown): UsageMetadata {
  const meta = (raw ?? {}) as {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  const promptTokens = meta.promptTokenCount ?? 0;
  const candidatesTokens = meta.candidatesTokenCount ?? 0;
  const totalTokens =
    meta.totalTokenCount ?? promptTokens + candidatesTokens;
  return { promptTokens, candidatesTokens, totalTokens };
}

/**
 * Gemini SDK가 던진 에러에서 HTTP 상태 코드를 추출한다.
 * 잘못/만료된 키는 보통 400(API key not valid) 또는 403으로 떨어진다.
 * 라우트는 이를 401/403으로 정규화하여 프론트의 토스트 처리를 돕는다.
 */
export function mapErrorStatus(error: unknown): number {
  const anyErr = error as { status?: number; message?: string } | undefined;
  if (typeof anyErr?.status === "number") {
    if (anyErr.status === 400 && /api key/i.test(anyErr.message ?? "")) return 401;
    return anyErr.status;
  }
  const msg = anyErr?.message ?? String(error);
  if (/api key not valid|invalid api key|api_key_invalid/i.test(msg)) return 401;
  const match = msg.match(/\[(\d{3})\b/);
  if (match) {
    const code = Number(match[1]);
    if (code === 400 && /api key/i.test(msg)) return 401;
    return code;
  }
  return 500;
}

export function errorMessageFor(status: number): string {
  if (status === 401 || status === 403) {
    return "API 키가 올바르지 않습니다. 설정에서 다시 확인해 주세요.";
  }
  if (status === 429) {
    return "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}
