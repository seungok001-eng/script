"use client";

import { useState } from "react";
import { Loader2, Wand2, StopCircle, Save, ArrowRight, CheckCircle2 } from "lucide-react";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep7Prompt } from "@/lib/prompts";
import {
  CHAPTER_PAIRS,
  pairFilled,
  splitChapters,
  allChaptersReady,
} from "@/lib/chapters";

export default function Step7Revise() {
  const { state, update, setStep } = useProject();
  const { toast } = useToast();
  const { runStream, abort, running } = useGenerate();

  const [moduleIdx, setModuleIdx] = useState(0);
  const pair = CHAPTER_PAIRS[moduleIdx];

  const draftPair = () =>
    [state.draftChapters[pair[0]], state.draftChapters[pair[1]]]
      .filter(Boolean)
      .join("\n\n");

  const [buffer, setBuffer] = useState(
    [state.finalChapters[pair[0]], state.finalChapters[pair[1]]]
      .filter(Boolean)
      .join("\n\n") || draftPair(),
  );
  const [guide, setGuide] = useState("");

  const switchModule = (idx: number) => {
    if (running) return;
    setModuleIdx(idx);
    const p = CHAPTER_PAIRS[idx];
    const final = [state.finalChapters[p[0]], state.finalChapters[p[1]]]
      .filter(Boolean)
      .join("\n\n");
    const draft = [state.draftChapters[p[0]], state.draftChapters[p[1]]]
      .filter(Boolean)
      .join("\n\n");
    setBuffer(final || draft);
  };

  const handleStream = async () => {
    const prompt = buildStep7Prompt(state, pair, draftPair(), guide);
    setBuffer("");
    await runStream(prompt, (text) => setBuffer((prev) => prev + text));
  };

  const handleSaveModule = () => {
    if (!buffer.trim()) {
      toast("저장할 본문이 없습니다.", "error");
      return;
    }
    const parsed = splitChapters(buffer, pair[0]);
    update({ finalChapters: { ...state.finalChapters, ...parsed } });
    toast(`챕터 ${pair[0]}–${pair[1]} 최종본을 저장했습니다.`, "success");
  };

  const ready = allChaptersReady(state, "final");

  return (
    <section className="animate-slide-in">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-sm font-medium text-accent">
          <span className="rounded-md bg-accent/10 px-2 py-0.5">STEP 7</span>
        </div>
        <h2 className="mt-2 text-2xl font-bold text-slate-50">
          시청지속시간 극대화 정밀 퇴고
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          초안을 2개 챕터씩 불러와 정밀 퇴고합니다. 늘어지는 설명은 비유로
          압축하되, 고품질 구간은 억지로 줄이지 않고 보존합니다.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {CHAPTER_PAIRS.map((p, i) => {
          const filled = pairFilled(state.finalChapters, p);
          const active = i === moduleIdx;
          return (
            <button
              key={i}
              onClick={() => switchModule(i)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                active
                  ? "border-accent bg-accent/10 text-slate-50"
                  : "border-base-600 bg-base-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {filled && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              모듈 {i + 1} · 챕터 {p[0]}–{p[1]}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleStream}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base-900 transition hover:brightness-110 disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {running ? "퇴고 중…" : `챕터 ${pair[0]}–${pair[1]} 퇴고`}
        </button>
        {running && (
          <button
            onClick={abort}
            className="inline-flex items-center gap-2 rounded-lg border border-base-600 px-3 py-2 text-sm text-slate-300 transition hover:border-red-500 hover:text-red-400"
          >
            <StopCircle className="h-4 w-4" />
            중단
          </button>
        )}
        <button
          onClick={handleSaveModule}
          disabled={running || !buffer.trim()}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          최종본 저장
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
            AI Output 에디터 · 챕터 {pair[0]}–{pair[1]} 최종본
          </label>
          <textarea
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            spellCheck={false}
            placeholder="초안이 로드되어 있습니다. 퇴고 버튼을 누르면 정밀 수정본이 스트리밍됩니다."
            className="preserve-breaks h-[520px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none transition focus:border-accent/70"
          />
          <p className="mt-1 text-right text-xs text-slate-500">
            {buffer.length.toLocaleString("ko-KR")}자
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
            User Input · 퇴고 지시
          </label>
          <textarea
            value={guide}
            onChange={(e) => setGuide(e.target.value)}
            placeholder="예: 챕터 도입부의 호흡을 더 짧게, 통계 인용은 그대로 유지"
            className="preserve-breaks h-[520px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-accent/70"
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-4">
        {!ready && (
          <p className="text-xs text-slate-500">
            8개 챕터 최종본을 모두 저장하면 메타데이터 단계로 넘어갑니다.
          </p>
        )}
        <button
          onClick={() => setStep(8)}
          disabled={!ready || running}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:brightness-110 disabled:opacity-40"
        >
          메타데이터 출력 · 8단계로
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
