"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Wand2,
  StopCircle,
  Save,
  ArrowRight,
  CheckCircle2,
  Rocket,
} from "lucide-react";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep7Prompt } from "@/lib/prompts";
import { tempFor } from "@/lib/phases";
import { analyzeScript } from "@/lib/qa";
import QAPanel from "../QAPanel";
import ProgressGauge from "../ProgressGauge";
import CopyButton from "../CopyButton";
import {
  CHAPTER_PAIRS,
  pairFilled,
  splitChapters,
  allChaptersReady,
  totalChars,
} from "@/lib/chapters";

const QA_OPTS = { minChars: 5000, maxChars: 8000 }; // 2챕터 합산(전체 최소 ~2만자)

export default function Step7Revise() {
  const { state, update, setStep } = useProject();
  const { toast } = useToast();
  const { runStream, abort, running } = useGenerate();

  const [moduleIdx, setModuleIdx] = useState(0);
  const pair = CHAPTER_PAIRS[moduleIdx];
  const [auto, setAuto] = useState(false);
  const [guide, setGuide] = useState("");
  const busy = running || auto;

  const draftPairText = (p: [number, number]) =>
    [state.draftChapters[p[0]], state.draftChapters[p[1]]]
      .filter(Boolean)
      .join("\n\n");

  const [buffer, setBuffer] = useState(
    [state.finalChapters[pair[0]], state.finalChapters[pair[1]]]
      .filter(Boolean)
      .join("\n\n") || draftPairText(pair),
  );

  // 에디터 내용 자동 저장: 퇴고·편집분을 finalChapters에 반영해 수동 저장 없이도
  // 다음 단계로 진행 가능하게 한다. (퇴고하지 않은 모듈은 초안이 최종본으로 채워짐)
  useEffect(() => {
    if (auto || !buffer.trim()) return;
    const id = setTimeout(() => {
      update({
        finalChapters: { ...state.finalChapters, ...splitChapters(buffer, pair[0]) },
      });
    }, 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, moduleIdx, auto]);

  const switchModule = (idx: number) => {
    if (busy) return;
    setModuleIdx(idx);
    const p = CHAPTER_PAIRS[idx];
    const final = [state.finalChapters[p[0]], state.finalChapters[p[1]]]
      .filter(Boolean)
      .join("\n\n");
    setBuffer(final || draftPairText(p));
  };

  const handleStream = async () => {
    const prompt = buildStep7Prompt(state, pair, draftPairText(pair), guide);
    let acc = "";
    setBuffer("");
    const ok = await runStream(
      prompt,
      (t) => {
        acc += t;
        setBuffer((prev) => prev + t);
      },
      { temperature: tempFor(7) },
    );
    if (ok && acc.trim()) {
      update({
        finalChapters: { ...state.finalChapters, ...splitChapters(acc, pair[0]) },
      });
      toast(`챕터 ${pair[0]}–${pair[1]} 최종본을 갱신했습니다.`, "success");
    }
  };

  const handleSaveModule = () => {
    if (!buffer.trim()) {
      toast("저장할 본문이 없습니다.", "error");
      return;
    }
    update({
      finalChapters: { ...state.finalChapters, ...splitChapters(buffer, pair[0]) },
    });
    toast(`챕터 ${pair[0]}–${pair[1]} 최종본을 저장했습니다.`, "success");
  };

  /** QA 가드형 전체 자동 퇴고 */
  const handleAutoAll = async () => {
    setAuto(true);
    let finalMap = { ...state.finalChapters };
    const warns: string[] = [];

    for (let i = 0; i < CHAPTER_PAIRS.length; i++) {
      const p = CHAPTER_PAIRS[i];
      setModuleIdx(i);
      const draft = draftPairText(p);
      if (!draft.trim()) {
        warns.push(`모듈 ${i + 1} 초안 없음 — 건너뜀`);
        continue;
      }
      const prompt = buildStep7Prompt(state, p, draft, "");
      let acc = "";
      setBuffer("");
      const ok = await runStream(
        prompt,
        (t) => {
          acc += t;
          setBuffer((prev) => prev + t);
        },
        { temperature: tempFor(7) },
      );
      if (!ok || !acc.trim()) {
        warns.push(`모듈 ${i + 1} 중단/실패 — 이후 중단`);
        break;
      }
      finalMap = { ...finalMap, ...splitChapters(acc, p[0]) };
      const qa = analyzeScript(acc, QA_OPTS);
      if (qa.warnings.length) {
        warns.push(`챕터 ${p[0]}–${p[1]}: ${qa.warnings.slice(0, 3).join(" / ")}`);
      }
      update({ finalChapters: finalMap });
    }

    setAuto(false);
    toast(
      warns.length
        ? `자동 퇴고 완료 · 검수 권장 ${warns.length}건.`
        : "전체 자동 퇴고 완료! 모든 모듈 QA 통과.",
      warns.length ? "info" : "success",
    );
  };

  const ready = allChaptersReady(state, "final");
  const written = totalChars(state.finalChapters);

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
          초안을 2개 챕터씩 정밀 퇴고합니다. 늘어지는 설명은 비유로 압축하되,
          고품질 구간은 억지로 줄이지 않고 보존합니다.
        </p>
      </header>

      <div className="mb-4">
        <ProgressGauge current={written} target={20000} label="최종본 누적 분량 (최소 20,000자)" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {CHAPTER_PAIRS.map((p, i) => {
          const filled = pairFilled(state.finalChapters, p);
          const active = i === moduleIdx;
          return (
            <button
              key={i}
              onClick={() => switchModule(i)}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
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
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base-900 transition hover:brightness-110 disabled:opacity-50"
        >
          {running && !auto ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {running && !auto ? "퇴고 중…" : `챕터 ${pair[0]}–${pair[1]} 퇴고`}
        </button>

        <button
          onClick={handleAutoAll}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/20 disabled:opacity-50"
        >
          {auto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          {auto ? "전체 자동 퇴고 중…" : "전체 자동 퇴고 (QA 가드)"}
        </button>

        {busy && (
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
          disabled={busy || !buffer.trim()}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          최종본 저장
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              AI Output 에디터 · 챕터 {pair[0]}–{pair[1]} 최종본
            </label>
            <CopyButton text={buffer} />
          </div>
          <textarea
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            spellCheck={false}
            placeholder="초안이 로드되어 있습니다. 퇴고 버튼을 누르면 정밀 수정본이 스트리밍됩니다."
            className="preserve-breaks h-[420px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none transition focus:border-accent/70"
          />
          <p className="mt-1 text-right text-xs text-slate-500">
            {buffer.length.toLocaleString("ko-KR")}자
          </p>
          <div className="mt-2">
            <QAPanel text={buffer} opts={QA_OPTS} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
            User Input · 퇴고 지시
          </label>
          <textarea
            value={guide}
            onChange={(e) => setGuide(e.target.value)}
            placeholder="예: 챕터 도입부 호흡을 더 짧게, 통계 인용은 그대로 유지 (개별 퇴고에 적용)"
            className="preserve-breaks h-[420px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-accent/70"
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
          disabled={!ready || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:brightness-110 disabled:opacity-40"
        >
          메타데이터 출력 · 8단계로
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
