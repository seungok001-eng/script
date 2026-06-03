// ─────────────────────────────────────────────────────────────
// 스트리밍 생성 라우트 (6, 7단계용)
// ─────────────────────────────────────────────────────────────
//
// 프로토콜: NDJSON 스트림. 각 줄은 하나의 StreamFrame(JSON).
//   { "type": "chunk", "text": "..." }   ← 실시간 텍스트 청크
//   { "type": "done",  "usage": {...} }  ← 스트림 완료 + usageMetadata
//   { "type": "error", "status": n, "message": "..." }
//
// 핵심: 구글 서버는 usageMetadata를 스트림의 가장 마지막 순간에만 보낸다.
// 따라서 토큰 계산은 반드시 스트림 종료 후 마지막 'done' 프레임에서만 수행한다.

import { NextRequest } from "next/server";
import { SYSTEM_INSTRUCTION } from "@/lib/prompts";
import {
  buildModel,
  parseUsage,
  mapErrorStatus,
  errorMessageFor,
} from "@/lib/gemini";
import type { StreamFrame, UsageMetadata } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface StreamBody {
  modelId: string;
  isExtendedMode: boolean;
  prompt: string;
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
        const model = buildModel({
          apiKey,
          modelId: body.modelId,
          isExtendedMode: body.isExtendedMode,
          systemInstruction: SYSTEM_INSTRUCTION,
        });

        const result = await model.generateContentStream(body.prompt);

        let lastUsage: UsageMetadata = {
          promptTokens: 0,
          candidatesTokens: 0,
          totalTokens: 0,
        };

        for await (const chunk of result.stream) {
          // 일부 청크에는 usageMetadata가 동봉되며, 보통 마지막 청크가 최종값이다.
          if (chunk.usageMetadata) {
            lastUsage = parseUsage(chunk.usageMetadata);
          }
          const text = chunk.text();
          if (text) {
            controller.enqueue(frame({ type: "chunk", text }));
          }
        }

        // 스트림이 완전히 끝난 뒤 집계된 응답에서 최종 usageMetadata를 재확인한다.
        const aggregated = await result.response;
        if (aggregated.usageMetadata) {
          lastUsage = parseUsage(aggregated.usageMetadata);
        }

        controller.enqueue(frame({ type: "done", usage: lastUsage }));
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
      connection: "keep-alive",
    },
  });
}
