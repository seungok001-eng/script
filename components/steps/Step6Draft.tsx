"use client";

import { useState } from "react";
import { Loader2, Sparkles, StopCircle, Save, ArrowRight, CheckCircle2 } from "lucide-react";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep6Prompt } from "@/lib/prompts";
import {
  CHAPTER_PAIRS,
  joinChaptersBelow,
  pairFilled,
  splitChapters,
  allChaptersReady,
} from "@/lib/chapters";

export default function Step6Draft() {
  const { state, update, setStep } = useProject();
  const { toast } = useToast();
  const { runStream, abort, running } = useGenerate();

  const [moduleIdx, setModuleIdx] = useState(0);
  const pair = CHAPTER_PAIRS[moduleIdx];
  const [buffer, setBuffer] = useState(
    [state.draftChapters[pair[0]], state.draftChapters[pair[1]]]
      .filter(Boolean)
      .join("\n\n"),
  );
  const [guide, setGuide] = useState("");

  const switchModule = (idx: number) => {
    if (running) return;
    setModuleIdx(idx);
    const p = CHAPTER_PAIRS[idx];
    setBuffer(
      [state.draftChapters[p[0]], state.draftChapters[p[1]]]
        .filter(Boolean)
        .join("\n\n"),
    );
  };

  const handleStream = async () => {
    // 컨텍스트 고립: 이전 채팅 로그는 버리고 앞서 완성된 챕터 본문만 전송
    const previous = joinChaptersBelow(state.draftChapters, pair[0]);
    const prompt = buildStep6Prompt(state, pair, previous, guide);
    setBuffer("");
    await runStream(prompt, (text) => setBuffer((prev) => prev + text));
  };

  const handleSaveModule = () => {
    if (!buffer.trim()) {
      toast("저장할 본문이 없습니다.", "error");
      return;
    }
    const parsed = splitChapters(buffer, pair[0]);
    update({ draftChapters: { ...state.draftChapters, ...parsed } });
    toast(`챕터 ${pair[0]}–${pair[1]} 초안을 저장했습니다.`, "success");
  };

  const ready = allChaptersReady(state, "draft");

  return (
    <section className="animate-slide-in">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-sm font-medium text-accent">
          <span className="rounded-md bg-accent/10 px-2 py-0.5">STEP 6</span>
        </div>
        <h2 className="mt-2 text-2xl font-bold text-slate-50">
          초안 4분할 작성 · 스트리밍
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          서버 타임아웃을 막기 위해 2개 챕터씩 묶어 스트리밍으로 생성합니다. 각
          모듈은 앞서 완성된 챕터 본문만 컨텍스트로 받아 서사 일관성을 유지합니다.
        </p>
      </header>

      {/* 모듈 탭 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {CHAPTER_PAIRS.map((p, i) => {
          const filled = pairFilled(state.draftChapters, p);
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
            <Sparkles className="h-4 w-4" />
          )}
          {running ? "스트리밍 중…" : `챕터 ${pair[0]}–${pair[1]} 생성`}
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
          이 모듈 저장
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
            AI Output 에디터 · 챕터 {pair[0]}–{pair[1]} (실시간 스트리밍)
          </label>
          <textarea
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            spellCheck={false}
            placeholder="생성 버튼을 누르면 본문이 한 글자씩 실시간으로 흘러나옵니다."
            className="preserve-breaks h-[520px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none transition focus:border-accent/70"
          />
          <p className="mt-1 text-right text-xs text-slate-500">
            {buffer.length.toLocaleString("ko-KR")}자
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
            User Input · 작업자 가이드
          </label>
          <textarea
            value={guide}
            onChange={(e) => setGuide(e.target.value)}
            placeholder="이 모듈에만 적용할 추가 지시. (선택)"
            className="preserve-breaks h-[520px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-accent/70"
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-4">
        {!ready && (
          <p className="text-xs text-slate-500">
            8개 챕터를 모두 저장하면 다음 단계로 넘어갈 수 있습니다.
          </p>
        )}
        <button
          onClick={() => setStep(7)}
          disabled={!ready || running}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:brightness-110 disabled:opacity-40"
        >
          정밀 퇴고 · 7단계로
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
