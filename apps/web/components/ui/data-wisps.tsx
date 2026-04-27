"use client";

import { useEffect, useState, useRef } from "react";

interface Firefly {
  id: number;
  x: number; // vw
  y: number; // vh
  rotation: number; // deg
  scale: number;
  delay: number;
  duration: number;
}

export function DataWisps() {
  const [fireflies, setFireflies] = useState<Firefly[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    // 初始化 5~10 颗萤火虫
    const initialCount = Math.floor(Math.random() * 6) + 5;
    const initialFireflies = Array.from({ length: initialCount }).map(() => {
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const dx = 50 - x;
      const dy = 50 - y;
      const rotation = Math.atan2(dy, dx) * (180 / Math.PI);

      return {
        id: nextId.current++,
        x,
        y,
        rotation,
        scale: Math.random() * 0.6 + 0.4, // 大小不一
        delay: Math.random() * 5, // 随机闪烁起步
        duration: Math.random() * 3 + 4, // 闪烁频率 4~7 秒
      };
    });
    setFireflies(initialFireflies);

    // 每隔随机时间更新位置，制造飞舞效果，并且移除离开屏幕太远的萤火虫
    const moveInterval = setInterval(() => {
      setFireflies((current) =>
        current
          .map((f) => {
            const nextX = f.x + (Math.random() * 30 - 15);
            const nextY = f.y + (Math.random() * 30 - 15);
            const dx = nextX - f.x;
            const dy = nextY - f.y;
            const rotation = Math.atan2(dy, dx) * (180 / Math.PI);

            return {
              ...f,
              x: nextX,
              y: nextY,
              rotation,
              scale: Math.random() * 0.6 + 0.4,
            };
          })
          // 如果飞出屏幕过远 (超过 -30vw 到 130vw 范围) 则销毁
          .filter((f) => f.x >= -30 && f.x <= 130 && f.y >= -30 && f.y <= 130)
      );
    }, 4000);

    // 每 3 秒有概率生成新的萤火虫，维持屏幕内数量的动态平衡（最多 15 只）
    const spawnInterval = setInterval(() => {
      setFireflies((current) => {
        if (current.length >= 15) return current;

        // 随机生成 0 到 2 只新萤火虫
        const spawnCount = Math.floor(Math.random() * 3);
        if (spawnCount === 0) return current;

        const newFireflies = Array.from({ length: spawnCount }).map(() => {
          // 随机从屏幕四个边缘的其中一侧外飞入
          const side = Math.floor(Math.random() * 4); // 0: 上, 1: 右, 2: 下, 3: 左
          let x = 0, y = 0;
          if (side === 0) { x = Math.random() * 100; y = -10; }
          else if (side === 1) { x = 110; y = Math.random() * 100; }
          else if (side === 2) { x = Math.random() * 100; y = 110; }
          else { x = -10; y = Math.random() * 100; }

          const dx = 50 - x;
          const dy = 50 - y;
          const rotation = Math.atan2(dy, dx) * (180 / Math.PI);

          return {
            id: nextId.current++,
            x,
            y,
            rotation,
            scale: Math.random() * 0.6 + 0.4,
            delay: Math.random() * 5,
            duration: Math.random() * 3 + 4,
          };
        });

        return [...current, ...newFireflies];
      });
    }, 3000);

    // Watcher 眼球追踪逻辑
    let animationFrameId: number;
    const trackFirefly = () => {
      if (containerRef.current) {
        const style = window.getComputedStyle(containerRef.current);
        if (style.display !== 'none') {
           const elements = containerRef.current.querySelectorAll('.data-wisp');
           let found = false;
           // 遍历找出处于屏幕可见范围内的一只进行注视
           for (let i = 0; i < elements.length; i++) {
              const rect = elements[i].getBoundingClientRect();
              if (rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0) {
                 const x = rect.left + rect.width / 2;
                 const y = rect.top + rect.height / 2;
                 window.dispatchEvent(new CustomEvent("wisp-track", { detail: { x, y } }));
                 found = true;
                 break;
              }
           }
           if (!found) {
              window.dispatchEvent(new CustomEvent("wisp-track", { detail: null }));
           }
        }
      }
      animationFrameId = requestAnimationFrame(trackFirefly);
    };
    
    setTimeout(() => {
      trackFirefly();
    }, 500);

    return () => {
      clearInterval(moveInterval);
      clearInterval(spawnInterval);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden theme-neo-only">
      {fireflies.map((f) => (
        <div
          key={f.id}
          className="data-wisp absolute flex items-center"
          style={{
            left: `${f.x}vw`,
            top: `${f.y}vh`,
            width: '16px',
            height: '16px',
            transform: `translate(-50%, -50%) rotate(${f.rotation}deg) scale(${f.scale})`,
            transition: 'left 5s cubic-bezier(0.4, 0, 0.2, 1), top 4s cubic-bezier(0.4, 0, 0.2, 1), transform 1s ease-in-out',
          }}
        >
          {/* 发光尾部 (左边) */}
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#E2F87A] shadow-[0_0_8px_2px_#E2F87A] animate-firefly z-10"
            style={{ animationDelay: `${f.delay}s`, animationDuration: `${f.duration}s` }}
          >
             <div className="absolute w-8 h-8 -top-3 -left-3 bg-[var(--brand)] opacity-40 blur-[6px] rounded-full pointer-events-none" />
             <div className="absolute w-20 h-20 -top-9 -left-9 bg-[var(--brand)] opacity-10 blur-[15px] rounded-full pointer-events-none" />
          </div>
          
          {/* 身体 (右边，朝着飞行方向) */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-1.5 bg-[#0F172A] rounded-full z-20 opacity-80" />
          
          {/* 翅膀 (基于身体中心做扇动) */}
          <div className="absolute right-2 top-[3px] w-2 h-1.5 bg-white/60 rounded-full origin-bottom animate-wing-top z-30" />
          <div className="absolute right-2 bottom-[3px] w-2 h-1.5 bg-white/60 rounded-full origin-top animate-wing-bottom z-30" />
        </div>
      ))}
    </div>
  );
}
