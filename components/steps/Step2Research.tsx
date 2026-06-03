"use client";

import { useState } from "react";
import { ShieldCheck, Link2 } from "lucide-react";
import StepShell from "../StepShell";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep2Prompt } from "@/lib/prompts";
import { tempFor } from "@/lib/phases";

export default function Step2Research() {
  const { state, update, setStep } = useProject();
  const { toast } = useToast();
  const { run, running, lastSources } = useGenerate();

  const [output, setOutput] = useState(state.factReport);
  const [guide, setGuide] = useState("");
  // 사용자가 '팩트 컨펌'을 누르기 전까지 다음 단계 진입을 원천 차단
  const [factConfirmed, setFactConfirmed] = useState(!!state.factReport);

  const handleGenerate = async () => {
    setFactConfirmed(false);
    // 실제 웹 검색 그라운딩 활성화 + 낮은 temperature로 팩트 정확성 확보
    const text = await run(buildStep2Prompt(state.topic, guide), {
      temperature: tempFor(2),
      enableSearch: true,
    });
    if (text) setOutput(text);
  };

  const handleConfirm = () => {
    update({ factReport: output.trim() });
    toast("팩트 리포트를 승인했습니다.", "success");
    setStep(3);
  };

  return (
    <StepShell
      step={2}
      title="딥리서치 & 팩트 리포트"
      subtitle="웹 검색을 시뮬레이션해 실제 지표·기술 스펙·뉴스를 정리합니다. 직접 사실을 검수하고 [팩트 컨펌]을 눌러야 다음 단계로 진입할 수 있습니다."
      aiOutput={output}
      onAiOutputChange={(v) => {
        setOutput(v);
        setFactConfirmed(false);
      }}
      aiPlaceholder="리서치 결과 팩트 리포트가 여기에 표시됩니다. 수치/출처를 직접 검수·수정하세요."
      userInput={guide}
      onUserInputChange={setGuide}
      userPlaceholder="예: 2024년 이후 최신 통계 위주로, 출처 링크 형태로 명시"
      onGenerate={handleGenerate}
      generating={running}
      generateLabel="팩트 리포트 생성"
      onConfirm={handleConfirm}
      canConfirm={factConfirmed && !!output.trim()}
      confirmLabel="화자 프로필 설정 · 3단계로"
    >
      {lastSources.length > 0 && (
        <div className="mb-3 rounded-xl border border-base-600 bg-base-800/50 p-4">
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
      <div className="flex items-center justify-between rounded-xl border border-base-600 bg-base-800/50 px-4 py-3">
        <p className="text-sm text-slate-400">
          모든 수치를 검수하셨다면 팩트를 컨펌하세요. 컨펌 전에는 다음 단계로
          넘어갈 수 없습니다.
        </p>
        <button
          onClick={() => {
            if (!output.trim()) {
              toast("먼저 팩트 리포트를 생성하세요.", "error");
              return;
            }
            setFactConfirmed(true);
            toast("팩트를 컨펌했습니다.", "success");
          }}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            factConfirmed
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-gold/20 text-gold hover:bg-gold/30"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          {factConfirmed ? "팩트 컨펌 완료" : "팩트 컨펌"}
        </button>
      </div>
    </StepShell>
  );
}
