"use client";
import { apiClient } from "@/lib/apiClient";
import { useEffect, useState } from "react";
import { Settings2, Save, AlertTriangle, ShieldCheck, TerminalSquare, Globe } from "lucide-react";
import {
  PlatformButton,
  PlatformControlCard,
  PlatformInput,
  PlatformPageHeader,
  PlatformPanel,
  PlatformSectionTitle,
  PlatformSelect,
  PlatformStatusPanel,
  PlatformUtilityBar,
} from "@/components/ui/platform-primitives";

interface ConfigRow { key: string; value: string; description: string; updatedAt: string; }

const LABELS: Record<string, string> = {
  'search.top_k': '默认召回数 Top K',
  'search.score_threshold': '命中阈值',
  'search.rerank_enabled': 'Rerank 开关',
  'search.grep_context_lines': 'Grep 上下文行数',
  'ov.base_url': '核心引擎地址',
  'ov.api_key': 'X-API-Key 密钥',
  'ov.account': '引擎账号 ID',
  'rerank.endpoint': 'Rerank 接口地址',
  'rerank.model': 'Rerank 模型名',
};

export default function SettingsPage() {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);



  useEffect(() => {
    (async () => {
      setLoadError("");
      try {
        const d: ConfigRow[] = await apiClient.get("/settings");
        setConfigs(d);
        const map: Record<string, string> = {};
        d.forEach(c => { map[c.key] = c.value; });
        setValues(map);
      } catch (error: unknown) {
        setLoadError(error instanceof Error ? error.message : "全局配置加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await apiClient.patch('/settings', values);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const searchConfigs = configs.filter(c => c.key.startsWith('search.'));
  const infraConfigs = configs.filter(c => c.key.startsWith('ov.') || c.key.startsWith('rerank.'));

  return (
    <div className="w-full max-w-6xl flex flex-col pb-10 min-h-full">
      <PlatformPageHeader
        title={
          <h1 className="mb-2 flex items-center text-4xl font-black tracking-tighter text-[var(--text-primary)] md:text-5xl">
            <Settings2 size={40} strokeWidth={2} className="mr-4 text-[var(--text-primary)]" />
            全局参数配置_
          </h1>
        }
        subtitle={"// 全局检索与 RAG 推理配置"}
      />

      {loading ? (
        <PlatformPanel className="flex flex-col items-center justify-center p-12">
           <div className="w-12 h-12 border-4 border-[var(--border)] border-t-[var(--brand)] rounded-full animate-spin mb-4"></div>
           <div className="font-mono font-bold tracking-widest animate-pulse text-[var(--text-secondary)] uppercase">正在同步配置...</div>
        </PlatformPanel>
      ) : loadError ? (
        <PlatformStatusPanel
          title="配置加载失败"
          description={loadError}
          action={
            <PlatformButton
              type="button"
              tone="danger"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-[10px]"
            >
              重新加载
            </PlatformButton>
          }
          className="border-[var(--danger)]"
        />
      ) : (
        <div className="flex flex-col gap-10">
          
          {/* Section 1: Search Logic */}
          <PlatformPanel className="relative p-6 md:p-10">
             <PlatformSectionTitle
               title="检索与推理逻辑"
               icon={<TerminalSquare size={24} strokeWidth={2} className="text-[var(--brand)]" />}
             />

             <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)]">
               {searchConfigs.map((c) => (
                 <PlatformControlCard
                   key={c.key}
                   label={LABELS[c.key] ?? c.key}
                   description={c.description}
                   accent="brand"
                   control={
                     c.key === 'search.rerank_enabled' ? (
                       <PlatformSelect
                         value={values[c.key] ?? 'false'}
                         onChange={e => setValues(v => ({ ...v, [c.key]: e.target.value }))}
                         className="w-full bg-[var(--bg-elevated)] px-4 py-2 text-center font-bold tracking-widest"
                       >
                         <option value="true">启用</option>
                         <option value="false">停用</option>
                       </PlatformSelect>
                     ) : (
                       <PlatformInput
                         type="number"
                         step={c.key === 'search.score_threshold' ? '0.05' : '1'}
                         value={values[c.key] ?? ''}
                         onChange={e => setValues(v => ({ ...v, [c.key]: e.target.value }))}
                         className="w-full bg-[var(--bg-elevated)] px-4 py-2 text-center text-sm font-black tracking-widest"
                       />
                     )
                   }
                 />
               ))}
             </div>
          </PlatformPanel>

          {/* Section 2: Infrastructure Connection */}
          <PlatformPanel className="relative p-6 md:p-10">
             <PlatformSectionTitle
               title="引擎基础连接"
               icon={<Globe size={24} strokeWidth={2} className="text-[var(--info)]" />}
             />

             <div className="space-y-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)]">
               {infraConfigs.map((c) => (
                 <PlatformControlCard
                   key={c.key}
                   label={LABELS[c.key] ?? c.key}
                   description={c.description}
                   accent="info"
                   layout="inline"
                   control={
                     <PlatformInput
                       type={c.key === 'ov.api_key' ? 'password' : 'text'}
                       value={values[c.key] ?? ''}
                       onChange={e => setValues(v => ({ ...v, [c.key]: e.target.value }))}
                       className="bg-[var(--bg-elevated)] px-4 py-3 text-xs tracking-widest"
                       placeholder="必填配置项"
                     />
                   }
                 />
               ))}
             </div>
          </PlatformPanel>

          {/* Global Footer Save Bar */}
          <PlatformPanel className="sticky bottom-8 z-30">
             <PlatformUtilityBar
               className="p-6"
               leading={
                 <div className="flex items-center gap-3">
                   <AlertTriangle size={20} className="text-[var(--warning)]" />
                   <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
                     注意：保存后会立即作用到所有租户节点。
                   </span>
                 </div>
               }
               trailing={
                 <>
                   {saved && (
                     <span className="flex items-center font-mono text-[10px] font-black uppercase tracking-widest text-[var(--success)] animate-pulse">
                       <ShieldCheck size={14} className="mr-1" /> 配置已保存
                     </span>
                   )}
                   <PlatformButton
                     type="button"
                     onClick={save}
                     disabled={saving}
                     className="ov-button px-10 py-3 whitespace-nowrap"
                   >
                     <Save size={18} className="mr-2" />
                     {saving ? "保存中..." : "保存配置"}
                   </PlatformButton>
                 </>
               }
             />
          </PlatformPanel>
          
        </div>
      )}
    </div>
  );
}
