"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Terminal, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import { readSessionUser } from "@/lib/session";

export default function NewKnowledgeBasePage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", description: "", tenantId: "", vikingUri: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = readSessionUser();
    const tid = user?.tenantId ?? "default";

    // 从 dashboard 获取租户业务标识（如 tenant-alpha），用于 URI 和隐藏字段
    apiClient.get<{ tenantIdentifier?: string }>("/system/dashboard").then((dashboard) => {
      const identifier = dashboard.tenantIdentifier ?? tid;
      setForm((prev) => ({
        ...prev,
        tenantId: identifier,
        vikingUri: `viking://resources/${identifier}/`,
      }));
    }).catch(() => {
      setForm((prev) => ({
        ...prev,
        tenantId: tid,
        vikingUri: `viking://resources/${tid}/`,
      }));
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiClient.post("/knowledge-bases", form);
      router.push("/console/knowledge-bases");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "初始化集群失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col pb-10 min-h-full">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-end border-b-[var(--border-width)] border-[var(--border)] pb-6 mb-8">
        <div>
           <Link href="/console/knowledge-bases" className="inline-flex items-center text-xs font-sans font-bold tracking-widest text-[var(--text-muted)] hover:text-[var(--brand)] mb-4 uppercase transition-colors">
             <ArrowLeft size={14} className="mr-2" strokeWidth={2} /> 返回知识库列表
           </Link>
           <h1 className="text-4xl md:text-5xl font-black font-sans tracking-tighter uppercase mb-2 text-[var(--text-primary)] flex items-center">
             <Terminal size={40} strokeWidth={2} className="mr-4 text-[var(--text-primary)]" />
             新建知识库
           </h1>
           <p className="font-bold font-sans tracking-widest text-[var(--text-secondary)] uppercase text-xs">
             {"// 创建新的向量知识库节点"}
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)]">

        {/* ─── Form Area ─── */}
        <form onSubmit={handleSubmit} className="bg-[var(--bg-card)] p-8 md:p-12 relative">
          {/* Background Grid Pattern */}
          <div className="absolute inset-0 opacity-5 pointer-events-none z-0" style={{ backgroundImage: "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

          <div className="relative z-10 space-y-8">
            <div className="space-y-2">
              <label className="block text-xs font-sans font-black text-[var(--text-primary)] uppercase tracking-widest flex items-center">
                <span className="w-2 h-2 bg-[var(--brand)] inline-block mr-2" /> 知识库名称 <span className="text-[var(--danger)] ml-1">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="例如：产品说明书与开发规范"
                className="ov-input px-4 py-3 font-sans text-base font-bold placeholder:font-normal placeholder:font-sans placeholder:text-xs"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-sans font-black text-[var(--text-primary)] uppercase tracking-widest flex items-center">
                <span className="w-2 h-2 bg-[var(--text-secondary)] inline-block mr-2" /> 详细描述
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="输入关于此知识库的功能边界与数据来源说明..."
                rows={3}
                className="ov-input px-4 py-3 font-sans text-sm resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-sans font-black text-[var(--text-primary)] uppercase tracking-widest flex items-center">
                <span className="w-2 h-2 bg-[var(--info)] inline-block mr-2" /> 集群拓扑定位
              </label>
              <input
                type="text"
                value={form.vikingUri}
                readOnly
                className="ov-input px-4 py-3 font-sans text-sm opacity-60 cursor-not-allowed"
              />
              <p className="text-[10px] font-sans text-[var(--text-muted)] tracking-widest uppercase">
                {"// 系统自动分配，基于当前租户空间生成"}
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-3 p-4 border-[var(--border-width)] border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)] font-sans text-xs font-bold uppercase tracking-widest shadow-[var(--shadow-hover)] relative z-20">
                <AlertTriangle size={16} strokeWidth={2} className="shrink-0 mt-0.5" />
                <span>[错误] {error}</span>
              </div>
            )}

            <div className="flex gap-4 pt-6 border-t-[var(--border-width)] border-[var(--border)] border-dashed justify-center">
              <button
                type="submit"
                disabled={submitting}
                className="ov-button w-44 py-4 text-sm font-black tracking-[0.2em]"
              >
                {submitting ? "创建中..." : "确认创建"}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="ov-button w-44 py-4 text-sm font-black tracking-[0.2em] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                style={{ background: "var(--border)" }}
              >
                取消
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}
