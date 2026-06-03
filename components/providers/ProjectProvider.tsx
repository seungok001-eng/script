"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AppConfig,
  ScriptProjectState,
  UsageMetadata,
  UsageState,
} from "@/lib/types";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import {
  clearProject,
  debounce,
  loadApiKey,
  loadProject,
  loadUsage,
  saveApiKey,
  saveProject,
  saveUsage,
} from "@/lib/storage";

const DEFAULT_STATE: ScriptProjectState = {
  currentStep: 1,
  config: { selectedModel: DEFAULT_MODEL_ID, isExtendedMode: false, apiKey: "" },
  topic: "",
  factReport: "",
  speakerProfile: "",
  synopsis: "",
  introSet: { title: "", thumbnail: "", text: "" },
  draftChapters: {},
  finalChapters: {},
  metadata: "",
};

const EMPTY_USAGE: UsageState = {
  promptTokens: 0,
  candidatesTokens: 0,
  totalTokens: 0,
};

interface ProjectContextValue {
  state: ScriptProjectState;
  usage: UsageState;
  hydrated: boolean;
  recoverable: boolean;
  update: (partial: Partial<ScriptProjectState>) => void;
  updateConfig: (partial: Partial<AppConfig>) => void;
  setStep: (step: number) => void;
  addUsage: (usage: UsageMetadata) => void;
  resetUsage: () => void;
  resetProject: () => void;
  acceptRecovery: () => void;
  dismissRecovery: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within <ProjectProvider>");
  return ctx;
}

/** 저장된 백업이 '진행 중인 작업'을 담고 있는지 판정 */
function hasProgress(s: ScriptProjectState): boolean {
  return (
    s.currentStep > 1 ||
    !!s.topic ||
    !!s.factReport ||
    !!s.synopsis ||
    Object.keys(s.draftChapters ?? {}).length > 0
  );
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ScriptProjectState>(DEFAULT_STATE);
  const [usage, setUsage] = useState<UsageState>(EMPTY_USAGE);
  const [hydrated, setHydrated] = useState(false);
  const [recoverable, setRecoverable] = useState(false);
  const pendingBackup = useRef<ScriptProjectState | null>(null);

  // 디바운스 처리된 localStorage 백업 (마지막 변경 후 800ms)
  const debouncedSave = useMemo(() => debounce(saveProject, 800), []);

  // ── 하이드레이션: window 접근은 반드시 useEffect 내부에서 ──
  useEffect(() => {
    const storedKey = loadApiKey();
    const storedUsage = loadUsage();
    const backup = loadProject();

    if (storedUsage) setUsage(storedUsage);

    if (backup && hasProgress(backup)) {
      // 자동 적용하지 않고 복구 모달로 사용자에게 선택권을 준다.
      pendingBackup.current = { ...backup, config: { ...backup.config, apiKey: storedKey } };
      setRecoverable(true);
      // 단, API 키는 즉시 반영하여 작업 연속성을 보장한다.
      setState((s) => ({ ...s, config: { ...s.config, apiKey: storedKey } }));
    } else {
      setState((s) => ({ ...s, config: { ...s.config, apiKey: storedKey } }));
    }

    setHydrated(true);
  }, []);

  // 상태 변경 시 디바운스 백업
  useEffect(() => {
    if (!hydrated) return;
    debouncedSave(state);
  }, [state, hydrated, debouncedSave]);

  // 사용량 변경 시 즉시 백업
  useEffect(() => {
    if (!hydrated) return;
    saveUsage(usage);
  }, [usage, hydrated]);

  const update = useCallback((partial: Partial<ScriptProjectState>) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);

  const updateConfig = useCallback((partial: Partial<AppConfig>) => {
    setState((s) => {
      const nextConfig = { ...s.config, ...partial };
      if (partial.apiKey !== undefined) saveApiKey(partial.apiKey);
      return { ...s, config: nextConfig };
    });
  }, []);

  const setStep = useCallback((step: number) => {
    setState((s) => ({ ...s, currentStep: step }));
  }, []);

  const addUsage = useCallback((u: UsageMetadata) => {
    setUsage((prev) => ({
      promptTokens: prev.promptTokens + u.promptTokens,
      candidatesTokens: prev.candidatesTokens + u.candidatesTokens,
      totalTokens: prev.totalTokens + u.totalTokens,
    }));
  }, []);

  const resetUsage = useCallback(() => setUsage(EMPTY_USAGE), []);

  const resetProject = useCallback(() => {
    clearProject();
    setRecoverable(false);
    pendingBackup.current = null;
    setState((s) => ({
      ...DEFAULT_STATE,
      // API 키와 모델 설정은 유지
      config: { ...DEFAULT_STATE.config, ...s.config },
    }));
  }, []);

  const acceptRecovery = useCallback(() => {
    if (pendingBackup.current) {
      setState(pendingBackup.current);
    }
    setRecoverable(false);
    pendingBackup.current = null;
  }, []);

  const dismissRecovery = useCallback(() => {
    setRecoverable(false);
    pendingBackup.current = null;
  }, []);

  const value = useMemo<ProjectContextValue>(
    () => ({
      state,
      usage,
      hydrated,
      recoverable,
      update,
      updateConfig,
      setStep,
      addUsage,
      resetUsage,
      resetProject,
      acceptRecovery,
      dismissRecovery,
    }),
    [
      state,
      usage,
      hydrated,
      recoverable,
      update,
      updateConfig,
      setStep,
      addUsage,
      resetUsage,
      resetProject,
      acceptRecovery,
      dismissRecovery,
    ],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
