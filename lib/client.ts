// ─────────────────────────────────────────────────────────────
// 프론트엔드 → 백엔드 API 호출 래퍼 (클라이언트 전용)
// ─────────────────────────────────────────────────────────────

import type { GenerateResponse, Source, StreamFrame, UsageMetadata } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

interface CallArgs {
  apiKey: string;
  modelId: string;
  isExtendedMode: boolean;
  prompt: string;
  temperature?: number;
  enableSearch?: boolean;
  /** 기획·리서치 단계(1~5,8) 여부 — 집필용 시스템 인스트럭션 대신 기획용을 사용 */
  planning?: boolean;
}

function payload(args: CallArgs) {
  return JSON.stringify({
    modelId: args.modelId,
    isExtendedMode: args.isExtendedMode,
    prompt: args.prompt,
    temperature: args.temperature,
    enableSearch: args.enableSearch,
    planning: args.planning,
  });
}

/** API 키 유효성 즉시 검증 (설정창) */
export async function validateKey(
  apiKey: string,
  modelId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch("/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ modelId }),
    });
    return (await res.json().catch(() => ({ ok: false }))) as {
      ok: boolean;
      message?: string;
    };
  } catch {
    return { ok: false, message: "네트워크 오류로 검증에 실패했습니다." };
  }
}

/** 비스트리밍 호출 (1~5, 8단계) */
export async function generate(args: CallArgs): Promise<GenerateResponse> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": args.apiKey },
    body: payload(args),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.message ?? "요청 실패");
  }

  return (await res.json()) as GenerateResponse;
}

interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (usage: UsageMetadata, sources: Source[]) => void;
  signal?: AbortSignal;
}

/**
 * 스트리밍 호출 (6, 7단계). NDJSON 프레임을 파싱하여 콜백으로 전달한다.
 * 토큰 사용량은 마지막 'done' 프레임에서만 확정된다.
 */
export async function stream(args: CallArgs, cb: StreamCallbacks): Promise<void> {
  const res = await fetch("/api/stream", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": args.apiKey },
    body: payload(args),
    signal: cb.signal,
  });

  // 스트림이 성공적으로 시작되면 항상 200이다.
  // 그 외 상태(키 오류 등)는 스트림 시작 전 일반 JSON 에러로 떨어지므로 즉시 throw.
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.message ?? "요청 실패");
  }
  if (!res.body) {
    throw new ApiError(500, "스트림 본문이 비어 있습니다.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;

      let f: StreamFrame;
      try {
        f = JSON.parse(line) as StreamFrame;
      } catch {
        continue;
      }

      if (f.type === "chunk") {
        cb.onChunk(f.text);
      } else if (f.type === "done") {
        cb.onDone(f.usage, f.sources);
      } else if (f.type === "error") {
        throw new ApiError(f.status, f.message);
      }
    }
  }
}
