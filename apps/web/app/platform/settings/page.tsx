"use client";
import { apiClient } from "@/lib/apiClient";
import { useEffect, useState } from "react";
import { Settings2, Save, AlertTriangle, ShieldCheck, TerminalSquare, Globe } from "lucide-react";

interface ConfigRow { key: string; value: string; description: string; updatedAt: string; }

const LABELS: Record<string, string> = {
  'search.top_k': 'DEFAULT_TOP_K',
  'search.score_threshold': 'SCORE_THRESHOLD',
  'search.rerank_enabled': 'RERANK_ENABLED',
  'search.grep_context_lines': 'GREP_CONTEXT_LINES',
  'ov.base_url': 'CORE_ENGINE_URL',
  'ov.api_key': 'X_API_KEY_SECRET',
  'ov.account': 'ENGINE_ACCOUNT_ID',
  'rerank.endpoint': 'RERANK_API_ENDPOINT',
  'rerank.model': 'RERANK_MODEL_NAME',
};

export default function SettingsPage() {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);



  useEffect(() => {
    (async () => {
      try {
        const d: ConfigRow[] = await apiClient.get("/settings");
        setConfigs(d);
        const map: Record<string, string> = {};
        d.forEach(c => { map[c.key] = c.value; });
        setValues(map);
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
    <div className="w-full max-w-6xl flex flex-col pb-10 min-h-full theme-swiss">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-end border-b-[var(--border-width)] border-[var(--border)] pb-6 mb-8">
        <div>
           <h1 className="text-4xl md:text-5xl font-black font-sans tracking-tighter uppercase mb-2 text-[var(--text-primary)] flex items-center">
             <Settings2 size={40} strokeWidth={2} className="mr-4 text-[var(--text-primary)]" />
             全局参数配置_
           </h1>
           <p className="font-bold font-mono tracking-widest text-[var(--text-secondary)] uppercase text-xs">
             {"// GLOBAL SEARCH AND RAG INFERENCE CONFIGURATION"}
           </p>
        </div>
      </div>

      {loading ? (
        <div className="border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-12 flex flex-col items-center justify-center shadow-[var(--shadow-base)]">
           <div className="w-12 h-12 border-4 border-[var(--border)] border-t-[var(--brand)] rounded-full animate-spin mb-4"></div>
           <div className="font-mono font-bold tracking-widest animate-pulse text-[var(--text-secondary)] uppercase">FETCHING_CONFIG...</div>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          
          {/* Section 1: Search Logic */}
          <div className="bg-[var(--bg-card)] border-[var(--border-width)] border-[var(--border)] p-6 md:p-10 relative shadow-[var(--shadow-base)]">
             <h3 className="font-sans font-black text-2xl uppercase tracking-tighter mb-8 flex items-center text-[var(--text-primary)]">
                <TerminalSquare size={24} strokeWidth={2} className="mr-3 text-[var(--brand)]" />
                检索与推理逻辑 (SEARCH_LOGIC)
             </h3>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)]">
               {searchConfigs.map((c) => (
                 <div key={c.key} className="bg-[var(--bg-card)] p-6 flex flex-col justify-between group">
                   <div>
                     <div className="font-mono text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-2 flex items-center">
                        <span className="w-1.5 h-1.5 bg-[var(--brand)] mr-2 shrink-0" />
                        {LABELS[c.key] ?? c.key}
                     </div>
                     <div className="font-mono text-[9px] text-[var(--text-secondary)] tracking-widest mb-4 uppercase leading-relaxed">
                       {"// "}{c.description}
                     </div>
                   </div>
                   <div className="w-full">
                      {c.key === 'search.rerank_enabled' ? (
                        <select
                          value={values[c.key] ?? 'false'}
                          onChange={e => setValues(v => ({ ...v, [c.key]: e.target.value }))}
                          className="ov-input px-4 py-2 font-mono text-xs tracking-widest uppercase font-bold text-center w-full bg-[var(--bg-elevated)]"
                        >
                          <option value="true">ENABLE</option>
                          <option value="false">DISABLE</option>
                        </select>
                      ) : (
                        <input
                          type="number"
                          step={c.key === 'search.score_threshold' ? '0.05' : '1'}
                          value={values[c.key] ?? ''}
                          onChange={e => setValues(v => ({ ...v, [c.key]: e.target.value }))}
                          className="ov-input px-4 py-2 font-mono text-sm tracking-widest font-black text-center w-full bg-[var(--bg-elevated)]"
                        />
                      )}
                   </div>
                 </div>
               ))}
             </div>
          </div>

          {/* Section 2: Infrastructure Connection */}
          <div className="bg-[var(--bg-card)] border-[var(--border-width)] border-[var(--border)] p-6 md:p-10 relative shadow-[var(--shadow-base)]">
             <h3 className="font-sans font-black text-2xl uppercase tracking-tighter mb-8 flex items-center text-[var(--text-primary)]">
                <Globe size={24} strokeWidth={2} className="mr-3 text-[var(--info)]" />
                引擎基础连接 (CORE_INFRASTRUCTURE)
             </h3>

             <div className="space-y-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)]">
               {infraConfigs.map((c) => (
                 <div key={c.key} className="bg-[var(--bg-card)] p-6 flex flex-col md:flex-row gap-6 justify-between items-center group">
                   <div className="flex-1">
                     <div className="font-mono text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-1 flex items-center">
                        <span className="w-1.5 h-1.5 bg-[var(--info)] mr-2 shrink-0" />
                        {LABELS[c.key] ?? c.key}
                     </div>
                     <div className="font-mono text-[9px] text-[var(--text-secondary)] tracking-widest uppercase">
                       {"// "}{c.description}
                     </div>
                   </div>
                   <div className="w-full md:w-2/3">
                      <input
                        type={c.key === 'ov.api_key' ? 'password' : 'text'}
                        value={values[c.key] ?? ''}
                        onChange={e => setValues(v => ({ ...v, [c.key]: e.target.value }))}
                        className="ov-input px-4 py-3 font-mono text-xs tracking-widest bg-[var(--bg-elevated)]"
                        placeholder="REQUIRED_CONFIG"
                      />
                   </div>
                 </div>
               ))}
             </div>
          </div>

          {/* Global Footer Save Bar */}
          <div className="sticky bottom-8 bg-[var(--bg-card)] border-[var(--border-width)] border-[var(--border)] p-6 flex items-center justify-between shadow-[var(--shadow-base)] z-30">
             <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-[var(--warning)]" />
                <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
                   CAUTION: CHANGES TAKE EFFECT IMMEDIATELY ACROSS ALL TENANT NODES.
                </span>
             </div>
             <div className="flex gap-4 items-center">
               {saved && (
                 <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--success)] flex items-center animate-pulse">
                   <ShieldCheck size={14} className="mr-1" /> CONFIG_SAVED_SUCCESSFULLY
                 </span>
               )}
               <button
                 onClick={save}
                 disabled={saving}
                 className="ov-button px-10 py-3 font-black tracking-[0.2em] whitespace-nowrap disabled:opacity-50 flex items-center"
               >
                 <Save size={18} className="mr-2" />
                 {saving ? "SAVING..." : "COMMIT_CHANGES"}
               </button>
             </div>
          </div>
          
        </div>
      )}
    </div>
  );
}
