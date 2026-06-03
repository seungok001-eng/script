"use client";

import { History, RotateCcw, FilePlus2 } from "lucide-react";
import { useProject } from "./providers/ProjectProvider";

export default function RecoveryModal() {
  const { recoverable, acceptRecovery, dismissRecovery } = useProject();

  if (!recoverable) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md animate-slide-in rounded-2xl border border-base-600 bg-base-800 p-6 shadow-glow">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/15 text-accent">
            <History className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-bold text-slate-50">이전 작업 복구</h3>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-slate-400">
          이 브라우저에 저장된 진행 중인 대본 프로젝트가 있습니다. 이어서
          작업하시겠습니까? 새로 시작하면 기존 백업은 사라집니다.
        </p>
        <div className="flex gap-3">
          <button
            onClick={dismissRecovery}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-base-600 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-500"
          >
            <FilePlus2 className="h-4 w-4" />
            새로 시작
          </button>
          <button
            onClick={acceptRecovery}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-base-900 transition hover:brightness-110"
          >
            <RotateCcw className="h-4 w-4" />
            이어서 작업
          </button>
        </div>
      </div>
    </div>
  );
}
