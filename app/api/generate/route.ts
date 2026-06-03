// ─────────────────────────────────────────────────────────────
// 비스트리밍 생성 라우트 (1~5, 8단계용)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { SYSTEM_INSTRUCTION } from "@/lib/prompts";
import {
  buildModel,
  parseUsage,
  mapErrorStatus,
  errorMessageFor,
} from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

interface GenerateBody {
  modelId: string;
  isExtendedMode: boolean;
  prompt: string;
}

export async function POST(req: NextRequest) {
  // x-api-key 헤더로 전달된 키를 안전하게 수신하여 인스턴스 동적 초기화
  const apiKey = req.headers.get("x-api-key")?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { message: "API 키가 없습니다. 설정에서 키를 저장해 주세요." },
      { status: 401 },
    );
  }

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ message: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  if (!body.prompt?.trim()) {
    return NextResponse.json({ message: "프롬프트가 비어 있습니다." }, { status: 400 });
  }

  try {
    const model = buildModel({
      apiKey,
      modelId: body.modelId,
      isExtendedMode: body.isExtendedMode,
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const result = await model.generateContent(body.prompt);
    const text = result.response.text();
    const usage = parseUsage(result.response.usageMetadata);

    return NextResponse.json({ text, usage });
  } catch (error) {
    const status = mapErrorStatus(error);
    console.error("[/api/generate] error:", error);
    return NextResponse.json(
      { message: errorMessageFor(status) },
      { status },
    );
  }
}
