"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SquareTerminal, Database, Network, FileText, Search, Activity, MessageSquare, Users2, Link2, ClipboardList, MonitorCheck, LogOut, Bot } from "lucide-react";

const navItems = [
  { id: "01", href: "/console/dashboard", label: "租户工作台", icon: SquareTerminal, full: "租户工作台" },
  { id: "02", href: "/console/knowledge-bases", label: "知识库管理", icon: Database, full: "知识库管理" },
  { id: "03", href: "/console/knowledge-tree", label: "图谱知识树", icon: Network, full: "图谱知识树" },
  { id: "04", href: "/console/documents", label: "文档处理中心", icon: FileText, full: "文档处理中心" },
  { id: "05", href: "/console/search", label: "智能检索分析", icon: Search, full: "智能检索分析" },
  { id: "06", href: "/console/analysis", label: "无答案洞察", icon: Activity, full: "无答案洞察" },
  { id: "07", href: "/console/qa", label: "沙盒问答调试", icon: MessageSquare, full: "沙盒问答调试" },
  { id: "08", href: "/console/users", label: "租户内用户", icon: Users2, full: "租户内用户管理" },
  { id: "09", href: "/console/webdav", label: "WebDAV 配置", icon: Link2, full: "WebDAV 挂载" },
  { id: "10", href: "/console/audit", label: "租户审计", icon: ClipboardList, full: "租户审计日志" },
  { id: "11", href: "/console/system", label: "系统状态", icon: MonitorCheck, full: "租户系统状态" },
  { id: "12", href: "/console/mcp", label: "MCP 智能助手", icon: Bot, full: "MCP 智能助手接入" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, isLoading } = useApp();
  const [mounted, setMounted] = useState(false);

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
  }, [isLoading, mounted, router, user]);

  const activeItem = useMemo(
    () => navItems.find((item) => pathname.startsWith(item.href)) ?? navItems[0],
    [pathname]
  );

  if (!mounted || isLoading || !user) return null;

  return (
    <div className="relative flex min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <aside className="relative hidden w-[292px] shrink-0 border-r-[3px] border-[var(--border)] bg-[var(--bg-card)] shadow-[8px_0px_0px_#000] lg:flex lg:flex-col">
        <div className="border-b-[3px] border-[var(--border)] bg-[var(--brand)] px-5 py-6 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center border-[3px] border-[var(--border)] bg-[var(--bg-card)] text-black shadow-[3px_3px_0px_#000]">
              <SquareTerminal size={20} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.28em] opacity-80">Tenant Node</p>
              <h1 className="truncate font-sans text-2xl font-black tracking-tight">{user.username}</h1>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-2">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`group flex items-center gap-3 border-[3px] px-3 py-3 font-mono text-[10px] font-black uppercase tracking-[0.18em] transition-all ${
                    isActive
                      ? "translate-x-1 border-[var(--border)] bg-black text-white shadow-[4px_4px_0px_var(--brand)]"
                      : "border-transparent bg-[var(--bg-card)] text-[var(--text-primary)] hover:translate-x-2 hover:border-[var(--border)] hover:shadow-[4px_4px_0px_#000]"
                  }`}
                >
                  <span className="w-7 text-[9px]">{item.id}</span>
                  <Icon size={16} strokeWidth={2.4} className={isActive ? "text-[var(--brand)]" : ""} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className={`${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>{">>"}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="mt-auto border-t-[3px] border-[var(--border)] p-4">
          <div className="space-y-3">
            <ThemeSwitcher className="w-full" />
            <button
              type="button"
              onClick={logout}
              className="flex h-11 w-full items-center justify-center gap-2 border-[3px] border-[var(--border)] bg-[var(--danger)] font-mono text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-[2px_2px_0px_#000] transition-all hover:translate-y-0.5 hover:shadow-none"
            >
              <LogOut size={14} strokeWidth={2.4} />
              退出系统
            </button>
          </div>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="border-b-[3px] border-[var(--border)] bg-[var(--bg-base)] px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.28em] text-[var(--brand)]">
                Neo Control Dock
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <h2 className="font-sans text-4xl font-black tracking-tight">{activeItem.label}</h2>
                <span className="pb-1 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  {activeItem.full}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 lg:hidden">
              <ThemeSwitcher />
              <button
                type="button"
                onClick={logout}
                className="flex h-11 items-center justify-center gap-2 border-[3px] border-[var(--border)] bg-[var(--danger)] px-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-white"
              >
                <LogOut size={14} strokeWidth={2.4} />
                退出
              </button>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
