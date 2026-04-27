"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getShellButtonClass, getShellPanelClass, getShellTileClass, type ShellTheme } from "@/components/ui/shell-primitives";
import { SquareTerminal, Users2, Building2, Settings, ClipboardList, MonitorCheck, LogOut, LineChart, Menu, X, ChevronLeft } from "lucide-react";

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
  const { logout, user, isLoading, theme } = useApp();
  const [mounted, setMounted] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mobileNavId = useId();
  const shellTheme: ShellTheme = theme === "starry" ? "starry" : "neo";
  const isPlatformLoginPage = pathname === "/platform/login";

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (!mounted || isLoading || isPlatformLoginPage) return;
    if (!user) {
      router.replace("/platform/login");
      return;
    }
    if (user.role !== "super_admin") {
      router.replace("/console/dashboard");
    }
  }, [isLoading, isPlatformLoginPage, mounted, user]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavOpen]);

  const activeItem = useMemo(
    () => navItems.find((item) => pathname.startsWith(item.href)) ?? navItems[0],
    [pathname]
  );

  if (isPlatformLoginPage) {
    return <>{children}</>;
  }

  if (!mounted || isLoading || !user || user.role !== "super_admin") return null;

  return (
    <div className="relative flex h-screen bg-transparent text-[var(--text-primary)]">
      <aside className={getShellPanelClass(shellTheme, "sidebar", `relative hidden shrink-0 lg:flex lg:flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-[72px]' : 'w-[292px]'}`)}>
        <div className="border-b border-[var(--border)] px-6 py-7">
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-4'}`}>
            <div className="flex h-12 w-12 items-center justify-center border border-[var(--border)] bg-[var(--bg-card)] shrink-0 rounded-[var(--radius-tile)]">
              <SquareTerminal size={20} strokeWidth={1.8} className="text-[var(--brand)]" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Platform Node
                </p>
                <h1 className="font-sans text-2xl font-bold tracking-tight">OpenViking</h1>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-tile)] hover:bg-[var(--bg-elevated)] shrink-0"
              title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
            >
              <ChevronLeft size={16} className={`transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  title={sidebarCollapsed ? item.full : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex items-center bg-[var(--bg-base)] transition-colors ${
                    sidebarCollapsed ? 'justify-center px-4 py-4' : 'gap-3 px-4 py-4'
                  } ${
                    isActive
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {!sidebarCollapsed && <span className="w-7 font-sans text-[11px] font-bold opacity-50">{item.id}</span>}
                  <Icon size={15} strokeWidth={1.8} className={`${isActive ? "text-[var(--brand)]" : "text-[var(--text-muted)]"} shrink-0`} />
                  {!sidebarCollapsed && <span className="flex-1 font-sans text-sm font-bold">{item.label}</span>}
                  {!sidebarCollapsed && <span className={`font-sans text-xs ${isActive ? "text-[var(--brand)]" : "opacity-0 group-hover:opacity-50"}`}>{"//"}</span>}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="mt-auto border-t border-[var(--border)] px-4 py-4">
          <div className={`flex ${sidebarCollapsed ? 'flex-col items-center gap-3' : 'flex-row items-center gap-2'}`}>
            <ThemeSwitcher className={sidebarCollapsed ? '' : 'flex-1 min-w-0'} placement="top" compact={sidebarCollapsed} />
            <button
              type="button"
              onClick={logout}
              className={getShellButtonClass(shellTheme, "danger", `flex h-11 ${sidebarCollapsed ? 'w-11 px-0 justify-center' : 'px-3 shrink-0'}`)}
              title="退出系统"
            >
              <div className={getShellTileClass(shellTheme, "p-1.5 bg-[var(--danger)]/10")}>
                <LogOut size={14} strokeWidth={2.5} />
              </div>
              {!sidebarCollapsed && <span className="ml-1">退出系统</span>}
            </button>
          </div>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--border)] bg-[var(--bg-base)] px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label={mobileNavOpen ? "关闭平台导航" : "打开平台导航"}
              title={mobileNavOpen ? "关闭平台导航" : "打开平台导航"}
              aria-expanded={mobileNavOpen}
              aria-controls={mobileNavId}
              onClick={() => setMobileNavOpen((value) => !value)}
              className={getShellButtonClass(shellTheme, "default", "flex h-11 w-11")}
            >
              {mobileNavOpen ? <X size={18} strokeWidth={1.8} /> : <Menu size={18} strokeWidth={1.8} />}
            </button>
            <div className="flex items-center gap-2">
              <ThemeSwitcher align="right" />
              <button
                type="button"
                onClick={logout}
                aria-label="退出平台系统"
                title="退出平台系统"
                className={getShellButtonClass(shellTheme, "danger", "flex h-11 px-3")}
              >
                <div className={getShellTileClass(shellTheme, "p-1.5 bg-[var(--danger)]/10")}>
                  <LogOut size={14} strokeWidth={2.5} />
                </div>
                <span className="ml-1">退出</span>
              </button>
            </div>
          </div>
        </header>

        {mobileNavOpen ? (
          <div className="lg:hidden">
            <button
              type="button"
              aria-label="关闭平台导航遮罩"
              title="关闭平台导航遮罩"
              className="fixed inset-0 z-40 bg-black/35"
              onClick={() => setMobileNavOpen(false)}
            />
            <div
              id={mobileNavId}
              className={getShellPanelClass(shellTheme, "drawer", "fixed inset-y-0 left-0 z-50 flex w-[min(88vw,22rem)] flex-col")}
              role="dialog"
              aria-modal="true"
              aria-label="平台导航菜单"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-5">
                <div>
                  <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--brand)]">Platform Nav</p>
                  <h3 className="mt-2 font-sans text-2xl font-bold tracking-tight">一级页面导航</h3>
                </div>
                <button
                  type="button"
                  aria-label="关闭平台导航"
                  title="关闭平台导航"
                  onClick={() => setMobileNavOpen(false)}
                  className={getShellButtonClass(shellTheme, "default", "flex h-11 w-11")}
                >
                  <X size={18} strokeWidth={1.8} />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto px-4 py-4" aria-label="移动端平台导航">
                <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
                  {navItems.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex items-center gap-3 bg-[var(--bg-base)] px-4 py-4 ${
                          isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        <span className="w-7 font-sans text-[11px] font-bold opacity-50">{item.id}</span>
                        <Icon size={15} strokeWidth={1.8} className={isActive ? "text-[var(--brand)]" : "text-[var(--text-muted)]"} />
                        <span className="flex-1 font-sans text-sm font-bold">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </nav>
              <div className="border-t border-[var(--border)] px-4 py-4">
                <button
                  type="button"
                  onClick={logout}
                  aria-label="退出平台系统"
                  title="退出平台系统"
                  className={getShellButtonClass(shellTheme, "danger", "flex h-11 w-full px-3")}
                >
                  <div className={getShellTileClass(shellTheme, "p-1.5 bg-[var(--danger)]/10")}>
                    <LogOut size={14} strokeWidth={2.5} />
                  </div>
                  <span className="ml-1">退出系统</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
