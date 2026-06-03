"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

/** 클립보드 복사 버튼 (복사 후 잠시 체크 표시) */
export default function CopyButton({ text, label = "복사", className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 접근 불가 시 무시 */
    }
  };

  return (
    <button
      onClick={handleCopy}
      disabled={!text.trim()}
      className={`inline-flex items-center gap-1.5 rounded-md border border-base-600 px-2 py-1 text-xs text-slate-400 transition hover:text-accent disabled:opacity-40 ${className}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "복사됨" : label}
    </button>
  );
}
