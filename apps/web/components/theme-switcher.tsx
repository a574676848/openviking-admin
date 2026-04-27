'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { useApp, ThemeType } from './app-provider';
import { Zap, MousePointer2, ChevronDown, Check, Sparkles, type LucideIcon } from 'lucide-react';
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
  align = 'left',
  compact = false,
}: {
  className?: string;
  placement?: ThemePlacement;
  align?: 'left' | 'right';
  compact?: boolean;
}) {
  const { theme, setTheme } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const isStarry = theme === 'starry';
  const menuId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

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
      label: '星智流光',
      englishLabel: 'Luminous',
      description: '圆润柔和 · 呼吸感',
      color: 'bg-[var(--brand-muted)] text-[var(--brand)]'
    },
    { 
      id: 'starry', 
      icon: Sparkles, 
      label: '浩瀚星空',
      englishLabel: 'Starry Sky',
      description: '深邃暗色 · 星芒漫游',
      color: 'bg-[#00F0FF]'
    },
  ];

  const currentTheme = themes.find(t => t.id === theme) || themes[0];
  const dropdownPlacementClass = placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';
  const dropdownAlignClass = align === 'right' ? 'right-0' : 'left-0';
  const dropdownInitialY = placement === 'top' ? 10 : -10;
  const dropdownAnimateY = placement === 'top' ? -8 : 8;
  const triggerClassName = getShellButtonClass(
    isStarry ? 'starry' : 'neo',
    'default',
    `group relative ${compact ? 'w-11 h-11 justify-center' : 'w-full h-11 px-4'}`,
  );
  const dropdownClassName = getShellPanelClass(
    isStarry ? 'starry' : 'neo',
    'popover',
    `absolute ${dropdownAlignClass} ${dropdownPlacementClass} z-[100] w-64 overflow-hidden`,
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
        <div className={getShellTileClass(isStarry ? 'starry' : 'neo', `p-1.5 ${currentTheme.color}`)}>
          {mounted && <currentTheme.icon size={14} strokeWidth={2.5} />}
        </div>
        {!compact && (
          <>
            <div className="flex flex-col items-start leading-none ml-2">
              <span className="text-xs font-bold whitespace-nowrap">{currentTheme.label}</span>
            </div>
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="ml-auto"
            >
              <ChevronDown size={16} strokeWidth={2.5} />
            </motion.div>
          </>
        )}
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
            <div className={`p-2 text-[10px] font-bold uppercase tracking-wider border-b border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]`}>
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
                      w-full flex items-center gap-3 p-2 mb-1 last:mb-0 transition-all border border-transparent rounded-[var(--radius-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]
                      ${isActive 
                        ? "bg-[var(--brand-muted)] text-[var(--brand)] border-[var(--brand)]/20 shadow-sm"
                        : "bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                      }
                    `}
                  >
                    <div className={getShellTileClass(
                      isStarry ? 'starry' : 'neo',
                      `p-1.5 ${t.color}`,
                    )}>
                      <Icon size={14} strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-xs font-bold whitespace-nowrap">{t.label}</div>
                      <div className={`text-[9px] font-medium ${isActive ? 'text-[var(--brand)] opacity-80' : 'text-[var(--text-muted)]'}`}>
                        {t.englishLabel} · {t.description}
                      </div>
                    </div>
                    {isActive && <Check size={16} strokeWidth={3} className="text-[var(--brand)]" />}
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
