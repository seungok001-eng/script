"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  FolderOpen,
  Save,
  Download,
  Upload,
  Trash2,
  FileDown,
} from "lucide-react";
import { useProject } from "./providers/ProjectProvider";
import { useToast } from "./providers/ToastProvider";
import {
  listSnapshots,
  saveSnapshot,
  loadSnapshot,
  deleteSnapshot,
  exportProjectFile,
  importProjectFile,
  type SnapshotMeta,
} from "@/lib/storage";

interface ProjectsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ProjectsModal({ open, onClose }: ProjectsModalProps) {
  const { state, replaceState } = useProject();
  const { toast } = useToast();
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([]);
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSnaps(listSnapshots());
      setName(state.topic ? state.topic.slice(0, 24) : "");
    }
  }, [open, state.topic]);

  if (!open) return null;

  const handleSave = () => {
    const n = name.trim() || `프로젝트 ${new Date().toLocaleString("ko-KR")}`;
    saveSnapshot(n, state);
    setSnaps(listSnapshots());
    toast(`"${n}" 슬롯으로 저장했습니다.`, "success");
  };

  const handleLoad = (id: string) => {
    const s = loadSnapshot(id);
    if (!s) {
      toast("슬롯을 불러오지 못했습니다.", "error");
      return;
    }
    if (window.confirm("현재 작업 내용을 이 슬롯으로 교체할까요?")) {
      replaceState(s);
      toast("슬롯을 불러왔습니다.", "success");
      onClose();
    }
  };

  const handleDelete = (id: string) => {
    deleteSnapshot(id);
    setSnaps(listSnapshots());
    toast("슬롯을 삭제했습니다.", "info");
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const s = await importProjectFile(file);
      replaceState(s);
      toast("프로젝트 파일을 가져왔습니다.", "success");
      onClose();
    } catch {
      toast("가져오기 실패: 유효한 프로젝트 JSON이 아닙니다.", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg animate-slide-in rounded-2xl border border-base-600 bg-base-800 p-6 shadow-glow">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-50">
            <FolderOpen className="h-5 w-5 text-accent" />
            프로젝트 슬롯
          </h3>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 현재 프로젝트 저장 */}
        <div className="mb-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="현재 프로젝트 슬롯 이름"
            className="flex-1 rounded-lg border border-base-600 bg-base-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-accent/70"
          />
          <button
            onClick={handleSave}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-base-900 transition hover:brightness-110"
          >
            <Save className="h-4 w-4" />
            슬롯 저장
          </button>
        </div>

        {/* 가져오기/내보내기 */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => exportProjectFile(state)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-base-600 px-3 py-2 text-sm text-slate-300 transition hover:text-accent"
          >
            <Download className="h-4 w-4" />
            .json 내보내기
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-base-600 px-3 py-2 text-sm text-slate-300 transition hover:text-accent"
          >
            <Upload className="h-4 w-4" />
            .json 가져오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              handleImport(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        {/* 저장된 슬롯 목록 */}
        <div className="max-h-64 space-y-2 overflow-auto">
          {snaps.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              저장된 슬롯이 없습니다. 위에서 현재 프로젝트를 저장하세요.
            </p>
          ) : (
            snaps.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-lg border border-base-600 bg-base-900/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{m.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {new Date(m.updatedAt).toLocaleString("ko-KR")}
                  </p>
                </div>
                <button
                  onClick={() => handleLoad(m.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-base-600 px-2 py-1 text-xs text-slate-300 transition hover:text-accent"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  불러오기
                </button>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="text-slate-500 transition hover:text-red-400"
                  aria-label="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
