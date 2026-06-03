"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-500/15 text-red-400">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-bold text-slate-50">
        예상치 못한 오류가 발생했습니다
      </h2>
      <p className="max-w-md text-sm text-slate-400">
        작업 내용은 브라우저에 자동 백업되어 있습니다. 아래 버튼으로 다시
        시도하거나 페이지를 새로고침해 주세요.
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-base-900 transition hover:brightness-110"
      >
        <RotateCcw className="h-4 w-4" />
        다시 시도
      </button>
    </div>
  );
}
