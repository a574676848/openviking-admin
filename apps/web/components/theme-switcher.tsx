'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { useApp, ThemeType } from './app-provider';
import { Zap, MousePointer2, ChevronDown, Check, type LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getShellButtonClass,
  getShellPanelClass,
  getShellTileClass,
} from './ui/shell-primitives';

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const isSwiss = theme === 'swiss';
  const menuId = useId();

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
  const triggerClassName = getShellButtonClass(
    isSwiss ? 'swiss' : 'neo',
    'default',
    'group relative px-4 py-2',
  );
  const dropdownClassName = getShellPanelClass(
    isSwiss ? 'swiss' : 'neo',
    'popover',
    `absolute left-0 ${dropdownPlacementClass} z-[100] w-64 overflow-hidden`,
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    firstOptionRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label="切换界面主题"
        onClick={() => setIsOpen(!isOpen)}
        className={triggerClassName}
      >
        <div className={getShellTileClass(isSwiss ? 'swiss' : 'neo', `p-1.5 ${currentTheme.color}`)}>
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
            id={menuId}
            initial={{ opacity: 0, y: dropdownInitialY, scale: 0.95 }}
            animate={{ opacity: 1, y: dropdownAnimateY, scale: 1 }}
            exit={{ opacity: 0, y: dropdownInitialY, scale: 0.95 }}
            className={dropdownClassName}
            role="menu"
            aria-label="主题选项"
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
                    ref={t.id === themes[0]?.id ? firstOptionRef : undefined}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      setTheme(t.id);
                      setIsOpen(false);
                      triggerRef.current?.focus();
                    }}
                    className={`
                      w-full flex items-center gap-3 p-2 mb-1 last:mb-0 transition-all border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]
                      ${isActive 
                        ? isSwiss
                          ? "bg-[var(--brand-muted)] text-[var(--text-primary)] border-[var(--border)]"
                          : "bg-black text-white border-[var(--border)]" 
                        : "bg-[var(--bg-card)] text-black border-transparent hover:bg-[var(--brand-muted)] hover:border-[var(--border)]"
                      }
                    `}
                  >
                    <div className={getShellTileClass(
                      isSwiss ? 'swiss' : 'neo',
                      `p-1.5 ${t.color} ${!isSwiss && isActive ? 'shadow-[2px_2px_0px_rgba(255,255,255,0.3)]' : ''}`,
                    )}>
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
