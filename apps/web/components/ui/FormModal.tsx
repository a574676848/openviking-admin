import React, { ReactNode, useEffect, useId, useRef } from 'react';

interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  title: string;
  children: ReactNode;
  saving?: boolean;
  saveText?: string;
  savingText?: string;
}

export function FormModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  children,
  saving = false,
  saveText = ">> 确认执行",
  savingText = ">> DEPLOYING..."
}: FormModalProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <form 
          onSubmit={onSubmit} 
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="bg-[var(--bg-card)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)] p-10 animate-in slide-in-from-bottom-8 edge-pulse"
        >
          {/* Header */}
          <div className="flex justify-between items-center border-b-[var(--border-width)] border-[var(--border)] pb-4 mb-8">
            <h2 id={titleId} className="text-3xl font-black uppercase font-mono tracking-tighter">
              {title}
            </h2>
            <button 
              ref={closeButtonRef}
              type="button" 
              onClick={onClose}
              aria-label="关闭表单弹窗"
              className="p-2 border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-base)] hover:translate-y-0.5 hover:shadow-none transition-all font-mono font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]"
            >
              X
            </button>
          </div>

          {/* Body */}
          <div className="mb-8">
            {children}
          </div>

          {/* Footer */}
          <div className="flex justify-end pt-6 border-t-2 border-[var(--border)] border-dashed">
            <button 
              type="submit"
              disabled={saving} 
              className="px-12 py-4 bg-black text-white border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)] font-black uppercase text-sm hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]"
            >
               {saving ? savingText : saveText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
