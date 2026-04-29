"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-provider";

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading } = useApp();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        if (user.role === "super_admin") {
          router.replace("/platform/dashboard");
        } else {
          router.replace("/console/dashboard");
        }
      } else {
        router.replace("/login");
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center font-sans text-xs uppercase tracking-widest animate-pulse">
      正在连接 OpenViking 核心引擎...
    </div>
  );
}
