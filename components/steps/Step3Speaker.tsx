"use client";

import { useState } from "react";
import StepShell from "../StepShell";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep3Prompt } from "@/lib/prompts";
import { tempFor } from "@/lib/phases";

export default function Step3Speaker() {
  const { state, update, setStep } = useProject();
  const { toast } = useToast();
  const { run, running } = useGenerate();

  const [output, setOutput] = useState(state.speakerProfile);
  const [guide, setGuide] = useState("");

  const handleGenerate = async () => {
    const text = await run(buildStep3Prompt(state, guide), {
      temperature: tempFor(3),
    });
    if (text) setOutput(text);
  };

  const handleConfirm = () => {
    if (!output.trim()) {
      toast("선택한 화자 프로필 내용이 비어 있습니다.", "error");
      return;
    }
    update({ speakerProfile: output.trim() });
    toast("화자 프로필을 선택했습니다.", "success");
    setStep(4);
  };

  return (
    <StepShell
      step={3}
      title="화자 프로필 설정"
      subtitle="팩트 리포트를 기반으로 1인칭 화자 프로필 3버전을 제안합니다. 한 가지를 골라 편집한 뒤 확정하세요."
      aiOutput={output}
      onAiOutputChange={setOutput}
      aiPlaceholder="화자 프로필 A·B·C가 여기에 표시됩니다. 선택한 한 가지만 남기고 다듬으세요."
      userInput={guide}
      onUserInputChange={setGuide}
      userPlaceholder="예: 좀 더 냉소적이고 데이터에 집착하는 캐릭터로"
      onGenerate={handleGenerate}
      generating={running}
      generateLabel="화자 프로필 3버전 제안"
      onConfirm={handleConfirm}
      canConfirm={!!output.trim()}
      confirmLabel="시놉시스 기획 · 4단계로"
    />
  );
}
