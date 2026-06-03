"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import StepShell from "../StepShell";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep3Prompt } from "@/lib/prompts";
import { parseProfileCards } from "@/lib/topics";
import { tempFor } from "@/lib/phases";

export default function Step3Speaker() {
  const { state, update, setStep } = useProject();
  const { toast } = useToast();
  const { run, running } = useGenerate();

  const [output, setOutput] = useState(state.speakerProfile);
  const [guide, setGuide] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const cards = parseProfileCards(recommendations);

  const handleGenerate = async () => {
    const text = await run(buildStep3Prompt(state, guide), {
      temperature: tempFor(3),
      planning: true,
    });
    if (text) {
      setRecommendations(text);
      setSelectedIdx(null);
    }
  };

  const handleSelectCard = (idx: number, full: string) => {
    setSelectedIdx(idx);
    setOutput(full);
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
      subtitle="팩트 리포트를 기반으로 1인칭 화자 프로필 5버전을 제안합니다. 카드를 클릭해 한 가지를 고른 뒤 다듬어 확정하세요."
      aiOutput={output}
      onAiOutputChange={setOutput}
      aiPlaceholder="위에서 프로필 카드를 클릭하면 선택한 프로필이 여기에 표시됩니다. 직접 다듬어 확정하세요."
      userInput={guide}
      onUserInputChange={setGuide}
      userPlaceholder="예: 좀 더 냉소적이고 데이터에 집착하는 캐릭터로"
      onGenerate={handleGenerate}
      generating={running}
      generateLabel="화자 프로필 5버전 제안"
      onConfirm={handleConfirm}
      canConfirm={!!output.trim()}
      confirmLabel="시놉시스 기획 · 4단계로"
    >
      {cards.length > 0 && (
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
            화자 프로필 {cards.length}개 · 카드를 클릭해 선택하세요
          </label>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((c, i) => {
              const active = selectedIdx === i;
              return (
                <button
                  key={i}
                  onClick={() => handleSelectCard(i, c.full)}
                  className={`flex flex-col rounded-xl border p-4 text-left transition ${
                    active
                      ? "border-accent bg-accent/10 ring-1 ring-accent"
                      : "border-base-600 bg-base-800/60 hover:border-accent/60 hover:bg-base-800"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                      {c.badge}
                    </span>
                    {active && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        선택됨
                      </span>
                    )}
                  </div>
                  <h4 className="mb-2 text-sm font-bold leading-snug text-slate-50">
                    {c.title}
                  </h4>
                  <div className="preserve-breaks max-h-48 overflow-auto text-xs leading-relaxed text-slate-400">
                    {c.body}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </StepShell>
  );
}
