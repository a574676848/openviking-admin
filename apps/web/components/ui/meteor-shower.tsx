"use client";

import { useEffect, useState } from "react";

interface Meteor {
  id: number;
  left: string;
  top: string;
  delay: string;
  duration: string;
}

export function MeteorShower() {
  const [meteors, setMeteors] = useState<Meteor[]>([]);

  useEffect(() => {
    // 随机生成 3 到 6 颗流星
    const meteorCount = Math.floor(Math.random() * 4) + 3;
    const newMeteors = Array.from({ length: meteorCount }).map((_, i) => ({
      id: i,
      left: `${Math.floor(Math.random() * 140) - 20}vw`,
      top: `${Math.floor(Math.random() * 80) - 20}vh`,
      delay: `${Math.random() * 20}s`, // 缩短到 20s 内的随机初始延迟
      duration: `${Math.random() * 15 + 20}s` // 总生命周期 20s ~ 35s (划落时间占25%，即 5s ~ 8.75s，速度非常慢，等待时间 15s ~ 26.25s)
    }));
    setMeteors(newMeteors);

    let animationFrameId: number;
    const trackMeteor = () => {
      const isStarry = document.documentElement.classList.contains("theme-starry") || document.body.classList.contains("theme-starry");
      if (isStarry) {
        const meteorElements = document.querySelectorAll('.animate-meteor');
        let found = false;
        for (let i = 0; i < meteorElements.length; i++) {
          const rect = meteorElements[i].getBoundingClientRect();
          if (rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0) {
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            window.dispatchEvent(new CustomEvent("meteor-track", { detail: { x, y } }));
            found = true;
            break;
          }
        }
        if (!found) {
          window.dispatchEvent(new CustomEvent("meteor-track", { detail: null }));
        }
      }
      animationFrameId = requestAnimationFrame(trackMeteor);
    };
    
    // Slight delay to ensure DOM is ready
    setTimeout(() => {
      trackMeteor();
    }, 500);

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden theme-starry-only">
      {meteors.map((meteor) => (
        <span
          key={meteor.id}
          className="animate-meteor"
          style={{
            left: meteor.left,
            top: meteor.top,
            animationDelay: meteor.delay,
            animationDuration: meteor.duration,
          }}
        />
      ))}
    </div>
  );
}
