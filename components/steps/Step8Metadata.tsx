"use client";

import { useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  Save,
  Download,
  Copy,
  Clock,
  Link2,
  CornerDownLeft,
} from "lucide-react";
import { useProject } from "../providers/ProjectProvider";
import { useToast } from "../providers/ToastProvider";
import { useGenerate } from "@/hooks/useGenerate";
import { buildStep8Prompt } from "@/lib/prompts";
import { tempFor } from "@/lib/phases";
import { joinAllChapters, totalChars } from "@/lib/chapters";
import {
  parseDurationToSeconds,
  buildTimestamps,
  timestampsToText,
} from "@/lib/timestamps";
import CopyButton from "../CopyButton";

export default function Step8Metadata() {
  const { state, update } = useProject();
  const { toast } = useToast();
  const { run, running } = useGenerate();

  const [output, setOutput] = useState(state.metadata);
  const [guide, setGuide] = useState("");
  const [durationInput, setDurationInput] = useState("");
  const [tsText, setTsText] = useState("");

  const fullScript = joinAllChapters(state.finalChapters);
  const chars = totalChars(state.finalChapters);

  // 시놉시스에서 챕터 N의 짧은 제목 추출 (실패 시 '챕터 N')
  const chapterTitle = (n: number): string => {
    const line = state.synopsis
      .split("\n")
      .find((l) => new RegExp(`챕터\\s*${n}\\b`).test(l));
    if (!line) return `챕터 ${n}`;
    let t = line.replace(/[#*>]/g, "").trim();
    t = t
      .replace(new RegExp(`\\[?\\s*챕터\\s*${n}\\s*\\]?\\s*[:：.\\-]?`), "")
      .trim();
    return t ? `챕터 ${n} · ${t.slice(0, 30)}` : `챕터 ${n}`;
  };

  // 타임스탬프 구간: 오프닝(인트로) + 최종본이 있는 챕터들
  const segments = useMemo(() => {
    const segs: { label: string; chars: number }[] = [];
    if (state.introSet.text)
      segs.push({ label: "오프닝", chars: state.introSet.text.length });
    for (let n = 1; n <= 8; n++) {
      const body = state.finalChapters[n];
      if (body && body.trim()) segs.push({ label: chapterTitle(n), chars: body.length });
    }
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.introSet.text, state.finalChapters, state.synopsis]);

  const sourcesText = useMemo(() => {
    const list = state.sources ?? [];
    if (!list.length) return "";
    return (
      "📚 참고 자료 및 출처\n" +
      list.map((s, i) => `${i + 1}. ${s.title} - ${s.uri}`).join("\n")
    );
  }, [state.sources]);

  const handleGenerate = async () => {
    const text = await run(buildStep8Prompt(state, guide), {
      temperature: tempFor(8),
      planning: true,
    });
    if (text) setOutput(text);
  };

  const handleBuildTimestamps = () => {
    const secs = parseDurationToSeconds(durationInput);
    if (!secs) {
      toast("영상 길이를 12:34 또는 750(초) 형식으로 입력해 주세요.", "error");
      return;
    }
    if (!segments.length) {
      toast("타임스탬프를 만들 챕터가 없습니다. 7단계 최종본을 먼저 완료하세요.", "error");
      return;
    }
    const segs = buildTimestamps(segments, secs);
    setTsText("⏱ 타임스탬프\n" + timestampsToText(segs));
    toast("영상 길이에 맞춰 타임스탬프를 생성했습니다.", "success");
  };

  const insertIntoDescription = () => {
    const blocks = [tsText, sourcesText].filter(Boolean);
    if (!blocks.length) {
      toast("삽입할 타임스탬프나 출처가 없습니다.", "error");
      return;
    }
    setOutput((prev) => `${prev.trim()}\n\n${blocks.join("\n\n")}`.trim());
    toast("설명란(에디터)에 타임스탬프·출처를 추가했습니다.", "success");
  };

  const handleSave = () => {
    update({ metadata: output.trim() });
    toast("메타데이터를 저장했습니다. 프로젝트 완성!", "success");
  };

  const copyScript = async () => {
    await navigator.clipboard.writeText(fullScript);
    toast("최종 대본 전체를 클립보드에 복사했습니다.", "success");
  };

  const downloadScript = () => {
    const blob = new Blob([fullScript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `대본_${(state.topic || "untitled").slice(0, 20)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="animate-slide-in">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-sm font-medium text-accent">
          <span className="rounded-md bg-accent/10 px-2 py-0.5">STEP 8</span>
        </div>
        <h2 className="mt-2 text-2xl font-bold text-slate-50">메타데이터 출력</h2>
        <p className="mt-1 text-sm text-slate-400">
          최종 대본({chars.toLocaleString("ko-KR")}자) 기반 메타데이터(설명·학습
          포인트·핵심 요약·키워드·해시태그·제목/썸네일·고정 댓글·퀴즈)와, 영상 길이로
          만든 타임스탬프·출처를 설명란에 삽입합니다.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base-900 transition hover:brightness-110 disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {running ? "생성 중…" : "메타데이터 생성"}
        </button>
        <button
          onClick={copyScript}
          className="inline-flex items-center gap-2 rounded-lg border border-base-600 px-3 py-2 text-sm text-slate-300 transition hover:text-accent"
        >
          <Copy className="h-4 w-4" />
          대본 전체 복사
        </button>
        <button
          onClick={downloadScript}
          className="inline-flex items-center gap-2 rounded-lg border border-base-600 px-3 py-2 text-sm text-slate-300 transition hover:text-accent"
        >
          <Download className="h-4 w-4" />
          대본 .txt 저장
        </button>
      </div>

      {/* 설명란 보강 · 타임스탬프 & 출처 */}
      <div className="mb-4 rounded-xl border border-base-600 bg-base-800/50 p-4">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
          <Clock className="h-4 w-4 text-accent" />
          설명란 보강 · 타임스탬프 &amp; 출처
        </p>

        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">
              완성된 영상 길이 (예: 24:30 또는 1470)
            </label>
            <input
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              placeholder="mm:ss / hh:mm:ss / 초"
              className="w-48 rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-accent/70"
            />
          </div>
          <button
            onClick={handleBuildTimestamps}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-base-900 transition hover:brightness-110"
          >
            <Clock className="h-4 w-4" />
            타임스탬프 생성
          </button>
          <button
            onClick={insertIntoDescription}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/50 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/20"
          >
            <CornerDownLeft className="h-4 w-4" />
            설명란에 삽입
          </button>
          <p className="text-xs text-slate-500">
            글자수 비율로 시간을 근사 배분합니다(정확한 음성 길이 아님).
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">타임스탬프</span>
              <CopyButton text={tsText} />
            </div>
            <div className="preserve-breaks h-36 overflow-auto rounded-lg border border-base-600 bg-base-900/60 p-3 text-xs leading-relaxed text-slate-300">
              {tsText || "영상 길이를 입력하고 [타임스탬프 생성]을 누르세요."}
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs font-medium text-slate-400">
                <Link2 className="h-3 w-3" />
                출처 {(state.sources ?? []).length}건
              </span>
              <CopyButton text={sourcesText} />
            </div>
            <div className="preserve-breaks h-36 overflow-auto rounded-lg border border-base-600 bg-base-900/60 p-3 text-xs leading-relaxed text-slate-300">
              {sourcesText ||
                "2단계 딥리서치의 웹 검색 그라운딩 출처가 여기에 모입니다. (출처가 없으면 2단계를 다시 생성하세요.)"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              AI Output 에디터 · 설명란/메타데이터
            </label>
            <CopyButton text={output} />
          </div>
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            spellCheck={false}
            placeholder="설명 / 학습 포인트 / 핵심 요약 / 키워드 / 해시태그 / 제목 20 / 썸네일 20 / 고정 댓글 / 퀴즈가 표시됩니다. 아래에서 타임스탬프·출처를 삽입하세요."
            className="preserve-breaks h-[520px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none transition focus:border-accent/70"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
            User Input · 작업자 가이드
          </label>
          <textarea
            value={guide}
            onChange={(e) => setGuide(e.target.value)}
            placeholder="예: 제목은 호기심 자극형으로, 키워드에 지역명 포함"
            className="preserve-breaks h-[520px] w-full resize-none rounded-xl border border-base-600 bg-base-800/70 p-4 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-accent/70"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={!output.trim() || running}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:brightness-110 disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          메타데이터 저장 · 프로젝트 완성
        </button>
      </div>
    </section>
  );
}
