"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Database, FolderTree, Plus, Search } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleField,
  ConsoleInput,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsolePanel,
  ConsolePanelHeader,
  ConsoleListRow,
  ConsoleStatsGrid,
  ConsoleTableShell,
} from "@/components/console/primitives";

interface KnowledgeBase {
  id: string;
  name: string;
  tenantId: string;
  status: string;
  docCount: number;
  vectorCount: number;
  createdAt: string;
}

interface DashboardSnapshot {
  kbCount?: number;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: "运行中", className: "bg-[var(--success)] text-white" },
  building: { label: "构建中", className: "bg-[var(--warning)] text-black" },
  archived: { label: "已归档", className: "bg-[var(--text-muted)] text-white" },
};

const TABLE_COLUMNS = "lg:grid-cols-[minmax(0,1fr)_150px_150px_150px]";

export default function KnowledgeBasesPage() {
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [quota, setQuota] = useState({ used: 0, total: 10 });
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
        setQuota({
          used: dashboard.kbCount ?? kbData.length,
          total: 10,
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

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="知识库管理"
        subtitle="Tenant Storage Fabric / Knowledge Base Registry"
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
        <ConsoleMetricCard label="Active Bases" value={(items.length || 0).toLocaleString()} tone="brand" />
        <ConsoleMetricCard label="Documents" value={totals.docs.toLocaleString()} />
        <ConsoleMetricCard label="Vectors" value={totals.vectors.toLocaleString()} tone="warning" />
        <ConsoleMetricCard label="Quota Usage" value={`${usagePercent}%`} tone="danger" />
      </ConsoleStatsGrid>

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[0.92fr_1.08fr]">
        <ConsolePanel className="p-6">
          <ConsolePanelHeader eyebrow="Namespace Capacity" title="配额与命名空间概况" />

          <div className="mt-6 border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                已使用 {quota.used} / {quota.total}
              </span>
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
                {usagePercent}%
              </span>
            </div>
            <div className="mt-4 h-4 border-[3px] border-[var(--border)] bg-[var(--bg-card)] p-[2px]">
              <div
                className={`${usagePercent >= 90 ? "bg-[var(--danger)]" : "bg-[var(--brand)]"} h-full`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>

          <div className="mt-6">
            <ConsoleField label="Search Registry">
            <div className="relative mt-2">
              <Search
                size={16}
                strokeWidth={2.6}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <ConsoleInput
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="按名称或 ID 检索"
                className="py-3 pl-11 pr-4"
              />
            </div>
            </ConsoleField>
          </div>
        </ConsolePanel>

        <ConsoleTableShell
          columns={
            <>
              <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">Knowledge Base</div>
              <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">Docs</div>
              <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">Vectors</div>
              <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">Actions</div>
            </>
          }
          headerClassName={`grid ${TABLE_COLUMNS}`}
          isLoading={loading}
          hasData={filtered.length > 0}
          loadingState={
            <div className="bg-[var(--bg-card)] px-6 py-16 text-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              正在读取知识库注册表...
            </div>
          }
          emptyState={
            <ConsoleEmptyState icon={Database} title="暂无匹配知识库" description="registry is empty or filtered out" />
          }
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
                detailId={item.id}
                date={`创建于 ${new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}`}
                badges={[
                  { label: status.label, className: status.className },
                ]}
                metrics={[
                  { value: item.docCount ?? 0 },
                  { value: (item.vectorCount ?? 0).toLocaleString(), className: "text-[var(--brand)]" },
                ]}
                columns={TABLE_COLUMNS}
                actions={
                  <Link href={`/console/knowledge-tree?kbId=${item.id}`}>
                    <ConsoleButton tone="dark" className="px-4 py-3 tracking-[0.16em]">
                      <FolderTree size={14} strokeWidth={2.6} />
                      查看知识树
                      <ArrowRight size={14} strokeWidth={2.6} />
                    </ConsoleButton>
                  </Link>
                }
              />
            );
          })}
        </ConsoleTableShell>
      </section>
    </div>
  );
}
