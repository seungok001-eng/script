"use client";

import { useCallback, useRef, useState } from "react";
import { useProject } from "@/components/providers/ProjectProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { ApiError, generate, stream } from "@/lib/client";
import { errorMessageFor } from "@/lib/gemini";
import type { Source } from "@/lib/types";

export interface GenOpts {
  temperature?: number;
  enableSearch?: boolean;
  /** 기획·리서치 단계(1~5,8) 여부 — 기획용 시스템 인스트럭션 사용 */
  planning?: boolean;
}

/**
 * 단계별 생성 호출을 감싸는 공용 훅.
 * - API 키 누락/오류(401·403) 시 토스트를 띄우고 로딩을 무조건 해제한다.
 * - usageMetadata는 완료 시점에만 누적 트래커에 반영한다.
 * - 마지막 호출의 그라운딩 출처는 lastSources로 노출한다.
 */
export function useGenerate() {
  const { state, addUsage } = useProject();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [lastSources, setLastSources] = useState<Source[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const ensureKey = useCallback((): boolean => {
    if (!state.config.apiKey.trim()) {
      toast("API 키가 없습니다. 우측 상단 설정에서 키를 저장해 주세요.", "error");
      return false;
    }
    return true;
  }, [state.config.apiKey, toast]);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        toast(err.message || errorMessageFor(err.status), "error");
      } else if ((err as Error)?.name === "AbortError") {
        toast("생성을 중단했습니다.", "info");
      } else {
        toast("알 수 없는 오류가 발생했습니다.", "error");
      }
    },
    [toast],
  );

  /** 비스트리밍 생성 — 결과 텍스트를 반환(실패 시 null) */
  const run = useCallback(
    async (prompt: string, opts: GenOpts = {}): Promise<string | null> => {
      if (!ensureKey()) return null;
      setRunning(true);
      try {
        const res = await generate({
          apiKey: state.config.apiKey,
          modelId: state.config.selectedModel,
          isExtendedMode: state.config.isExtendedMode,
          prompt,
          temperature: opts.temperature,
          enableSearch: opts.enableSearch,
          planning: opts.planning,
        });
        addUsage(res.usage);
        setLastSources(res.sources ?? []);
        return res.text;
      } catch (err) {
        handleError(err);
        return null;
      } finally {
        setRunning(false);
      }
    },
    [ensureKey, state.config, addUsage, handleError],
  );

  /** 스트리밍 생성 — 청크를 onChunk로 흘려보내고 완료 시 usage 누적 */
  const runStream = useCallback(
    async (
      prompt: string,
      onChunk: (text: string) => void,
      opts: GenOpts = {},
    ): Promise<boolean> => {
      if (!ensureKey()) return false;
      setRunning(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await stream(
          {
            apiKey: state.config.apiKey,
            modelId: state.config.selectedModel,
            isExtendedMode: state.config.isExtendedMode,
            prompt,
            temperature: opts.temperature,
            enableSearch: opts.enableSearch,
            planning: opts.planning,
          },
          {
            onChunk,
            onDone: (usage, sources) => {
              addUsage(usage);
              setLastSources(sources ?? []);
            },
            signal: controller.signal,
          },
        );
        return true;
      } catch (err) {
        handleError(err);
        return false;
      } finally {
        setRunning(false);
        abortRef.current = null;
      }
    },
    [ensureKey, state.config, addUsage, handleError],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { run, runStream, abort, running, lastSources };
}
