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
