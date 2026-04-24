'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useApp, ThemeType } from './app-provider';
import { Zap, MousePointer2, ChevronDown, Check, type LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type ThemePlacement = 'top' | 'bottom';

export function ThemeSwitcher({
  className = "",
  placement = 'bottom',
}: {
  className?: string;
  placement?: ThemePlacement;
}) {
  const { theme, setTheme } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSwiss = theme === 'swiss';

  const themes: {
    id: ThemeType;
    icon: LucideIcon;
    label: string;
    englishLabel: string;
    description: string;
    color: string;
  }[] = [
    { 
      id: 'neo', 
      icon: Zap, 
      label: '现代波普',
      englishLabel: 'Neo-Brutalism',
      description: '白底黑线 · 硬阴影',
      color: 'bg-[#FFDE00]'
    },
    { 
      id: 'swiss', 
      icon: MousePointer2, 
      label: '瑞士极简',
      englishLabel: 'Swiss Mini',
      description: '极简留白 · 细线秩序',
      color: 'bg-[#FF3E3E]'
    },
  ];

  const currentTheme = themes.find(t => t.id === theme) || themes[0];
  const dropdownPlacementClass = placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';
  const dropdownInitialY = placement === 'top' ? 10 : -10;
  const dropdownAnimateY = placement === 'top' ? -8 : 8;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={`group relative flex items-center gap-3 bg-[var(--bg-card)] px-4 py-2 transition-all ${
          isSwiss
            ? "border border-[var(--border)] hover:bg-[var(--bg-elevated)]"
            : "border-2 border-[var(--border)] shadow-[4px_4px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#000]"
        }`}
      >
        <div className={`p-1.5 border border-[var(--border)] ${currentTheme.color} ${isSwiss ? "" : "shadow-[2px_2px_0px_#000]"}`}>
          <currentTheme.icon size={14} strokeWidth={3} />
        </div>
        <div className="flex flex-col items-start leading-none">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">主题</span>
          <span className="text-[12px] font-black tracking-tighter">{currentTheme.label}</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="ml-2"
        >
          <ChevronDown size={16} strokeWidth={3} />
        </motion.div>
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: dropdownInitialY, scale: 0.95 }}
            animate={{ opacity: 1, y: dropdownAnimateY, scale: 1 }}
            exit={{ opacity: 0, y: dropdownInitialY, scale: 0.95 }}
            className={`absolute left-0 ${dropdownPlacementClass} z-[100] w-64 overflow-hidden bg-[var(--bg-card)] ${
              isSwiss ? "border border-[var(--border)]" : "border-2 border-[var(--border)] shadow-[8px_8px_0px_#000]"
            }`}
            role="menu"
          >
            <div className={`p-2 text-[10px] font-black tracking-[0.2em] ${
              isSwiss ? "border-b border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]" : "border-b-2 border-[var(--border)] bg-black text-white"
            }`}>
              选择界面风格
            </div>
            <div className="p-1">
              {themes.map((t) => {
                const isActive = theme === t.id;
                const Icon = t.icon;
                
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      setTheme(t.id);
                      setIsOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-3 p-2 mb-1 last:mb-0 transition-all border-2
                      ${isActive 
                        ? isSwiss
                          ? "bg-[var(--brand-muted)] text-[var(--text-primary)] border-[var(--border)]"
                          : "bg-black text-white border-[var(--border)]" 
                        : "bg-[var(--bg-card)] text-black border-transparent hover:bg-[var(--brand-muted)] hover:border-[var(--border)]"
                      }
                    `}
                  >
                    <div className={`p-1.5 border border-[var(--border)] ${t.color} ${
                      isSwiss ? "" : isActive ? 'shadow-[2px_2px_0px_rgba(255,255,255,0.3)]' : 'shadow-[2px_2px_0px_#000]'
                    }`}>
                      <Icon size={14} strokeWidth={3} />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-[11px] font-black tracking-tighter">{t.label}</div>
                      <div className={`text-[9px] ${isActive ? 'text-gray-400' : 'text-gray-500'}`}>
                        {t.englishLabel} · {t.description}
                      </div>
                    </div>
                    {isActive && <Check size={16} strokeWidth={4} className="text-[var(--success)]" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
