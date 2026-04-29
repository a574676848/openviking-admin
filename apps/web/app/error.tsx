"use client";

import { useEffect } from "react";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { AlertOctagon } from "lucide-react";
import { TerminalOverlay } from "@/components/ui/TerminalOverlay";

function logError(error: Error & { digest?: string }) {
  if (process.env.NODE_ENV === "development") {
    console.error("OpenViking 前端异常:", error);
    return;
  }
  try {
    navigator.sendBeacon?.(
      "/api/v1/audit/client-log",
      JSON.stringify({
        level: "error",
        message: error.message,
        digest: error.digest,
        path: window.location.pathname,
        userAgent: navigator.userAgent,
        ts: Date.now(),
      }),
    );
  } catch {
    // 静默失败
  }
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center font-sans text-[var(--text-primary)]">
      <div className="p-8 border-[var(--border-width)] border-[var(--danger)] bg-[var(--bg-card)] shadow-[8px_8px_0px_var(--danger)] flex flex-col items-center gap-6 max-w-lg text-center">
        <AlertOctagon size={48} className="text-[var(--danger)]" />
        <ScrambleText text="系统异常" className="text-2xl font-black tracking-widest text-[var(--danger)]" />
        <p className="font-sans text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
          当前界面模块未能正常完成加载，请先查看错误摘要，再执行重试。
        </p>
        <div className="bg-black/5 p-4 w-full overflow-auto max-h-48 text-left border-[1px] border-[var(--danger)]">
            <code className="text-[10px] text-[var(--danger)] font-sans">{error.message}</code>
        </div>
        <button
          onClick={() => reset()}
          className="mt-2 px-6 py-2 bg-[var(--danger)] text-white border-[var(--border-width)] border-transparent hover:border-[var(--text-primary)] hover:shadow-[4px_4px_0px_var(--text-primary)] transition-all uppercase tracking-widest font-bold text-xs"
        >
          重新加载模块
        </button>
      </div>
      <TerminalOverlay />
    </div>
  );
}
