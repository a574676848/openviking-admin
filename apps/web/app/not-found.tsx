"use client";

import Link from "next/link";
import { TerminalOverlay } from "@/components/ui/TerminalOverlay";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center font-mono text-[var(--text-primary)]">
      <div className="p-8 border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-base)] flex flex-col items-center gap-6 max-w-md text-center">
        <AlertTriangle size={48} className="text-[var(--danger)]" />
        <ScrambleText text="404_NOT_FOUND" className="text-2xl font-black tracking-widest text-[var(--danger)]" />
        <p className="text-sm text-[var(--text-secondary)]">
          请求的知识坐标不存在或数据流已断开。
        </p>
        <Link 
          href="/login" 
          className="mt-4 px-6 py-2 border-[var(--border-width)] border-[var(--border)] hover:bg-[var(--text-primary)] hover:text-[var(--bg-base)] transition-colors uppercase tracking-widest font-bold text-xs"
        >
          返回安全区
        </Link>
      </div>
      <TerminalOverlay />
    </div>
  );
}
