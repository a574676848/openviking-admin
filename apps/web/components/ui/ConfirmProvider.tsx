"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type ConfirmTone = "danger" | "warning" | "default";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

function toneClass(tone: ConfirmTone) {
  if (tone === "danger") return "bg-[var(--danger)] text-white";
  if (tone === "warning") return "bg-[var(--warning)] text-black";
  return "bg-[var(--brand)] text-[var(--brand-text)]";
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  function close(result: boolean) {
    pending?.resolve(result);
    setPending(null);
  }

  useEffect(() => {
    if (!pending) return;

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pending]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {pending && (
          <motion.div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              aria-describedby={pending.description ? "confirm-description" : undefined}
              className="w-full max-w-md border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-6 text-[var(--text-primary)] shadow-[var(--shadow-base)]"
              initial={{ y: 24, scale: 0.96 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 16, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
            >
              <div className="mb-6 flex items-start gap-4 border-b-[var(--border-width)] border-[var(--border)] pb-5">
                <div className={`border-[var(--border-width)] border-[var(--border)] p-3 shadow-[var(--shadow-base)] ${toneClass(pending.tone ?? "default")}`}>
                  <AlertTriangle size={22} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="confirm-title" className="font-sans text-2xl font-black tracking-tighter">
                    {pending.title}
                  </h2>
                  {pending.description && (
                    <p id="confirm-description" className="mt-2 font-mono text-xs font-bold leading-6 text-[var(--text-secondary)]">
                      {pending.description}
                    </p>
                  )}
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => close(false)}
                  className="border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-[var(--shadow-base)] transition-all hover:translate-y-0.5 hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]"
                  aria-label="关闭确认弹窗"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] px-5 py-3 font-mono text-[10px] font-black tracking-[0.2em] text-[var(--text-primary)] shadow-[var(--shadow-base)] transition-all hover:translate-y-0.5 hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]"
                >
                  {pending.cancelText ?? "取消"}
                </button>
                <button
                  type="button"
                  onClick={() => close(true)}
                  className={`border-[var(--border-width)] border-[var(--border)] px-6 py-3 font-mono text-[10px] font-black tracking-[0.2em] shadow-[var(--shadow-base)] transition-all hover:translate-y-0.5 hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)] ${toneClass(pending.tone ?? "default")}`}
                >
                  {pending.confirmText ?? "确认"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used inside ConfirmProvider");
  }
  return confirm;
}
