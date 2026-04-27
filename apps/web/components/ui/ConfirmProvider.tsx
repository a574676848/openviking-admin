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
              className="w-full max-w-md border border-[var(--border)] bg-[var(--bg-card)] p-6 text-[var(--text-primary)] shadow-xl rounded-[var(--radius-base)]"
              initial={{ y: 24, scale: 0.96 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 16, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
            >
              <div className="mb-6 flex items-start gap-4 border-b-[var(--border-width)] border-[var(--border)] pb-5">
                <div className={`rounded-xl p-3 ${toneClass(pending.tone ?? "default")}`}>
                  <AlertTriangle size={22} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="confirm-title" className="font-sans text-xl font-bold">
                    {pending.title}
                  </h2>
                  {pending.description && (
                    <p id="confirm-description" className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {pending.description}
                    </p>
                  )}
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--bg-base)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                  aria-label="关闭确认弹窗"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="px-5 py-2.5 rounded-[var(--radius-base)] font-bold text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                >
                  {pending.cancelText ?? "取消"}
                </button>
                <button
                  type="button"
                  onClick={() => close(true)}
                  className={`px-6 py-2.5 rounded-[var(--radius-base)] font-bold text-sm shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${toneClass(pending.tone ?? "default")}`}
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
