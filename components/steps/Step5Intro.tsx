"use client";

import { useMemo, useState } from "react";
import { Clapperboard, Check, Trophy } from "lucide-react";
import StepShell from "../StepShell";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep5Prompt } from "@/lib/prompts";
import { tempFor } from "@/lib/phases";
import { parseIntroSets } from "@/lib/chapters";
import { parseSetRanks } from "@/lib/topics";
import type { IntroSet } from "@/lib/types";

export default function Step5Intro() {
  const { state, update, setStep } = useProject();
  const { toast } = useToast();
  const { run, running } = useGenerate();

  // 생성된 인트로 원문을 영속화하여 이동/새로고침 시에도 카드가 보존된다.
  const [output, setOutput] = useState(state.introRaw);
  const [guide, setGuide] = useState("");
  const [selected, setSelected] = useState<IntroSet | null>(
    state.introSet.text ? state.introSet : null,
  );

  const sets = useMemo(() => parseIntroSets(output), [output]);
  const ranks = useMemo(() => parseSetRanks(output), [output]);

  const handleGenerate = async () => {
    // 5단계는 실제 인트로 '대사'를 집필하므로 작가용 시스템 인스트럭션을 사용한다.
    // (기획용 instruction은 인트로 문장 작성을 금지하므로 planning을 켜면 안 됨)
    const text = await run(buildStep5Prompt(state, guide), {
      temperature: tempFor(5),
    });
    if (text) {
      setOutput(text);
      update({ introRaw: text });
      setSelected(null);
    }
  };

  const handleConfirm = () => {
    if (!selected) {
      toast("인트로 세트를 하나 선택해 주세요.", "error");
      return;
    }
    update({ introSet: selected, introRaw: output });
    toast("인트로 세트를 선택했습니다.", "success");
    setStep(6);
  };

  return (
    <StepShell
      step={5}
      title="인트로 및 클릭률 폭발 세트 제안"
      subtitle="시놉시스를 바탕으로 300자+ 인트로 10가지를 [제목 + 썸네일 카피]와 한 세트로 묶어 제안합니다. 카드에서 하나를 선택하세요."
      aiOutput={output}
      onAiOutputChange={setOutput}
      aiPlaceholder="인트로 세트 10가지가 생성되면 아래 카드로 표시됩니다."
      userInput={guide}
      onUserInputChange={setGuide}
      userPlaceholder="예: 도발적인 질문형 제목 위주로, 숫자를 넣어서"
      onGenerate={handleGenerate}
      generating={running}
      generateLabel="인트로 세트 10가지 제안"
      onConfirm={handleConfirm}
      canConfirm={!!selected}
      confirmLabel="초안 작성 · 6단계로"
    >
      {sets.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {sets.map((s, i) => {
            const isSel =
              selected?.text === s.text && selected?.title === s.title;
            const setNum = i + 1;
            const rank =
              setNum === ranks.first ? 1 : setNum === ranks.second ? 2 : 0;
            const reason = rank ? ranks.reasons[setNum] : "";
            return (
              <button
                key={i}
                onClick={() => setSelected(s)}
                className={`relative rounded-xl border p-4 text-left transition ${
                  isSel
                    ? "border-accent bg-accent/10 shadow-glow"
                    : rank
                      ? "border-gold/50 bg-base-800/60 hover:bg-base-700/60"
                      : "border-base-600 bg-base-800/60 hover:border-base-600/80 hover:bg-base-700/60"
                }`}
              >
                {isSel && (
                  <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-accent text-base-900">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                      <Clapperboard className="h-3.5 w-3.5" />
                      세트 {setNum}
                    </span>
                    {rank > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-gold/15 px-1.5 py-0.5 text-[11px] font-bold text-gold">
                        <Trophy className="h-3 w-3" />
                        AI {rank}순위
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[11px] font-medium ${
                      s.text.length >= 300 ? "text-emerald-400" : "text-gold"
                    }`}
                  >
                    인트로 {s.text.length.toLocaleString("ko-KR")}자
                  </span>
                </div>
                <p className="text-sm font-bold leading-snug text-slate-50">
                  {s.title || "(제목 없음)"}
                </p>
                <p className="mt-1 text-xs text-gold">🖼 {s.thumbnail || "—"}</p>
                {reason && (
                  <p className="mt-2 rounded-lg border border-gold/30 bg-gold/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-gold/90">
                    AI 추천 이유: {reason}
                  </p>
                )}
                <div className="preserve-breaks mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-base-900/50 p-2.5 text-xs leading-relaxed text-slate-300">
                  {s.text || "—"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </StepShell>
  );
}
