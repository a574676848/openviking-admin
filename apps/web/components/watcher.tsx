"use client";
import { motion, useSpring, useTransform, AnimatePresence } from "framer-motion";
import { useEffect } from "react";

interface WatcherProps {
  isClosed?: boolean;
  isThinking?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function VikingWatcher({ isClosed = false, isThinking = false, size = "md", className = "" }: WatcherProps) {
  const springX = useSpring(0, { stiffness: 100, damping: 20 });
  const springY = useSpring(0, { stiffness: 100, damping: 20 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      const x = (e.clientX / innerWidth) * 2 - 1;
      const y = (e.clientY / innerHeight) * 2 - 1;
      springX.set(x);
      springY.set(y);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [springX, springY]);

  const pupilX = useTransform(springX, [-1, 1], [-8, 8]);
  const pupilY = useTransform(springY, [-1, 1], [-8, 8]);

  const sizeMap = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  const eyeBallSizeMap = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-10 h-10",
  };

  return (
    <div className={`flex gap-4 ${className}`}>
      {[1, 2].map((i) => (
        <div 
          key={i}
          className={`${sizeMap[size]} rounded-full border-[var(--border-width)] border-[var(--border)] flex items-center justify-center bg-[var(--bg-card)] transition-all duration-300 shadow-[var(--shadow-base)] overflow-hidden relative`}
        >
          <AnimatePresence mode="wait">
            {isClosed ? (
              <motion.div 
                key="closed"
                initial={{ y: -20 }}
                animate={{ y: 0 }}
                exit={{ y: 20 }}
                className="w-full h-full bg-[var(--text-primary)] flex items-center justify-center"
              >
                <div className="w-10 h-1 bg-[var(--bg-card)] rounded-full" />
              </motion.div>
            ) : isThinking ? (
              <motion.div
                key="thinking"
                className="w-full h-full flex items-center justify-center"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              >
                <div className={`border-2 border-dashed border-[var(--brand)] rounded-full ${eyeBallSizeMap[size]}`} />
              </motion.div>
            ) : (
              <motion.div 
                key="open"
                className={`${eyeBallSizeMap[size]} bg-[var(--text-primary)] rounded-full`}
                style={{ x: pupilX, y: pupilY }}
              />
            )}
          </AnimatePresence>
          
          {/* 光泽感 */}
          {!isClosed && (
            <div className="absolute top-2 left-2 w-2 h-2 bg-[var(--bg-card)]/30 rounded-full blur-[1px]" />
          )}
        </div>
      ))}
    </div>
  );
}
