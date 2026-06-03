// ─────────────────────────────────────────────────────────────
// 서버 사이드 Gemini 헬퍼 (라우트 핸들러 전용) — @google/genai 기반
//   · 429/5xx 지수 백오프 재시도
//   · MAX_TOKENS 자동 이어쓰기(continuation)
//   · Google Search 그라운딩 + 출처 추출
//   · 사고(thinking) 토큰을 출력 토큰에 합산한 안전 사용량 파싱
// ─────────────────────────────────────────────────────────────

import {
  GoogleGenAI,
  FinishReason,
  type GenerateContentConfig,
  type GenerateContentResponse,
} from "@google/genai";
import { getModelPreset } from "./models";
import type { Source, UsageMetadata } from "./types";

export interface GenArgs {
  apiKey: string;
  modelId: string;
  isExtendedMode: boolean;
  temperature?: number;
  enableSearch?: boolean;
  /** 장문(6·7단계 챕터) 생성 여부 — 출력 토큰 상한을 크게 잡는다 */
  longForm?: boolean;
  systemInstruction: string;
  prompt: string;
}

const MAX_CONTINUATIONS = 3;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildConfig(args: GenArgs): GenerateContentConfig {
  const preset = getModelPreset(args.modelId);
  const config: GenerateContentConfig = {
    systemInstruction: args.systemInstruction,
    temperature: args.temperature ?? 0.9,
    topP: 0.95,
    // 출력 상한. 3.x 모델은 사고(thinking) 토큰도 이 한도를 함께 쓰므로,
    // 너무 낮으면 본문이 중간에서 MAX_TOKENS로 잘린다. 장문(챕터)은 더 크게.
    maxOutputTokens: args.isExtendedMode
      ? preset.maxOutputTokens
      : args.longForm
        ? 32768
        : 16384,
  };
  // 익스텐디드 모드 + Thinking 지원 모델에 한해 추론 버퍼 활성화
  if (args.isExtendedMode && preset.supportsThinking) {
    config.thinkingConfig = { thinkingBudget: 4096 };
  }
  // 2단계 등에서 실제 웹 검색 그라운딩 활성화 (절대 규칙 3: 팩트 기반)
  if (args.enableSearch) {
    config.tools = [{ googleSearch: {} }];
  }
  return config;
}

function emptyUsage(): UsageMetadata {
  return { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
}

function addUsage(a: UsageMetadata, b: UsageMetadata): UsageMetadata {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    candidatesTokens: a.candidatesTokens + b.candidatesTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

export function parseUsage(raw: unknown): UsageMetadata {
  const meta = (raw ?? {}) as {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  const promptTokens = meta.promptTokenCount ?? 0;
  // 사고 토큰도 출력 단가로 과금되므로 candidates에 합산
  const candidatesTokens =
    (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0);
  const totalTokens = meta.totalTokenCount ?? promptTokens + candidatesTokens;
  return { promptTokens, candidatesTokens, totalTokens };
}

function extractSources(resp: GenerateContentResponse): Source[] {
  const chunks = resp.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const out: Source[] = [];
  for (const c of chunks) {
    const uri = c.web?.uri;
    if (uri) out.push({ title: c.web?.title ?? uri, uri });
  }
  return out;
}

function mergeSources(a: Source[], b: Source[]): Source[] {
  const seen = new Set(a.map((s) => s.uri));
  return [...a, ...b.filter((s) => !seen.has(s.uri))];
}

export function mapErrorStatus(error: unknown): number {
  const anyErr = error as { status?: number; message?: string } | undefined;
  if (typeof anyErr?.status === "number") {
    if (anyErr.status === 400 && /api[_ ]?key/i.test(anyErr.message ?? "")) {
      return 401;
    }
    return anyErr.status;
  }
  const msg = anyErr?.message ?? String(error);
  if (/api[_ ]?key not valid|invalid api key|api_key_invalid/i.test(msg)) {
    return 401;
  }
  const match = msg.match(/\b(\d{3})\b/);
  if (match) {
    const code = Number(match[1]);
    if (code === 400 && /api[_ ]?key/i.test(msg)) return 401;
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

/** 429/5xx에 한해 지수 백오프(0.5s·1s·2s·4s)로 재시도 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = mapErrorStatus(err);
      if (RETRYABLE.has(status) && attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
}

function continuationPrompt(base: string, written: string): string {
  return `${base}\n\n[지금까지 작성된 내용]\n${written}\n\n위 내용에 자연스럽게 이어서, 잘린 지점부터 계속 작성하라. 이미 쓴 문장을 반복하지 말고 본문만 출력하라.`;
}

/** 비스트리밍 생성 (1~5·8단계). MAX_TOKENS 시 자동 이어쓰기. */
export async function generateComplete(
  args: GenArgs,
): Promise<{ text: string; usage: UsageMetadata; sources: Source[] }> {
  const ai = new GoogleGenAI({ apiKey: args.apiKey });
  const config = buildConfig(args);

  let text = "";
  let usage = emptyUsage();
  let sources: Source[] = [];
  let contents = args.prompt;

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const resp = await withRetry(() =>
      ai.models.generateContent({ model: args.modelId, contents, config }),
    );
    text += resp.text ?? "";
    usage = addUsage(usage, parseUsage(resp.usageMetadata));
    sources = mergeSources(sources, extractSources(resp));

    if (resp.candidates?.[0]?.finishReason !== FinishReason.MAX_TOKENS) break;
    contents = continuationPrompt(args.prompt, text);
  }

  return { text, usage, sources };
}

/** 스트리밍 생성 (6·7단계). 청크를 onText로 흘려보내고 MAX_TOKENS 시 자동 이어쓰기. */
export async function streamComplete(
  args: GenArgs,
  onText: (t: string) => void,
): Promise<{ usage: UsageMetadata; sources: Source[] }> {
  const ai = new GoogleGenAI({ apiKey: args.apiKey });
  const config = buildConfig(args);

  let usage = emptyUsage();
  let sources: Source[] = [];
  let accumulated = "";
  let contents = args.prompt;

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    // 스트림 시작(연결)만 재시도한다. 스트리밍 도중 재시도는 중복 출력을 유발하므로 금지.
    const generator = await withRetry(() =>
      ai.models.generateContentStream({
        model: args.modelId,
        contents,
        config,
      }),
    );

    let lastChunk: GenerateContentResponse | undefined;
    for await (const chunk of generator) {
      const t = chunk.text ?? "";
      if (t) {
        onText(t);
        accumulated += t;
      }
      lastChunk = chunk;
    }

    if (lastChunk) {
      usage = addUsage(usage, parseUsage(lastChunk.usageMetadata));
      sources = mergeSources(sources, extractSources(lastChunk));
    }

    if (lastChunk?.candidates?.[0]?.finishReason !== FinishReason.MAX_TOKENS) {
      break;
    }
    contents = continuationPrompt(args.prompt, accumulated);
  }

  return { usage, sources };
}
