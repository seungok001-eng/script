"use client";

import { Target } from "lucide-react";

interface ProgressGaugeProps {
  current: number;
  target?: number;
  label?: string;
}

/** 누적 글자수 / 목표(24,000자) 진행률 게이지 */
export default function ProgressGauge({
  current,
  target = 24000,
  label = "전체 분량",
}: ProgressGaugeProps) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="rounded-xl border border-base-600 bg-base-800/60 p-4">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-slate-300">
          <Target className="h-3.5 w-3.5 text-accent" />
          {label}
        </span>
        <span className="text-slate-400">
          <span className="font-bold text-slate-100">
            {current.toLocaleString("ko-KR")}
          </span>{" "}
          / {target.toLocaleString("ko-KR")}자 ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-base-600">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-glow transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
