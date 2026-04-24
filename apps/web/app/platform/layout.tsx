"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SquareTerminal, Users2, Building2, Settings, ClipboardList, MonitorCheck, LogOut, LineChart } from "lucide-react";

const navItems = [
  { id: "01", href: "/platform/dashboard", label: "平台总览", icon: SquareTerminal, full: "平台总览" },
  { id: "02", href: "/platform/tenants", label: "租户管理", icon: Building2, full: "租户管理" },
  { id: "03", href: "/platform/users", label: "全局用户", icon: Users2, full: "全局用户" },
  { id: "04", href: "/platform/system", label: "全局监控", icon: MonitorCheck, full: "全局系统监控" },
  { id: "05", href: "/platform/audit", label: "全局审计", icon: ClipboardList, full: "全局审计日志" },
  { id: "06", href: "/platform/settings", label: "平台设置", icon: Settings, full: "平台配置管理" },
  { id: "07", href: "/platform/analytics", label: "全局分析", icon: LineChart, full: "全平台数据分析" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { logout, user, isLoading } = useApp();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (!mounted || isLoading) return;
    if (!user) {
      router.replace("/platform/login");
      return;
    }
    if (user.role !== "super_admin") {
      router.replace("/console/dashboard");
    }
  }, [isLoading, mounted, router, user]);

  const activeItem = useMemo(
    () => navItems.find((item) => pathname.startsWith(item.href)) ?? navItems[0],
    [pathname]
  );

  if (!mounted || isLoading || !user || user.role !== "super_admin") return null;

  if (pathname === "/platform/login") {
    return <>{children}</>;
  }

  return (
    <div className="theme-swiss relative flex min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <aside className="relative hidden w-[292px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-base)] lg:flex lg:flex-col">
        <div className="border-b border-[var(--border)] px-6 py-7">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center border border-[var(--border)] bg-[var(--bg-card)]">
              <SquareTerminal size={20} strokeWidth={1.8} className="text-[var(--brand)]" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">
                Platform Node
              </p>
              <h1 className="font-sans text-2xl font-black tracking-tight">OpenViking</h1>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-5">
          <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  title={item.full}
                  className={`group flex items-center gap-3 bg-[var(--bg-base)] px-4 py-4 transition-colors ${
                    isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span className="w-7 font-mono text-[10px] font-black tracking-[0.2em]">{item.id}</span>
                  <Icon size={15} strokeWidth={1.8} className={isActive ? "text-[var(--brand)]" : "text-[var(--text-muted)]"} />
                  <span className="flex-1 font-mono text-[11px] font-black tracking-[0.18em] uppercase">{item.label}</span>
                  <span className={`font-mono text-[10px] ${isActive ? "text-[var(--brand)]" : "opacity-0 group-hover:opacity-50"}`}>{">_"}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="mt-auto border-t border-[var(--border)] px-4 py-4">
          <div className="grid grid-cols-1 gap-3">
            <ThemeSwitcher className="w-full" />
            <button
              type="button"
              onClick={logout}
              className="flex h-11 items-center justify-center gap-2 border border-[var(--danger)] bg-transparent font-mono text-[10px] font-black uppercase tracking-[0.24em] text-[var(--danger)] transition-colors hover:bg-[var(--danger)] hover:text-white"
            >
              <LogOut size={14} strokeWidth={1.8} />
              退出系统
            </button>
          </div>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--border)] bg-[var(--bg-base)] px-6 py-5 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.28em] text-[var(--brand)]">
                Swiss Control Panel
              </p>
              <div className="mt-2 flex items-end gap-3">
                <h2 className="font-sans text-3xl font-black tracking-tight lg:text-4xl">{activeItem.label}</h2>
                <span className="pb-1 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  {activeItem.full}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 lg:hidden">
              <ThemeSwitcher />
              <button
                type="button"
                onClick={logout}
                className="flex h-11 items-center justify-center gap-2 border border-[var(--danger)] px-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[var(--danger)]"
              >
                <LogOut size={14} strokeWidth={1.8} />
                退出
              </button>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
