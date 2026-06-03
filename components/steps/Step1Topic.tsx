"use client";

import { useState } from "react";
import { Search, FileText, Sparkles, Link2 } from "lucide-react";
import StepShell from "../StepShell";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep1Prompt, type TopicMode } from "@/lib/prompts";
import { tempFor } from "@/lib/phases";

const MODES: { id: TopicMode; label: string; icon: typeof Search; hint: string }[] = [
  { id: "keyword", label: "키워드", icon: Search, hint: "키워드를 출발점으로 딥리서치" },
  { id: "reference", label: "레퍼런스 대본", icon: FileText, hint: "레퍼런스를 분석해 인접 주제 발굴" },
  { id: "auto", label: "AI 자율 추천", icon: Sparkles, hint: "AI가 직접 시의성 주제 발굴" },
];

export default function Step1Topic() {
  const { state, update, setStep } = useProject();
  const { toast } = useToast();
  const { run, running, lastSources } = useGenerate();

  const [mode, setMode] = useState<TopicMode>("keyword");
  const [keyword, setKeyword] = useState("");
  const [reference, setReference] = useState("");
  const [output, setOutput] = useState(state.topic);
  const [guide, setGuide] = useState("");

  const handleGenerate = async () => {
    let input = "";
    if (mode === "keyword") {
      if (!keyword.trim()) {
        toast("먼저 키워드를 입력해 주세요.", "error");
        return;
      }
      input = keyword.trim();
    } else if (mode === "reference") {
      if (!reference.trim()) {
        toast("레퍼런스 대본을 붙여넣어 주세요.", "error");
        return;
      }
      input = reference.trim();
    }
    // 세 루트 모두 웹 검색 그라운딩(딥리서치)을 켜고 최신 자료를 조사한다.
    const text = await run(buildStep1Prompt(mode, input, guide), {
      temperature: tempFor(1),
      enableSearch: true,
    });
    if (text) setOutput(text);
  };

  const handleConfirm = () => {
    if (!output.trim()) {
      toast("확정할 주제 내용이 비어 있습니다.", "error");
      return;
    }
    update({ topic: output.trim() });
    toast("주제를 확정했습니다.", "success");
    setStep(2);
  };

  return (
    <StepShell
      step={1}
      title="딥리서치 기반 주제 발굴"
      subtitle="키워드·레퍼런스·AI 자율 세 가지 루트로, 국내외 최신 자료를 웹 검색으로 조사해 조회수 터질 주제를 5가지 이상 추천합니다. 마음에 드는 주제만 남기고 다듬어 확정하세요."
      aiOutput={output}
      onAiOutputChange={setOutput}
      aiPlaceholder="AI가 추천한 주제 5가지 이상이 여기에 표시됩니다. 최종 확정할 주제만 남기도록 편집하세요."
      userInput={guide}
      onUserInputChange={setGuide}
      userPlaceholder="예: B2B 반도체 장비 쪽으로, 너무 자극적이지 않게"
      onGenerate={handleGenerate}
      generating={running}
      generateLabel="주제 5가지 이상 추천"
      onConfirm={handleConfirm}
      canConfirm={!!output.trim()}
      confirmLabel="이 주제로 확정 · 2단계로"
    >
      <div className="space-y-3">
        {/* 입력 루트 선택 */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
            주제 발굴 루트
          </label>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  disabled={running}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition disabled:opacity-50 ${
                    active
                      ? "border-accent bg-accent/10 text-slate-50"
                      : "border-base-600 bg-base-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {MODES.find((m) => m.id === mode)?.hint}
          </p>
        </div>

        {/* 루트별 입력 */}
        {mode === "keyword" && (
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              핵심 키워드
            </label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="예: 한국 방산 수출, 엔비디아 HBM, 사우디 네옴시티…"
              className="w-full rounded-lg border border-base-600 bg-base-800/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-accent/70"
            />
          </div>
        )}

        {mode === "reference" && (
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              레퍼런스 대본 / 콘텐츠
            </label>
            <textarea
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="참고할 대본 전문이나 콘텐츠 개요를 붙여넣으세요. AI가 분석해 같은 결로 더 터질 주제를 발굴합니다."
              className="preserve-breaks h-40 w-full resize-none rounded-lg border border-base-600 bg-base-800/70 p-3 text-sm leading-relaxed text-slate-100 outline-none transition focus:border-accent/70"
            />
          </div>
        )}

        {mode === "auto" && (
          <div className="rounded-lg border border-base-600 bg-base-800/50 p-3 text-xs leading-relaxed text-slate-400">
            별도 입력 없이 <span className="text-accent">주제 5가지 이상 추천</span> 버튼을 누르면, AI가
            웹 검색으로 지금 가장 시의성 있고 조회수 폭발력이 큰 주제를 직접 발굴합니다. 방향만 좁히고
            싶다면 아래 작업자 가이드에 분야를 적어주세요.
          </div>
        )}

        {/* 그라운딩 출처 */}
        {lastSources.length > 0 && (
          <div className="rounded-xl border border-base-600 bg-base-800/50 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Link2 className="h-3.5 w-3.5" />
              웹 검색 그라운딩 출처 {lastSources.length}건
            </p>
            <ul className="space-y-1">
              {lastSources.map((s, i) => (
                <li key={i} className="truncate text-xs">
                  <a
                    href={s.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 hover:text-accent hover:underline"
                  >
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </StepShell>
  );
}
