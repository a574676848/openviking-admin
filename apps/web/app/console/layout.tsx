"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getShellButtonClass, getShellPanelClass, getShellTileClass, type ShellTheme } from "@/components/ui/shell-primitives";
import { SquareTerminal, Database, Network, FileText, Search, Activity, MessageSquare, Users2, Link2, ClipboardList, MonitorCheck, LogOut, Bot, Menu, X, ChevronLeft, KeyRound } from "lucide-react";

const navItems = [
  { id: "01", href: "/console/dashboard", label: "租户工作台", icon: SquareTerminal, full: "租户工作台" },
  { id: "02", href: "/console/knowledge-bases", label: "知识库管理", icon: Database, full: "知识库管理" },
  { id: "03", href: "/console/knowledge-tree", label: "图谱知识树", icon: Network, full: "图谱知识树" },
  { id: "04", href: "/console/documents", label: "文档处理中心", icon: FileText, full: "文档处理中心" },
  { id: "05", href: "/console/search", label: "智能检索分析", icon: Search, full: "智能检索分析" },
  { id: "06", href: "/console/qa", label: "沙盒问答调试", icon: MessageSquare, full: "沙盒问答调试" },
  { id: "07", href: "/console/analysis", label: "无答案洞察", icon: Activity, full: "无答案洞察" },
  { id: "08", href: "/console/users", label: "成员管理", icon: Users2, full: "成员管理" },
  { id: "09", href: "/console/integrations", label: "集成中心", icon: KeyRound, full: "集成凭证与身份接入" },
  { id: "10", href: "/console/capability", label: "凭证中心", icon: Bot, full: "Capability 凭证中心" },
  { id: "11", href: "/console/webdav", label: "WebDAV 配置", icon: Link2, full: "WebDAV 挂载" },
  { id: "12", href: "/console/audit", label: "租户审计", icon: ClipboardList, full: "租户审计日志" },
  { id: "13", href: "/console/system", label: "系统状态", icon: MonitorCheck, full: "租户系统状态" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, isLoading, theme } = useApp();
  const [mounted, setMounted] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const shellTheme: ShellTheme = theme === "starry" ? "starry" : "neo";
  const isStarry = shellTheme === "starry";

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (!mounted || isLoading) return;
    if (!user) {
      router.replace("/login");
    }
  }, [isLoading, mounted, user]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const visibleNavItems = useMemo(
    () =>
      navItems.filter((item) => {
        if (item.href !== "/console/system") {
          return true;
        }
        return Boolean(user?.hasCustomOvConfig);
      }),
    [user?.hasCustomOvConfig],
  );

  const activeItem = useMemo(
    () => visibleNavItems.find((item) => pathname.startsWith(item.href)) ?? visibleNavItems[0],
    [pathname, visibleNavItems]
  );

  if (!mounted || isLoading || !user) return null;

  return (
    <div className="relative flex h-screen bg-transparent text-[var(--text-primary)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <aside className={getShellPanelClass(shellTheme, "sidebar", `relative hidden shrink-0 lg:flex lg:flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-[72px]' : 'w-[292px]'}`)}>
        <div className="border-b border-[var(--border)] px-6 py-7">
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-4'}`}>
            <div className="flex h-12 w-12 items-center justify-center border border-[var(--border)] bg-[var(--bg-card)] shrink-0 rounded-[var(--radius-tile)]">
              <SquareTerminal size={20} strokeWidth={1.8} className="text-[var(--brand)]" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tenant Node</p>
                <h1 className="truncate font-sans text-2xl font-bold tracking-tight">{user.username}</h1>
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

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-2">
            {visibleNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`group flex items-center transition-all mb-1 rounded-[var(--radius-base)] ${
                    sidebarCollapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-3'
                  } ${
                    isActive
                      ? "border border-[var(--border)] bg-[var(--brand-muted)] text-[var(--text-primary)]"
                      : "border border-transparent bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  {!sidebarCollapsed && <span className="w-7 font-sans text-[11px] font-bold opacity-50">{item.id}</span>}
                  <Icon size={16} strokeWidth={2.4} className={`${isActive ? "text-[var(--brand)]" : ""} shrink-0`} />
                  {!sidebarCollapsed && <span className="min-w-0 flex-1 truncate font-sans text-sm font-bold">{item.label}</span>}
                  {!sidebarCollapsed && (
                    <span className={`font-sans text-xs ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>{">>"}</span>
                  )}
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
              aria-label={mobileNavOpen ? "关闭导航菜单" : "打开导航菜单"}
              title={mobileNavOpen ? "关闭导航菜单" : "打开导航菜单"}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((value) => !value)}
              className={getShellButtonClass(shellTheme, "default", "flex h-11 w-11")}
            >
              {mobileNavOpen ? <X size={18} strokeWidth={2.4} /> : <Menu size={18} strokeWidth={2.4} />}
            </button>
            <div className="flex items-center gap-2">
              <ThemeSwitcher align="right" />
              <button
                type="button"
                onClick={logout}
                aria-label="退出系统"
                title="退出系统"
                className={getShellButtonClass(shellTheme, "danger", "flex h-11 px-4")}
              >
                <LogOut size={14} strokeWidth={2.4} />
                退出
              </button>
            </div>
          </div>
        </header>

        {mobileNavOpen ? (
          <div className="border-b border-[var(--border)] bg-[var(--bg-card)] px-4 py-4 lg:hidden">
            <nav className="grid gap-2" aria-label="移动端控制台导航">
              {visibleNavItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`flex items-center gap-3 border px-3 py-3 font-sans text-sm font-bold rounded-[var(--radius-base)] mb-2 ${
                      isActive
                        ? "border-[var(--border)] bg-[var(--brand-muted)] text-[var(--text-primary)]"
                        : "border-transparent bg-[var(--bg-card)] text-[var(--text-primary)]"
                    }`}
                  >
                    <Icon size={16} strokeWidth={2.4} />
                    <span className="flex-1">{item.label}</span>
                    <span className="text-[11px] font-bold text-[var(--text-muted)] opacity-50">{item.id}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
