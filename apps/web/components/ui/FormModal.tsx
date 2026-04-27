import React, { ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

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
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCloseRef.current();
        }
      }}
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto hidden-scrollbar">
        <form 
          onSubmit={onSubmit} 
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="bg-[var(--bg-card)] border border-[var(--border)] shadow-xl rounded-[var(--radius-base)] p-8 animate-in slide-in-from-bottom-4"
        >
          {/* Header */}
          <div className="flex justify-between items-center border-b-[var(--border-width)] border-[var(--border)] pb-4 mb-8">
            <h2 id={titleId} className="text-2xl font-bold text-[var(--text-primary)]">
              {title}
            </h2>
            <button 
              ref={closeButtonRef}
              type="button" 
              onClick={() => onCloseRef.current()}
              aria-label="关闭表单弹窗"
              className="p-2 rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="mb-8">
            {children}
          </div>

          {/* Footer */}
          <div className="flex justify-end pt-6 border-t border-[var(--border)]">
            <button 
              type="submit"
              disabled={saving} 
              className="px-8 py-3 bg-[var(--brand)] text-[var(--brand-text)] rounded-[var(--radius-base)] font-bold transition-all hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
            >
               {saving ? savingText : saveText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
