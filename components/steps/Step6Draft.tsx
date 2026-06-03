"use client";

import { useState } from "react";
import {
  Loader2,
  Sparkles,
  StopCircle,
  Save,
  ArrowRight,
  CheckCircle2,
  Rocket,
} from "lucide-react";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep6Prompt, buildLedgerUpdatePrompt } from "@/lib/prompts";
import { tempFor } from "@/lib/phases";
import { analyzeScript } from "@/lib/qa";
import QAPanel from "../QAPanel";
import ProgressGauge from "../ProgressGauge";
import {
  CHAPTER_PAIRS,
  previousModuleText,
  pairFilled,
  splitChapters,
  allChaptersReady,
  totalChars,
} from "@/lib/chapters";

const MODULE_MIN = 5000; // 2챕터 합산 타깃 하한 (2,500 × 2)
const MODULE_MAX = 7000; // 2챕터 합산 타깃 상한 (3,500 × 2)
const QA_OPTS = { minChars: MODULE_MIN, maxChars: MODULE_MAX };

export default function Step6Draft() {
  const { state, update, setStep } = useProject();
  const { toast } = useToast();
  const { run, runStream, abort, running } = useGenerate();

  const [moduleIdx, setModuleIdx] = useState(0);
  const pair = CHAPTER_PAIRS[moduleIdx];
  const [buffer, setBuffer] = useState(
    [state.draftChapters[pair[0]], state.draftChapters[pair[1]]]
      .filter(Boolean)
      .join("\n\n"),
  );
  const [guide, setGuide] = useState("");
  const [auto, setAuto] = useState(false);

  const busy = running || auto;

  const switchModule = (idx: number) => {
    if (busy) return;
    setModuleIdx(idx);
    const p = CHAPTER_PAIRS[idx];
    setBuffer(
      [state.draftChapters[p[0]], state.draftChapters[p[1]]]
        .filter(Boolean)
        .join("\n\n"),
    );
  };

  /** 떡밥 원장 갱신 (모듈 생성 직후 경량 호출) */
  const refreshLedger = async (
    chapterText: string,
    p: [number, number],
    baseLedger: string,
  ): Promise<string> => {
    const updated = await run(
      buildLedgerUpdatePrompt(baseLedger, chapterText, p),
      { temperature: 0.2 },
    );
    return updated ?? baseLedger;
  };

  const handleStream = async () => {
    // 컨텍스트 다이어트: 직전 모듈 2챕터 본문 + 항상 동봉되는 떡밥 원장
    const previous = previousModuleText(state.draftChapters, moduleIdx);
    const prompt = buildStep6Prompt(
      state,
      pair,
      previous,
      state.foreshadowLedger,
      guide,
    );
    let acc = "";
    setBuffer("");
    const ok = await runStream(
      prompt,
      (t) => {
        acc += t;
        setBuffer((prev) => prev + t);
      },
      { temperature: tempFor(6) },
    );
    if (ok && acc.trim()) {
      const parsed = splitChapters(acc, pair[0]);
      const ledger = await refreshLedger(acc, pair, state.foreshadowLedger);
      update({
        draftChapters: { ...state.draftChapters, ...parsed },
        foreshadowLedger: ledger,
      });
      toast(`챕터 ${pair[0]}–${pair[1]} 초안 + 떡밥 원장을 갱신했습니다.`, "success");
    }
  };

  const handleSaveModule = async () => {
    if (!buffer.trim()) {
      toast("저장할 본문이 없습니다.", "error");
      return;
    }
    const parsed = splitChapters(buffer, pair[0]);
    const ledger = await refreshLedger(buffer, pair, state.foreshadowLedger);
    update({
      draftChapters: { ...state.draftChapters, ...parsed },
      foreshadowLedger: ledger,
    });
    toast(`챕터 ${pair[0]}–${pair[1]} 저장 + 떡밥 원장 갱신 완료.`, "success");
  };

  /** ★ QA 가드형 전체 자동 생성 — 4개 모듈을 순차 독립 호출 */
  const handleAutoAll = async () => {
    setAuto(true);
    let draftMap = { ...state.draftChapters };
    let ledger = state.foreshadowLedger;
    const warns: string[] = [];

    for (let i = 0; i < CHAPTER_PAIRS.length; i++) {
      const p = CHAPTER_PAIRS[i];
      setModuleIdx(i);
      // 매번 컨텍스트를 새로 조립(직전 모듈 본문 + 갱신된 원장) — 대화 누적 없음
      const previous = previousModuleText(draftMap, i);
      const prompt = buildStep6Prompt(state, p, previous, ledger, guide);
      let acc = "";
      setBuffer("");
      const ok = await runStream(
        prompt,
        (t) => {
          acc += t;
          setBuffer((prev) => prev + t);
        },
        { temperature: tempFor(6) },
      );
      if (!ok || !acc.trim()) {
        warns.push(`모듈 ${i + 1} 중단/실패 — 이후 중단`);
        break;
      }

      draftMap = { ...draftMap, ...splitChapters(acc, p[0]) };

      // QA 게이트: 위반을 감지해 경고 누적(자동 진행은 계속, 사람이 사후 검수)
      const qa = analyzeScript(acc, QA_OPTS);
      if (qa.warnings.length) {
        warns.push(`챕터 ${p[0]}–${p[1]}: ${qa.warnings.slice(0, 3).join(" / ")}`);
      }

      ledger = await refreshLedger(acc, p, ledger);
      update({ draftChapters: draftMap, foreshadowLedger: ledger });
    }

    setAuto(false);
    if (warns.length) {
      toast(`자동 생성 완료 · 검수 권장 ${warns.length}건. QA 패널을 확인하세요.`, "info");
    } else {
      toast("전체 자동 생성 완료! 모든 모듈 QA 통과.", "success");
    }
  };

  const ready = allChaptersReady(state, "draft");
  const written = totalChars(state.draftChapters);

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
          2개 챕터씩 독립 호출로 생성합니다. 본문 컨텍스트는 직전 모듈로만
          바운딩하고, 전 챕터 떡밥은 매 호출에 동봉되는 떡밥 원장이 추적합니다.
        </p>
      </header>

      <div className="mb-4">
        <ProgressGauge current={written} label="초안 누적 분량" />
      </div>

      {/* 모듈 탭 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {CHAPTER_PAIRS.map((p, i) => {
          const filled = pairFilled(state.draftChapters, p);
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
            <Sparkles className="h-4 w-4" />
          )}
          {running && !auto ? "스트리밍 중…" : `챕터 ${pair[0]}–${pair[1]} 생성`}
        </button>

        <button
          onClick={handleAutoAll}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/20 disabled:opacity-50"
        >
          {auto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          {auto ? "전체 자동 생성 중…" : "전체 자동 생성 (QA 가드)"}
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
            className="preserve-breaks h-[420px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none transition focus:border-accent/70"
          />
          <p className="mt-1 text-right text-xs text-slate-500">
            {buffer.length.toLocaleString("ko-KR")}자
          </p>
          <div className="mt-2">
            <QAPanel text={buffer} opts={QA_OPTS} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              User Input · 작업자 가이드
            </label>
            <textarea
              value={guide}
              onChange={(e) => setGuide(e.target.value)}
              placeholder="이 모듈에만 적용할 추가 지시. (선택)"
              className="preserve-breaks h-[200px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-accent/70"
            />
          </div>
          <div className="min-h-0 flex-1">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              떡밥 원장 (자동 갱신)
            </label>
            <div className="preserve-breaks h-[202px] overflow-auto rounded-xl border border-base-600 bg-base-900/60 p-3 text-xs leading-relaxed text-slate-400">
              {state.foreshadowLedger || "모듈을 생성하면 떡밥/복선 회수 현황이 여기에 자동 기록됩니다."}
            </div>
          </div>
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
          disabled={!ready || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:brightness-110 disabled:opacity-40"
        >
          정밀 퇴고 · 7단계로
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
