"use client";

import { useMemo } from "react";
import { Coins } from "lucide-react";
import { useProject } from "./providers/ProjectProvider";
import { calcCostUsd, getModelPreset, USD_TO_KRW } from "@/lib/models";

export default function CostTracker() {
  const { state, usage } = useProject();
  const preset = getModelPreset(state.config.selectedModel);

  const { usd, krw } = useMemo(() => {
    const costUsd = calcCostUsd(
      state.config.selectedModel,
      usage.promptTokens,
      usage.candidatesTokens,
    );
    return { usd: costUsd, krw: costUsd * USD_TO_KRW };
  }, [state.config.selectedModel, usage.promptTokens, usage.candidatesTokens]);

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="fixed bottom-5 right-5 z-30 w-64 rounded-xl border border-base-600 bg-base-800/95 p-4 text-sm shadow-glow backdrop-blur">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Coins className="h-4 w-4 text-gold" />
        비용 트래커
      </div>
      <div className="space-y-1.5 text-slate-300">
        <Row label="입력 토큰" value={fmt(usage.promptTokens)} />
        <Row label="출력 토큰" value={fmt(usage.candidatesTokens)} />
        <Row label="총 토큰" value={fmt(usage.totalTokens)} strong />
        <div className="my-2 h-px bg-base-600" />
        <Row label="USD" value={`$${usd.toFixed(4)}`} />
        <Row label="KRW" value={`₩${fmt(Math.round(krw))}`} strong />
      </div>
      <p className="mt-2 text-[10px] leading-snug text-slate-600">
        {preset.label} 요율 기준 추정치 · 환율 ₩{USD_TO_KRW}/$
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span
        className={
          strong ? "font-bold text-slate-50" : "font-medium text-slate-200"
        }
      >
        {value}
      </span>
    </div>
  );
}
