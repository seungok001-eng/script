"use client";

import { Settings, Zap, Factory } from "lucide-react";
import { useProject } from "./providers/ProjectProvider";
import { MODEL_PRESETS } from "@/lib/models";

interface HeaderProps {
  onOpenSettings: () => void;
}

export default function Header({ onOpenSettings }: HeaderProps) {
  const { state, updateConfig, hydrated } = useProject();
  const { selectedModel, isExtendedMode } = state.config;

  return (
    <header className="sticky top-0 z-40 border-b border-base-700/80 bg-base-900/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent shadow-glow">
            <Factory className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-50">대본 공장</p>
            <p className="text-[11px] text-slate-500">24,000자 자동 생성기</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {/* 모델 선택 드롭다운 */}
          <select
            value={selectedModel}
            disabled={!hydrated}
            onChange={(e) => updateConfig({ selectedModel: e.target.value })}
            className="rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-accent/70"
            aria-label="모델 선택"
          >
            {MODEL_PRESETS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          {/* 익스텐디드 모드 토글 */}
          <button
            onClick={() => updateConfig({ isExtendedMode: !isExtendedMode })}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              isExtendedMode
                ? "border-gold/60 bg-gold/15 text-gold shadow-glow"
                : "border-base-600 bg-base-800 text-slate-400 hover:text-slate-200"
            }`}
            aria-pressed={isExtendedMode}
            title="익스텐디드 모드: 최대 출력 토큰 강제 확장 + 추론 버퍼 활성화"
          >
            <Zap className="h-4 w-4" />
            익스텐디드
            <span
              className={`ml-0.5 inline-flex h-4 w-7 items-center rounded-full p-0.5 transition ${
                isExtendedMode ? "bg-gold/70" : "bg-base-600"
              }`}
            >
              <span
                className={`h-3 w-3 rounded-full bg-base-900 transition ${
                  isExtendedMode ? "translate-x-3" : "translate-x-0"
                }`}
              />
            </span>
          </button>

          {/* 설정 모달 */}
          <button
            onClick={onOpenSettings}
            className="grid h-9 w-9 place-items-center rounded-lg border border-base-600 bg-base-800 text-slate-300 transition hover:rotate-45 hover:text-accent"
            aria-label="설정 열기"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
