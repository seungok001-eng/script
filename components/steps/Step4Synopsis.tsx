"use client";

import { useState } from "react";
import StepShell from "../StepShell";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep4Prompt } from "@/lib/prompts";
import { tempFor } from "@/lib/phases";

export default function Step4Synopsis() {
  const { state, update, setStep } = useProject();
  const { toast } = useToast();
  const { run, running } = useGenerate();

  const [output, setOutput] = useState(state.synopsis);
  const [guide, setGuide] = useState("");

  const handleGenerate = async () => {
    const text = await run(buildStep4Prompt(state, guide), {
      temperature: tempFor(4),
      planning: true,
    });
    if (text) setOutput(text);
  };

  const handleConfirm = () => {
    if (!output.trim()) {
      toast("시놉시스 내용이 비어 있습니다.", "error");
      return;
    }
    update({ synopsis: output.trim() });
    toast("8챕터 시놉시스를 확정했습니다.", "success");
    setStep(5);
  };

  return (
    <StepShell
      step={4}
      title="8챕터 상세 시놉시스 기획"
      subtitle="[확정 주제 + 팩트 리포트 + 화자 프로필]을 결합해 24,000자를 감당할 거시적 8챕터 구조를 설계합니다. 챕터별 타깃 분량(2,500~3,500자)이 명시됩니다."
      aiOutput={output}
      onAiOutputChange={setOutput}
      aiPlaceholder="8개 챕터 구조와 텐션 장치 배치, 분량 가이드가 여기에 표시됩니다."
      userInput={guide}
      onUserInputChange={setGuide}
      userPlaceholder="예: 챕터 5에 결정적 반전을 배치하고, 마지막은 행동 촉구로"
      onGenerate={handleGenerate}
      generating={running}
      generateLabel="8챕터 시놉시스 기획"
      onConfirm={handleConfirm}
      canConfirm={!!output.trim()}
      confirmLabel="인트로 세트 제안 · 5단계로"
    />
  );
}
