// ─────────────────────────────────────────────────────────────
// 스트리밍 생성 라우트 (6, 7단계용)
// ─────────────────────────────────────────────────────────────
//
// 프로토콜: NDJSON 스트림. 각 줄은 하나의 StreamFrame(JSON).
//   { "type": "chunk", "text": "..." }                 ← 실시간 텍스트 청크
//   { "type": "done",  "usage": {...}, "sources": [] }  ← 완료 + usageMetadata
//   { "type": "error", "status": n, "message": "..." }
//
// 핵심: usageMetadata는 스트림 종료 시점에만 확정되므로 토큰 계산은
// 마지막 'done' 프레임에서만 수행한다. (MAX_TOKENS 시 서버가 자동 이어쓰기)

import { NextRequest } from "next/server";
import { SYSTEM_INSTRUCTION, PLANNING_SYSTEM_INSTRUCTION } from "@/lib/prompts";
import { streamComplete, mapErrorStatus, errorMessageFor } from "@/lib/gemini";
import type { StreamFrame } from "@/lib/types";

export const runtime = "nodejs";
// Vercel Hobby(무료) 플랜의 함수 최대 실행시간은 60초입니다.
// Pro 플랜이라면 300까지 올려도 됩니다(긴 추론 모델에 유리).
export const maxDuration = 60;

interface StreamBody {
  modelId: string;
  isExtendedMode: boolean;
  prompt: string;
  temperature?: number;
  enableSearch?: boolean;
  planning?: boolean;
}

function frame(obj: StreamFrame): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key")?.trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ message: "API 키가 없습니다. 설정에서 키를 저장해 주세요." }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  let body: StreamBody;
  try {
    body = (await req.json()) as StreamBody;
  } catch {
    return new Response(JSON.stringify({ message: "잘못된 요청 본문입니다." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!body.prompt?.trim()) {
    return new Response(JSON.stringify({ message: "프롬프트가 비어 있습니다." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const { usage, sources } = await streamComplete(
          {
            apiKey,
            modelId: body.modelId,
            isExtendedMode: body.isExtendedMode,
            temperature: body.temperature,
            enableSearch: body.enableSearch,
            longForm: true, // 6·7단계 챕터: 출력 상한을 크게(중간 잘림 방지)
            systemInstruction: body.planning
              ? PLANNING_SYSTEM_INSTRUCTION
              : SYSTEM_INSTRUCTION,
            prompt: body.prompt,
          },
          (text) => controller.enqueue(frame({ type: "chunk", text })),
        );

        controller.enqueue(frame({ type: "done", usage, sources }));
        controller.close();
      } catch (error) {
        const status = mapErrorStatus(error);
        console.error("[/api/stream] error:", error);
        controller.enqueue(
          frame({ type: "error", status, message: errorMessageFor(status) }),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
