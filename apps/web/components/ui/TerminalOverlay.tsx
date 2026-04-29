"use client";

import React, { useEffect, useState, useRef } from "react";

export const TerminalOverlay: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<{ type: 'input' | 'output'; text: string }[]>([]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const keyBufferRef = useRef<string[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        setIsOpen(false);
        return;
      }
      
      if (!isOpen) {
        const next = [...keyBufferRef.current, e.key].slice(-3);
        keyBufferRef.current = next;
        if (next.join('') === '~~~') {
          setIsOpen(true);
          setHistory([{ type: 'output', text: 'OV_TERMINAL [Version 4.0.0]' }, { type: 'output', text: '(c) OpenViking. All rights reserved.' }, { type: 'output', text: 'Type "help" for more information.' }]);
          setTimeout(() => inputRef.current?.focus(), 100);
          keyBufferRef.current = [];
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const cmd = input.trim();
    const newHistory = [...history, { type: 'input' as const, text: `ov_root@platform:~$ ${cmd}` }];
    
    switch(cmd.toLowerCase()) {
      case 'help':
        newHistory.push({ type: 'output', text: 'Available commands: help, whoami, clear, matrix, exit' });
        break;
      case 'whoami':
        newHistory.push({ type: 'output', text: 'Super Administrator [ID: 0000-0000-0000-0000]' });
        break;
      case 'matrix':
        newHistory.push({ type: 'output', text: 'Wake up, Neo...' });
        newHistory.push({ type: 'output', text: 'The Matrix has you...' });
        break;
      case 'clear':
        setHistory([]);
        setInput("");
        return;
      case 'exit':
        setIsOpen(false);
        setInput("");
        return;
      default:
        newHistory.push({ type: 'output', text: `Command not found: ${cmd}` });
    }

    setHistory(newHistory);
    setInput("");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 font-sans text-green-500 p-8 overflow-y-auto" onClick={() => inputRef.current?.focus()}>
      <div className="absolute inset-0 pointer-events-none opacity-10" style={{ backgroundImage: "linear-gradient(rgba(0, 255, 0, 0.2) 1px, transparent 1px)", backgroundSize: "100% 4px" }} />
      <div className="max-w-4xl mx-auto relative z-10">
        {history.map((h, i) => (
          <div key={i} className={`mb-2 ${h.type === 'input' ? 'text-green-400' : 'text-green-600'}`}>
            {h.text}
          </div>
        ))}
        <form onSubmit={handleSubmit} className="flex items-center">
          <span className="mr-2 text-green-400">ov_root@platform:~$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-green-500 font-sans"
            autoFocus
          />
        </form>
      </div>
    </div>
  );
};
