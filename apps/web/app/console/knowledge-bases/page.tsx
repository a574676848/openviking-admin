"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Database, FolderTree, Plus, Search } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleInput,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsolePanel,
  ConsolePanelHeader,
  ConsoleListRow,
  ConsoleStatsGrid,
  ConsoleTableShell,
  resolveConsoleTableState,
} from "@/components/console/primitives";

interface KnowledgeBase {
  id: string;
  name: string;
  tenantId: string;
  status: string;
  vikingUri: string;
  docCount: number;
  vectorCount: number;
  createdAt: string;
}

interface DashboardSnapshot {
  kbCount?: number;
  quota?: Record<string, unknown> | null;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: "运行中", className: "bg-[var(--success)] text-white" },
  building: { label: "构建中", className: "bg-[var(--warning)] text-black" },
  archived: { label: "已归档", className: "bg-[var(--text-muted)] text-white" },
};

const TABLE_COLUMNS = "lg:grid-cols-[minmax(0,1fr)_120px_110px_110px_minmax(160px,1fr)_180px]";

/** 根据占用比例返回对应的色调 */
function usageTone(percent: number): "brand" | "warning" | "danger" {
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warning";
  return "brand";
}

/** 配额进度卡片 — 符合 Playful Engineering 设计语言 */
function QuotaProgressCard({ used, total, percent }: { used: number; total: number; percent: number }) {
  const tone = usageTone(percent);
  const fillColor =
    tone === "danger"
      ? "bg-[var(--danger)]"
      : tone === "warning"
        ? "bg-[var(--warning)]"
        : "bg-[var(--brand)]";

  return (
    <div className="rounded-[var(--radius-base)] border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-6">
      {/* 顶部：大数字 + 百分比方块 */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <span className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
            已使用 / 总量
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-5xl font-black tabular-nums leading-none text-[var(--text-primary)]">
              {used.toLocaleString()}
            </span>
            <span className="font-mono text-sm font-bold text-[var(--text-muted)]">
              / {total.toLocaleString()}
            </span>
          </div>
        </div>
        <div
          className="flex h-10 items-center justify-center rounded-full px-5 text-black"
        >
          <span className="font-mono text-sm font-black tabular-nums text-[var(--text-primary)]">{percent}%</span>
        </div>
      </div>

      {/* 进度条 */}
      <div className="mt-6">
        <div className="relative h-3 border-[3px] border-[var(--border)] bg-[var(--bg-card)] p-[2px]">
          <div
            className={`h-full transition-all duration-700 ease-out ${fillColor}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      </div>

      {/* 分段色标 */}
      <div className="mt-4 flex items-center gap-5">
        {[
          { label: "充足", color: "bg-[var(--brand)]", active: percent < 70 },
          { label: "紧张", color: "bg-[var(--warning)]", active: percent >= 70 && percent < 90 },
          { label: "耗尽", color: "bg-[var(--danger)]", active: percent >= 90 },
        ].map((seg) => (
          <span
            key={seg.label}
            className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] ${
              seg.active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
            }`}
          >
            <span className={`inline-block h-2.5 w-2.5 border-2 border-[var(--border)] ${seg.color}`} />
            {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function KnowledgeBasesPage() {
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [quota, setQuota] = useState({ used: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [kbData, dashboard] = await Promise.all([
          apiClient.get<KnowledgeBase[]>("/knowledge-bases"),
          apiClient.get<DashboardSnapshot>("/system/dashboard"),
        ]);

        if (!active) {
          return;
        }

        setItems(kbData);

        const used = dashboard.kbCount ?? kbData.length;
        const maxDocs =
          (dashboard.quota as Record<string, number> | undefined)?.maxDocs ?? 0;
        setQuota({
          used,
          total: maxDocs > 0 ? maxDocs : 0,
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) {
      return items;
    }
    return items.filter((item) => {
      return item.name.toLowerCase().includes(keyword) || item.id.toLowerCase().includes(keyword);
    });
  }, [items, searchQuery]);

  const totals = useMemo(() => {
    return items.reduce(
      (accumulator, item) => {
        accumulator.docs += item.docCount ?? 0;
        accumulator.vectors += item.vectorCount ?? 0;
        return accumulator;
      },
      { docs: 0, vectors: 0 },
    );
  }, [items]);

  const usagePercent = quota.total > 0 ? Math.min(Math.round((quota.used / quota.total) * 100), 100) : 0;
  const tableState = resolveConsoleTableState({
    loading,
    hasData: filtered.length > 0,
  });

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="知识库管理"
        subtitle="统一管理租户知识库、容量使用与知识树入口"
        actions={
          <Link href="/console/knowledge-bases/new">
            <ConsoleButton type="button">
              <Plus size={14} strokeWidth={2.6} />
              新建知识库
            </ConsoleButton>
          </Link>
        }
      />

      <ConsoleStatsGrid className="lg:grid-cols-4">
        <ConsoleMetricCard label="知识库数量" value={(items.length || 0).toLocaleString()} tone="brand" />
        <ConsoleMetricCard label="文档数" value={totals.docs.toLocaleString()} />
        <ConsoleMetricCard label="向量数" value={totals.vectors.toLocaleString()} tone="warning" />
        <ConsoleMetricCard
          label="配额占用"
          value={
            quota.total > 0
              ? `${usagePercent}%`
              : "—"
          }
          tone={quota.total > 0 ? usageTone(usagePercent) : "default"}
        />
      </ConsoleStatsGrid>

      <ConsolePanel className="p-6">
        <ConsolePanelHeader title="配额与命名空间概况" />

        {quota.total > 0 ? (
          <QuotaProgressCard used={quota.used} total={quota.total} percent={usagePercent} />
        ) : (
          <div className="rounded-[var(--radius-base)] border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-6">
            <p className="text-xs font-bold text-[var(--text-muted)]">
              当前租户未设置配额上限
            </p>
          </div>
        )}
      </ConsolePanel>

      <div className="flex h-full flex-col gap-4">
          {/* 搜索框移至表格上方 */}
          <div className="relative">
            <Search
              size={16}
              strokeWidth={2.6}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <ConsoleInput
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="按名称或 ID 检索知识库"
              className="w-full py-3 pl-11 pr-4"
            />
          </div>

          <ConsoleTableShell
            className="flex-1"
            columns={
              <>
                <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">知识库</div>
                <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">状态</div>
                <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">文档数</div>
                <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">向量数</div>
                <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">引擎资源 URI</div>
                <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">操作</div>
              </>
            }
            headerClassName={`grid ${TABLE_COLUMNS}`}
            state={tableState}
            stateContent={{
              loading: (
                <div className="bg-[var(--bg-card)] px-6 py-16 text-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  正在读取知识库注册表...
                </div>
              ),
              empty: <ConsoleEmptyState icon={Database} title="暂无匹配知识库" description="当前没有符合筛选条件的知识库记录。" />,
            }}
          >
            {filtered.map((item) => {
              const status = STATUS_MAP[item.status] ?? {
                label: item.status || "unknown",
                className: "bg-[var(--bg-card)] text-[var(--text-primary)]",
              };

              return (
                <ConsoleListRow
                  key={item.id}
                  name={item.name}
                  nameTestId={`knowledge-base-name-${item.id}`}
                  detailId={item.id}
                  date={`创建于 ${new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}`}
                  badges={[
                    { label: status.label, className: status.className },
                  ]}
                  metrics={[
                    { value: item.docCount ?? 0 },
                    { value: (item.vectorCount ?? 0).toLocaleString(), className: "text-[var(--brand)]" },
                    {
                      value: item.vikingUri || "—",
                      className: "min-w-0",
                      render: (v) => (
                        <span
                          className="block break-all font-mono text-[11px] font-bold leading-relaxed text-[var(--text-muted)] select-all"
                          title="双击或框选复制"
                        >
                          {v}
                        </span>
                      ),
                    },
                  ]}
                  columns={TABLE_COLUMNS}
                  actions={
                    <Link href={`/console/knowledge-tree?kbId=${item.id}`}>
                      <ConsoleButton tone="dark" className="px-3 py-2.5 text-[11px]">
                        <FolderTree size={13} strokeWidth={2.6} />
                        查看知识树
                      </ConsoleButton>
                    </Link>
                  }
                />
              );
            })}
          </ConsoleTableShell>
        </div>
    </div>
  );
}
