"use client";

import { useEffect, useState } from "react";
import {
  X,
  KeyRound,
  Save,
  Eye,
  EyeOff,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { useProject } from "./providers/ProjectProvider";
import { useToast } from "./providers/ToastProvider";
import { validateKey } from "@/lib/client";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { state, updateConfig, resetProject, resetUsage } = useProject();
  const { toast } = useToast();
  const [draftKey, setDraftKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [validating, setValidating] = useState(false);

  // 모달이 열릴 때마다 저장된 키를 입력란에 동기화
  useEffect(() => {
    if (open) setDraftKey(state.config.apiKey);
  }, [open, state.config.apiKey]);

  if (!open) return null;

  const handleSave = () => {
    updateConfig({ apiKey: draftKey.trim() });
    toast("API 키를 저장했습니다. (이 브라우저에만 보관)", "success");
    onClose();
  };

  const handleValidate = async () => {
    if (!draftKey.trim()) {
      toast("먼저 키를 입력해 주세요.", "error");
      return;
    }
    setValidating(true);
    const result = await validateKey(draftKey.trim(), state.config.selectedModel);
    setValidating(false);
    if (result.ok) {
      toast("유효한 API 키입니다.", "success");
    } else {
      toast(result.message ?? "키 검증에 실패했습니다.", "error");
    }
  };

  const handleReset = () => {
    if (
      window.confirm(
        "현재 프로젝트 진행 상황을 모두 초기화합니다. 계속할까요? (API 키와 모델 설정은 유지됩니다)",
      )
    ) {
      resetProject();
      resetUsage();
      toast("프로젝트를 초기화했습니다.", "info");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg animate-slide-in rounded-2xl border border-base-600 bg-base-800 p-6 shadow-glow">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-50">
            <KeyRound className="h-5 w-5 text-accent" />
            설정
          </h3>
          <button
            onClick={onClose}
            className="text-slate-500 transition hover:text-slate-200"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1.5 block text-sm font-medium text-slate-300">
          Gemini API Key
        </label>
        <div className="relative">
          <input
            type={reveal ? "text" : "password"}
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder="AIza..."
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-lg border border-base-600 bg-base-900 px-3 py-2.5 pr-10 text-sm text-slate-100 outline-none transition focus:border-accent/70"
          />
          <button
            onClick={() => setReveal((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-200"
            aria-label={reveal ? "키 숨기기" : "키 보기"}
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
          키는 이 브라우저의 localStorage에만 저장되며 외부로 전송되지 않습니다.
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-accent hover:underline"
          >
            키 발급 <ExternalLink className="h-3 w-3" />
          </a>
        </p>

        <button
          onClick={handleValidate}
          disabled={validating}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-base-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {validating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          {validating ? "검증 중…" : "키 유효성 검증"}
        </button>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-base-600 px-3 py-2 text-sm text-slate-400 transition hover:border-red-500 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
            프로젝트 초기화
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base-900 transition hover:brightness-110"
          >
            <Save className="h-4 w-4" />
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
