"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Terminal, AlertTriangle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";

export default function NewKnowledgeBasePage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", description: "", tenantId: "default", vikingUri: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
           <Link href="/console/knowledge-bases" className="inline-flex items-center text-xs font-mono font-bold tracking-widest text-[var(--text-muted)] hover:text-[var(--brand)] mb-4 uppercase transition-colors">
             <ArrowLeft size={14} className="mr-2" strokeWidth={2} /> BACK_TO_CLUSTERS
           </Link>
           <h1 className="text-4xl md:text-5xl font-black font-sans tracking-tighter uppercase mb-2 text-[var(--text-primary)] flex items-center">
             <Terminal size={40} strokeWidth={2} className="mr-4 text-[var(--text-primary)]" />
             初始化存储集群_
           </h1>
           <p className="font-bold font-mono tracking-widest text-[var(--text-secondary)] uppercase text-xs">
             {"// DEPLOY NEW VECTOR KNOWLEDGE BASE NODE"}
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)]">
        
        {/* ─── Form Area ─── */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 bg-[var(--bg-card)] p-8 md:p-12 relative">
          {/* Background Grid Pattern */}
          <div className="absolute inset-0 opacity-5 pointer-events-none z-0" style={{ backgroundImage: "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
          
          <div className="relative z-10 space-y-8">
            <div className="space-y-2">
              <label className="block text-xs font-mono font-black text-[var(--text-primary)] uppercase tracking-widest flex items-center">
                <span className="w-2 h-2 bg-[var(--brand)] inline-block mr-2" /> 集群标识名称 (Cluster_Name) <span className="text-[var(--danger)] ml-1">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="e.g. 产品说明书与开发规范_V2"
                className="ov-input px-4 py-3 font-sans text-base font-bold placeholder:font-normal placeholder:font-mono placeholder:text-xs"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-mono font-black text-[var(--text-primary)] uppercase tracking-widest flex items-center">
                <span className="w-2 h-2 bg-[var(--info)] inline-block mr-2" /> 租户空间标识 (Tenant_Space) <span className="text-[var(--danger)] ml-1">*</span>
              </label>
              <input
                type="text"
                value={form.tenantId}
                onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                required
                placeholder="default"
                className="ov-input px-4 py-3 font-mono text-sm uppercase placeholder:normal-case"
              />
              <p className="text-[10px] font-mono text-[var(--text-muted)] tracking-widest uppercase">
                {"// 租户空间决定了物理文件的隔离边界"}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-mono font-black text-[var(--text-primary)] uppercase tracking-widest flex items-center">
                <span className="w-2 h-2 bg-[var(--warning)] inline-block mr-2" /> 集群拓扑定位 (Viking_URI)
              </label>
              <input
                type="text"
                value={form.vikingUri}
                onChange={(e) => setForm({ ...form, vikingUri: e.target.value })}
                placeholder="viking://resources/default/"
                className="ov-input px-4 py-3 font-mono text-sm placeholder:text-[var(--text-muted)]"
              />
              <p className="text-[10px] font-mono text-[var(--text-muted)] tracking-widest uppercase">
                {"// 选填。系统引擎将以此作为资源寻址基础"}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-mono font-black text-[var(--text-primary)] uppercase tracking-widest flex items-center">
                <span className="w-2 h-2 bg-[var(--text-secondary)] inline-block mr-2" /> 详细描述注解 (Description)
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="[输入关于此知识集群的功能边界与数据来源说明...]"
                rows={3}
                className="ov-input px-4 py-3 font-mono text-sm resize-none"
              />
            </div>

            {error && (
              <div className="flex items-start gap-3 p-4 border-[var(--border-width)] border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)] font-mono text-xs font-bold uppercase tracking-widest shadow-[var(--shadow-hover)] relative z-20">
                <AlertTriangle size={16} strokeWidth={2} className="shrink-0 mt-0.5" />
                <span>[SYS_ERR] {error}</span>
              </div>
            )}

            <div className="flex gap-4 pt-6 border-t-[var(--border-width)] border-[var(--border)] border-dashed">
              <button
                type="submit"
                disabled={submitting}
                className="ov-button flex-1 py-4 text-sm font-black tracking-[0.2em]"
              >
                {submitting ? ">> INIT_IN_PROGRESS..." : ">> DEPLOY_CLUSTER"}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="ov-button bg-[var(--bg-elevated)] text-[var(--text-primary)] px-8 py-4 text-sm font-black tracking-[0.2em] hover:bg-[var(--text-primary)] hover:text-[var(--bg-base)]"
              >
                CANCEL
              </button>
            </div>
          </div>
        </form>

        {/* ─── Side Info Panel ─── */}
        <div className="bg-[var(--bg-card)] p-8 border-t-[var(--border-width)] lg:border-t-0 border-[var(--border)]">
           <h3 className="font-sans font-black text-xl uppercase tracking-tighter mb-6 flex items-center">
              <ShieldCheck size={20} strokeWidth={2} className="mr-2 text-[var(--brand)]" />
              部署策略检查
           </h3>
           
           <div className="space-y-6">
              <div className="border-[var(--border-width)] border-[var(--border)] p-4 bg-[var(--bg-elevated)]">
                 <h4 className="font-mono text-xs font-black uppercase tracking-widest text-[var(--text-primary)] mb-2">Namespace_Isolation</h4>
                 <p className="font-mono text-[10px] leading-relaxed tracking-wider text-[var(--text-secondary)]">
                   {"// 所有新初始化的知识库将严格隔离在指定的 Tenant_Space 下。"}<br/><br/>
                   {"// 不同的租户通过物理层与逻辑层双重隔离，无法跨域检索。"}
                 </p>
              </div>
              
              <div className="border-[var(--border-width)] border-[var(--border)] p-4 bg-[var(--bg-elevated)]">
                 <h4 className="font-mono text-xs font-black uppercase tracking-widest text-[var(--text-primary)] mb-2">Viking_URI_Resolver</h4>
                 <p className="font-mono text-[10px] leading-relaxed tracking-wider text-[var(--text-secondary)]">
                   {"// 系统自动分配默认 URI，形如: viking://resources/[tenantId]/[id]/"} <br/><br/>
                   {"// 您也可强制覆盖该节点路径，用于对接现有的挂载体系。"}
                 </p>
              </div>

              <div className="border-[var(--border-width)] border-[var(--border)] p-4 bg-[var(--bg-elevated)]">
                 <h4 className="font-mono text-xs font-black uppercase tracking-widest text-[var(--text-primary)] mb-2">Index_Strategy</h4>
                 <p className="font-mono text-[10px] leading-relaxed tracking-wider text-[var(--text-secondary)]">
                   {"// 提交部署后，系统仅创建逻辑实体，实际的物理切片和向量化将在「文档处理中心」或者通过「WebDAV 挂载」后由后台守护进程异步处理。"}
                 </p>
              </div>
           </div>
        </div>
        
      </div>
    </div>
  );
}
