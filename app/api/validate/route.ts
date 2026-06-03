// ─────────────────────────────────────────────────────────────
// API 키 유효성 검증 라우트 (설정창 즉시 핑)
// ─────────────────────────────────────────────────────────────
//
// 가장 저렴한 형태(maxOutputTokens=1)의 단발 호출로 키 유효성만 확인한다.

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { mapErrorStatus, errorMessageFor } from "@/lib/gemini";
import { DEFAULT_MODEL_ID } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key")?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, message: "키가 비어 있습니다." }, { status: 401 });
  }

  let modelId = DEFAULT_MODEL_ID;
  try {
    const body = (await req.json().catch(() => ({}))) as { modelId?: string };
    if (body.modelId) modelId = body.modelId;
  } catch {
    /* 본문 없음 허용 */
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    await ai.models.generateContent({
      model: modelId,
      contents: "ping",
      config: { maxOutputTokens: 1, temperature: 0 },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = mapErrorStatus(error);
    return NextResponse.json(
      { ok: false, message: errorMessageFor(status) },
      { status: status === 401 || status === 403 ? status : 200 },
    );
  }
}
