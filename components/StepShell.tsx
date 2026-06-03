"use client";

import { type ReactNode } from "react";
import { Sparkles, ArrowRight, Loader2, StopCircle } from "lucide-react";
import CopyButton from "./CopyButton";

interface StepShellProps {
  step: number;
  title: string;
  subtitle: string;
  /** AI 출력 에디터 내용 (편집 가능) */
  aiOutput: string;
  onAiOutputChange: (v: string) => void;
  aiPlaceholder?: string;
  /** 작업자 피드백/가이드 입력 */
  userInput: string;
  onUserInputChange: (v: string) => void;
  userPlaceholder?: string;
  /** 생성 액션 */
  onGenerate: () => void;
  generating: boolean;
  generateLabel?: string;
  onAbort?: () => void;
  /** 승인 & 다음 단계 */
  onConfirm: () => void;
  canConfirm: boolean;
  confirmLabel?: string;
  /** 출력 영역 위에 끼워 넣을 커스텀 UI (선택 카드 등) */
  children?: ReactNode;
  /** AI 출력 에디터를 숨기고 children만 표시할지 여부 */
  hideEditor?: boolean;
}

export default function StepShell(props: StepShellProps) {
  const {
    step,
    title,
    subtitle,
    aiOutput,
    onAiOutputChange,
    aiPlaceholder,
    userInput,
    onUserInputChange,
    userPlaceholder,
    onGenerate,
    generating,
    generateLabel = "AI 생성",
    onAbort,
    onConfirm,
    canConfirm,
    confirmLabel = "승인 및 다음 단계로",
    children,
    hideEditor,
  } = props;

  return (
    <section className="animate-slide-in">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-sm font-medium text-accent">
          <span className="rounded-md bg-accent/10 px-2 py-0.5">
            STEP {step}
          </span>
        </div>
        <h2 className="mt-2 text-2xl font-bold text-slate-50">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {generating ? "생성 중…" : generateLabel}
        </button>
        {generating && onAbort && (
          <button
            onClick={onAbort}
            className="inline-flex items-center gap-2 rounded-lg border border-base-600 px-3 py-2 text-sm text-slate-300 transition hover:border-red-500 hover:text-red-400"
          >
            <StopCircle className="h-4 w-4" />
            중단
          </button>
        )}
      </div>

      {children && <div className="mb-5">{children}</div>}

      {!hideEditor && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                AI Output 에디터
              </label>
              <CopyButton text={aiOutput} />
            </div>
            <textarea
              value={aiOutput}
              onChange={(e) => onAiOutputChange(e.target.value)}
              placeholder={aiPlaceholder ?? "여기에 AI 생성 결과가 표시됩니다. 직접 수정할 수 있습니다."}
              spellCheck={false}
              className="preserve-breaks h-[460px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none transition focus:border-accent/70"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              User Input · 작업자 가이드
            </label>
            <textarea
              value={userInput}
              onChange={(e) => onUserInputChange(e.target.value)}
              placeholder={
                userPlaceholder ??
                "AI에게 줄 추가 지시나 피드백을 적으세요. (선택)"
              }
              className="preserve-breaks h-[460px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-accent/70"
            />
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={onConfirm}
          disabled={!canConfirm || generating}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {confirmLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
