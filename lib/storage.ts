// ─────────────────────────────────────────────────────────────
// 브라우저 localStorage 백업/복구 + 디바운스 유틸 (클라이언트 전용)
// ─────────────────────────────────────────────────────────────

import type { ScriptProjectState, UsageState } from "./types";

export const STORAGE_KEYS = {
  project: "ysf:project-state",
  apiKey: "ysf:api-key",
  usage: "ysf:usage",
} as const;

const isBrowser = () => typeof window !== "undefined";

export function loadProject(): ScriptProjectState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.project);
    return raw ? (JSON.parse(raw) as ScriptProjectState) : null;
  } catch {
    return null;
  }
}

export function saveProject(state: ScriptProjectState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.project, JSON.stringify(state));
  } catch {
    /* 용량 초과 등은 조용히 무시 */
  }
}

export function clearProject(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEYS.project);
}

export function loadApiKey(): string {
  if (!isBrowser()) return "";
  return window.localStorage.getItem(STORAGE_KEYS.apiKey) ?? "";
}

export function saveApiKey(key: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEYS.apiKey, key);
}

export function loadUsage(): UsageState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.usage);
    return raw ? (JSON.parse(raw) as UsageState) : null;
  } catch {
    return null;
  }
}

export function saveUsage(usage: UsageState): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEYS.usage, JSON.stringify(usage));
}

// ── 프로젝트 스냅샷(다중 슬롯) + JSON 내보내기/가져오기 ──────────

export interface SnapshotMeta {
  id: string;
  name: string;
  updatedAt: number;
}

const SNAP_INDEX = "ysf:snapshots";
const snapKey = (id: string) => `ysf:snapshot:${id}`;

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 누락 필드를 기본값으로 채워 하위 호환을 보장 */
export function normalizeState(
  raw: Partial<ScriptProjectState> | null | undefined,
): ScriptProjectState {
  const s = raw ?? {};
  return {
    currentStep: s.currentStep ?? 1,
    config: {
      selectedModel: s.config?.selectedModel ?? "gemini-3.5-flash",
      isExtendedMode: s.config?.isExtendedMode ?? false,
      apiKey: s.config?.apiKey ?? "",
    },
    topic: s.topic ?? "",
    factReport: s.factReport ?? "",
    speakerProfile: s.speakerProfile ?? "",
    synopsis: s.synopsis ?? "",
    introRaw: s.introRaw ?? "",
    introSet: s.introSet ?? { title: "", thumbnail: "", text: "" },
    draftChapters: s.draftChapters ?? {},
    finalChapters: s.finalChapters ?? {},
    foreshadowLedger: s.foreshadowLedger ?? "",
    sources: s.sources ?? [],
    metadata: s.metadata ?? "",
  };
}

export function listSnapshots(): SnapshotMeta[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(SNAP_INDEX);
    return raw ? (JSON.parse(raw) as SnapshotMeta[]) : [];
  } catch {
    return [];
  }
}

export function saveSnapshot(name: string, state: ScriptProjectState): SnapshotMeta {
  const meta: SnapshotMeta = { id: genId(), name, updatedAt: Date.now() };
  if (!isBrowser()) return meta;
  window.localStorage.setItem(snapKey(meta.id), JSON.stringify(state));
  window.localStorage.setItem(SNAP_INDEX, JSON.stringify([meta, ...listSnapshots()]));
  return meta;
}

export function loadSnapshot(id: string): ScriptProjectState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(snapKey(id));
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function deleteSnapshot(id: string): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(snapKey(id));
  window.localStorage.setItem(
    SNAP_INDEX,
    JSON.stringify(listSnapshots().filter((m) => m.id !== id)),
  );
}

/** 현재 프로젝트를 .json 파일로 내보내기 */
export function exportProjectFile(state: ScriptProjectState): void {
  if (!isBrowser()) return;
  // 보안상 API 키는 내보내기에서 제외한다.
  const safe = { ...state, config: { ...state.config, apiKey: "" } };
  const blob = new Blob([JSON.stringify(safe, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name = (state.topic || "project").slice(0, 20).replace(/\s+/g, "_");
  a.href = url;
  a.download = `script-${name}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** .json 파일에서 프로젝트 상태를 읽어온다 */
export async function importProjectFile(file: File): Promise<ScriptProjectState> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<ScriptProjectState>;
  if (typeof parsed !== "object" || parsed == null || !("currentStep" in parsed)) {
    throw new Error("유효한 프로젝트 파일이 아닙니다.");
  }
  return normalizeState(parsed);
}

/** 단순 디바운스 (마지막 호출 후 wait ms 뒤 1회 실행) */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
