"use client";

import { use, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { BookOpen, Folder, FileText, ChevronRight } from "lucide-react";
import { KnowledgeSiteShell, useKnowledgeSite } from "@/components/knowledge-site/knowledge-site-shell";
import { buildKnowledgeSiteIndexRoute } from "@/lib/knowledge-site-routes";
import { countKnowledgeSiteCollections, countKnowledgeSiteDocuments } from "@/components/knowledge-site/knowledge-site-admin-utils";
import { useApp } from "@/components/app-provider";
import { getShellPanelClass, ShellPanel } from "@/components/ui/shell-primitives";

function KnowledgeSiteHomeContent({ kbId }: { kbId: string }) {
  const { currentKb, tree } = useKnowledgeSite();
  const { theme } = useApp();

  const collectionCount = useMemo(() => countKnowledgeSiteCollections(tree), [tree]);
  const documentCount = useMemo(() => countKnowledgeSiteDocuments(tree), [tree]);

  return (
    <div className="flex w-full flex-col gap-8">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={getShellPanelClass(theme, "surface", "p-8")}
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)] mb-6">
          <Link href={buildKnowledgeSiteIndexRoute()} className="hover:text-[var(--brand)] transition-colors">站点首页</Link>
          <ChevronRight size={13} strokeWidth={1.8} />
          <span className="text-[var(--brand)]">工作空间</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          {currentKb?.name ?? "正在加载知识空间..."}
        </h1>
        <p className="mt-3 text-[var(--text-muted)] leading-relaxed max-w-2xl">
          欢迎来到知识空间。您可以在左侧目录树中浏览文档，或通过操作菜单管理条目结构。
        </p>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <ShellPanel theme={theme} variant="surface" className="p-4 bg-[var(--bg-elevated)]">
            <div className="text-sm font-medium text-[var(--text-muted)] flex items-center gap-2">
              <Folder size={16} /> 目录数
            </div>
            <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{collectionCount}</div>
          </ShellPanel>
          <ShellPanel theme={theme} variant="surface" className="p-4 bg-[var(--bg-elevated)]">
            <div className="text-sm font-medium text-[var(--text-muted)] flex items-center gap-2">
              <FileText size={16} /> 文档数
            </div>
            <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{documentCount}</div>
          </ShellPanel>
        </div>
      </motion.section>
    </div>
  );
}

export default function KnowledgeSiteHomePage({
  params,
}: {
  params: Promise<{ kbId: string }>;
}) {
  const { kbId } = use(params);

  return (
    <KnowledgeSiteShell kbId={kbId}>
      <KnowledgeSiteHomeContent kbId={kbId} />
    </KnowledgeSiteShell>
  );
}