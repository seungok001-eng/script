"use client";

import { useState } from "react";
import StepShell from "../StepShell";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep1Prompt } from "@/lib/prompts";

export default function Step1Topic() {
  const { state, update, setStep } = useProject();
  const { toast } = useToast();
  const { run, running } = useGenerate();

  const [keyword, setKeyword] = useState("");
  const [output, setOutput] = useState(state.topic);
  const [guide, setGuide] = useState("");

  const handleGenerate = async () => {
    if (!keyword.trim()) {
      toast("먼저 키워드를 입력해 주세요.", "error");
      return;
    }
    const text = await run(buildStep1Prompt(keyword.trim(), guide));
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
      title="주제 선정 및 추천"
      subtitle="키워드를 입력하면 지금 조회수가 터질 주제 3가지를 리포트로 제안합니다. 마음에 드는 주제만 남기고 다듬어 확정하세요."
      aiOutput={output}
      onAiOutputChange={setOutput}
      aiPlaceholder="AI가 제안한 주제 3가지가 여기에 표시됩니다. 최종 확정할 주제만 남기도록 편집하세요."
      userInput={guide}
      onUserInputChange={setGuide}
      userPlaceholder="예: B2B 반도체 장비 쪽으로, 너무 자극적이지 않게"
      onGenerate={handleGenerate}
      generating={running}
      generateLabel="주제 3가지 추천"
      onConfirm={handleConfirm}
      canConfirm={!!output.trim()}
      confirmLabel="이 주제로 확정 · 2단계로"
    >
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
    </StepShell>
  );
}
