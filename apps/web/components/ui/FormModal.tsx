import React, { ReactNode } from 'react';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <form 
          onSubmit={onSubmit} 
          className="bg-[var(--bg-card)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)] p-10 animate-in slide-in-from-bottom-8 edge-pulse"
        >
          {/* Header */}
          <div className="flex justify-between items-center border-b-[var(--border-width)] border-[var(--border)] pb-4 mb-8">
            <h2 className="text-3xl font-black uppercase font-mono tracking-tighter">
              {title}
            </h2>
            <button 
              type="button" 
              onClick={onClose}
              className="p-2 border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-base)] hover:translate-y-0.5 hover:shadow-none transition-all font-mono font-black"
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
              className="px-12 py-4 bg-black text-white border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)] font-black uppercase text-sm hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50"
            >
               {saving ? savingText : saveText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
