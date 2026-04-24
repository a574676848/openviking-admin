"use client";

import React, { useEffect, useState, useRef } from "react";

interface ScrambleTextProps {
  text: string;
  className?: string;
  scrambleSpeed?: number;
  scrambleDuration?: number;
}

const CHARS = "!<>-_\\\\/[]{}—=+*^?#_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const ScrambleText: React.FC<ScrambleTextProps> = ({
  text,
  className = "",
  scrambleSpeed = 30,
  scrambleDuration = 800,
}) => {
  const [displayText, setDisplayText] = useState("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let frame = 0;
    const length = text.length;
    const totalFrames = scrambleDuration / scrambleSpeed;
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      frame++;
      
      const progress = frame / totalFrames;
      const resolvedLength = Math.floor(progress * length);

      let newText = "";
      for (let i = 0; i < length; i++) {
        if (i < resolvedLength) {
          newText += text[i];
        } else {
          newText += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      }

      setDisplayText(newText);

      if (frame >= totalFrames) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDisplayText(text);
      }
    }, scrambleSpeed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, scrambleDuration, scrambleSpeed]);

  return <span className={className}>{displayText || " "}</span>;
};
