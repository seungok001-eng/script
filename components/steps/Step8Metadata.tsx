"use client";

import { useState } from "react";
import { Sparkles, Loader2, Save, Download, Copy } from "lucide-react";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep8Prompt } from "@/lib/prompts";
import { joinAllChapters, totalChars } from "@/lib/chapters";

export default function Step8Metadata() {
  const { state, update } = useProject();
  const { toast } = useToast();
  const { run, running } = useGenerate();

  const [output, setOutput] = useState(state.metadata);
  const [guide, setGuide] = useState("");

  const fullScript = joinAllChapters(state.finalChapters);
  const chars = totalChars(state.finalChapters);

  const handleGenerate = async () => {
    const text = await run(buildStep8Prompt(state, guide));
    if (text) setOutput(text);
  };

  const handleSave = () => {
    update({ metadata: output.trim() });
    toast("메타데이터를 저장했습니다. 프로젝트 완성!", "success");
  };

  const copyScript = async () => {
    await navigator.clipboard.writeText(fullScript);
    toast("최종 대본 전체를 클립보드에 복사했습니다.", "success");
  };

  const downloadScript = () => {
    const blob = new Blob([fullScript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `대본_${(state.topic || "untitled").slice(0, 20)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="animate-slide-in">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-sm font-medium text-accent">
          <span className="rounded-md bg-accent/10 px-2 py-0.5">STEP 8</span>
        </div>
        <h2 className="mt-2 text-2xl font-bold text-slate-50">메타데이터 출력</h2>
        <p className="mt-1 text-sm text-slate-400">
          최종 대본({chars.toLocaleString("ko-KR")}자)을 바탕으로 업로드용 필수
          메타데이터 6종(설명·키워드 20·제목 20·썸네일 20·출처·퀴즈 2)을
          생성합니다.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base-900 transition hover:brightness-110 disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {running ? "생성 중…" : "메타데이터 생성"}
        </button>
        <button
          onClick={copyScript}
          className="inline-flex items-center gap-2 rounded-lg border border-base-600 px-3 py-2 text-sm text-slate-300 transition hover:text-accent"
        >
          <Copy className="h-4 w-4" />
          대본 전체 복사
        </button>
        <button
          onClick={downloadScript}
          className="inline-flex items-center gap-2 rounded-lg border border-base-600 px-3 py-2 text-sm text-slate-300 transition hover:text-accent"
        >
          <Download className="h-4 w-4" />
          대본 .txt 저장
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
            AI Output 에디터 · 메타데이터
          </label>
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            spellCheck={false}
            placeholder="설명 / 키워드 20 / 제목 20 / 썸네일 문구 20 / 출처 / 퀴즈 2가 여기에 표시됩니다."
            className="preserve-breaks h-[520px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none transition focus:border-accent/70"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
            User Input · 작업자 가이드
          </label>
          <textarea
            value={guide}
            onChange={(e) => setGuide(e.target.value)}
            placeholder="예: 제목은 호기심 자극형으로, 키워드에 지역명 포함"
            className="preserve-breaks h-[520px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-accent/70"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={!output.trim() || running}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:brightness-110 disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          메타데이터 저장 · 프로젝트 완성
        </button>
      </div>
    </section>
  );
}
