"use client";

import { ScrambleText } from "@/components/ui/ScrambleText";

export default function RootLoading() {
  return (
    <div className="fixed inset-0 z-[9999] bg-[var(--bg-base)] flex flex-col items-center justify-center font-mono">
      <div className="w-16 h-16 border-[4px] border-[var(--border)] border-t-[var(--brand)] animate-spin mb-8 shadow-[4px_4px_0px_#000]"></div>
      <ScrambleText 
        text="OPENVIKING_DATA_STREAM_LOADING..." 
        className="text-[10px] font-black tracking-[0.2em] text-[var(--text-secondary)]"
      />
    </div>
  );
}
