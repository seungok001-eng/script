"use client";

import { useMemo } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { analyzeScript, type AnalyzeOpts } from "@/lib/qa";

interface QAPanelProps {
  text: string;
  opts?: AnalyzeOpts;
}

/** 절대 규칙 자동 검증 결과를 컴팩트하게 표시 */
export default function QAPanel({ text, opts }: QAPanelProps) {
  const m = useMemo(() => analyzeScript(text, opts), [text, opts]);
  if (!text.trim()) return null;

  const ok = m.warnings.length === 0;

  return (
    <div className="rounded-xl border border-base-600 bg-base-800/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {ok ? (
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-gold" />
        )}
        <span className={ok ? "text-emerald-400" : "text-gold"}>
          규칙 검증 {ok ? "통과" : `· 점검 ${m.warnings.length}건`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
        <Metric label="글자수" value={m.charCount.toLocaleString("ko-KR")}
          warn={m.withinRange === false} />
        <Metric label="~습니다" value={`${m.ratios.seumnida}%`} hint="목표40" />
        <Metric label="~죠/요" value={`${m.ratios.jyo}%`} hint="목표40" />
        <Metric label="질문형" value={`${m.ratios.question}%`} hint="목표15" />
        <Metric label="~말입니다" value={`${m.ratios.malimnida}%`} hint="목표5" />
        <Metric label="금지어" value={`${m.bannedHits.reduce((s, h) => s + h.count, 0)}`}
          warn={m.bannedHits.length > 0} />
        <Metric label="특수기호" value={`${m.specialCharCount}`}
          warn={m.specialCharCount > 0} />
        <Metric label="챕터마커" value={m.hasChapterMarker ? "있음" : "없음"}
          warn={!m.hasChapterMarker} />
      </div>

      {m.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-base-600 pt-2">
          {m.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-gold/90">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-slate-500">
        {label}
        {hint && <span className="ml-1 text-[10px] text-slate-600">{hint}</span>}
      </p>
      <p className={`font-semibold ${warn ? "text-gold" : "text-slate-100"}`}>
        {value}
      </p>
    </div>
  );
}
