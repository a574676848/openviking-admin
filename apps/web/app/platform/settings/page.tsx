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

interface ConfigField {
  key: string;
  label: string;
  description: string;
  defaultValue?: string;
}

interface TestConnectionResponse {
  ok: true;
  type: "engine" | "rerank";
  message: string;
  target: string;
}

interface TestStatus {
  tone: "success" | "danger";
  message: string;
}

const LABELS: Record<string, string> = {
  'search.top_k': '默认召回数 Top K',
  'search.score_threshold': '命中阈值',
  'search.rerank_enabled': 'Rerank 开关',
  'search.grep_context_lines': 'Grep 上下文行数',
  'ov.base_url': '核心引擎地址',
  'ov.api_key': 'X-API-Key 密钥',
  'ov.account': '引擎账号 ID',
  'rerank.endpoint': 'Rerank 接口地址',
  'rerank.api_key': 'Rerank Bearer Token',
  'rerank.model': 'Rerank 模型名',
};

/** DEFAULT_OV_CONFIG JSON 中的字段名 → 旧版分散配置键的映射 */
const OV_CONFIG_FIELD_MAP: Record<string, string> = {
  baseUrl: 'ov.base_url',
  apiKey: 'ov.api_key',
  account: 'ov.account',
  rerankEndpoint: 'rerank.endpoint',
  rerankApiKey: 'rerank.api_key',
  rerankModel: 'rerank.model',
};

const SEARCH_FIELDS: ConfigField[] = [
  {
    key: 'search.grep_context_lines',
    label: 'Grep 上下文行数',
    description: 'Grep 前后上下文行数',
    defaultValue: '2',
  },
  {
    key: 'search.rerank_enabled',
    label: 'Rerank 开关',
    description: '是否启用重排序',
    defaultValue: 'false',
  },
  {
    key: 'search.score_threshold',
    label: '命中阈值',
    description: '语义相似度阈值（0~1）',
    defaultValue: '0.5',
  },
  {
    key: 'search.top_k',
    label: '默认召回数 Top K',
    description: '默认返回结果数量',
    defaultValue: '5',
  },
];

const ENGINE_FIELDS: ConfigField[] = [
  {
    key: 'ov.base_url',
    label: '核心引擎地址',
    description: 'OpenViking 引擎基础地址',
  },
  {
    key: 'ov.api_key',
    label: 'X-API-Key 密钥',
    description: 'OpenViking 访问令牌（X-API-KEY）',
  },
  {
    key: 'ov.account',
    label: '引擎账号 ID',
    description: '默认 OpenViking 业务账号',
    defaultValue: 'default',
  },
];

const RERANK_FIELDS: ConfigField[] = [
  {
    key: 'rerank.endpoint',
    label: 'Rerank 接口地址',
    description: '推荐填写完整地址，例如 http://host:port/v1/rerank',
  },
  {
    key: 'rerank.api_key',
    label: 'Rerank Bearer Token',
    description: 'OpenAI 兼容 Rerank 访问令牌',
  },
  {
    key: 'rerank.model',
    label: 'Rerank 模型名',
    description: '重排序模型名称',
    defaultValue: 'bge-reranker-v2-m3',
  },
];

const TEST_STATUS_CLASS: Record<TestStatus["tone"], string> = {
  success: "text-[var(--success)]",
  danger: "text-[var(--danger)]",
};

export default function SettingsPage() {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testingTarget, setTestingTarget] = useState<"engine" | "rerank" | null>(null);
  const [testStatus, setTestStatus] = useState<Record<"engine" | "rerank", TestStatus | null>>({
    engine: null,
    rerank: null,
  });

  useEffect(() => {
    (async () => {
      setLoadError("");
      try {
        const d: ConfigRow[] = await apiClient.get("/settings");
        setConfigs(d);
        const map: Record<string, string> = {};
        d.forEach(c => {
          if (c.key === 'DEFAULT_OV_CONFIG' && c.value) {
            // 将 DEFAULT_OV_CONFIG JSON 展开为独立字段，方便逐个编辑
            try {
              const parsed = JSON.parse(c.value);
              for (const [jsonField, configKey] of Object.entries(OV_CONFIG_FIELD_MAP)) {
                if (parsed[jsonField] !== undefined && parsed[jsonField] !== null && parsed[jsonField] !== '') {
                  map[configKey] = String(parsed[jsonField]);
                }
              }
            } catch {
              // JSON 解析失败则忽略，后续由旧版分散键兜底
            }
          } else {
            map[c.key] = c.value;
          }
        });
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
      const payload = { ...values };

      // 将独立字段重新序列化为 DEFAULT_OV_CONFIG JSON
      const ovConfig: Record<string, string> = {};
      for (const [jsonField, configKey] of Object.entries(OV_CONFIG_FIELD_MAP)) {
        const v = payload[configKey]?.trim();
        if (v) ovConfig[jsonField] = v;
      }
      if (Object.keys(ovConfig).length > 0) {
        payload['DEFAULT_OV_CONFIG'] = JSON.stringify(ovConfig);
      }

      await apiClient.patch('/settings', payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (type: "engine" | "rerank") => {
    setTestingTarget(type);
    setTestStatus((current) => ({ ...current, [type]: null }));

    try {
      const response = await apiClient.post<TestConnectionResponse>(
        "/settings/test-connection",
        type === "engine"
          ? {
              type,
              baseUrl: values["ov.base_url"] ?? "",
              apiKey: values["ov.api_key"] ?? "",
              account: values["ov.account"] ?? "",
            }
          : {
              type,
              endpoint: values["rerank.endpoint"] ?? "",
              apiKey: values["rerank.api_key"] ?? "",
              model: values["rerank.model"] ?? "",
            },
      );

      setTestStatus((current) => ({
        ...current,
        [type]: {
          tone: "success",
          message: `${response.message}：${response.target}`,
        },
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "连接测试失败";
      setTestStatus((current) => ({
        ...current,
        [type]: {
          tone: "danger",
          message,
        },
      }));
    } finally {
      setTestingTarget(null);
    }
  };

  const configMap = new Map(configs.map((config) => [config.key, config]));
  const rerankEnabled = (values['search.rerank_enabled'] ?? 'false') === 'true';

  const resolveField = (field: ConfigField): ConfigField => {
    const config = configMap.get(field.key);
    return {
      ...field,
      label: LABELS[field.key] ?? field.label,
      description: config?.description || field.description,
    };
  };

  const searchConfigs = SEARCH_FIELDS.map(resolveField);
  const engineConfigs = ENGINE_FIELDS.map(resolveField);
  const rerankConfigs = RERANK_FIELDS.map(resolveField);

  return (
    <div className="w-full max-w-6xl flex flex-col pb-10 min-h-full">
      <PlatformPageHeader
        title={
          <h1 className="mb-2 flex items-center text-4xl font-bold tracking-tighter text-[var(--text-primary)] md:text-5xl">
            <Settings2 size={40} strokeWidth={2} className="mr-4 text-[var(--text-primary)]" />
            全局参数配置_
          </h1>
        }
        subtitle={"// 全局检索与 RAG 推理配置"}
      />

      {loading ? (
        <PlatformPanel className="flex flex-col items-center justify-center p-12">
           <div className="w-12 h-12 border-4 border-[var(--border)] border-t-[var(--brand)] rounded-full animate-spin mb-4"></div>
           <div className="font-sans font-bold tracking-widest animate-pulse text-[var(--text-secondary)] uppercase">正在同步配置...</div>
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
                   label={c.label}
                   description={c.description}
                   accent="brand"
                   control={
                     c.key === 'search.rerank_enabled' ? (
                       <PlatformSelect
                         value={values[c.key] ?? c.defaultValue ?? 'false'}
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
                          value={values[c.key] ?? c.defaultValue ?? ''}
                          onChange={e => setValues(v => ({ ...v, [c.key]: e.target.value }))}
                          className="w-full bg-[var(--bg-elevated)] px-4 py-2 text-center text-sm font-bold tracking-widest"
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

             <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
               <p className="text-xs font-medium text-[var(--text-muted)]">
                 保存前可先校验核心引擎地址与鉴权配置是否可达。
               </p>
               <PlatformButton
                 type="button"
                 tone="default"
                 onClick={() => testConnection("engine")}
                 disabled={testingTarget !== null}
                 className="self-start whitespace-nowrap px-5 py-2 text-[11px] tracking-wider"
               >
                 {testingTarget === "engine" ? "测试中..." : "测试链接"}
               </PlatformButton>
             </div>

             {testStatus.engine ? (
               <div className={`mb-6 text-xs font-bold ${TEST_STATUS_CLASS[testStatus.engine.tone]}`}>
                 {testStatus.engine.message}
               </div>
             ) : null}

             <div className="space-y-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)]">
               {engineConfigs.map((c) => (
                 <PlatformControlCard
                   key={c.key}
                   label={c.label}
                   description={c.description}
                   accent="info"
                   layout="inline"
                   control={
                     <PlatformInput
                       type={c.key === 'ov.api_key' ? 'password' : 'text'}
                       value={values[c.key] ?? c.defaultValue ?? ''}
                       onChange={e => setValues(v => ({ ...v, [c.key]: e.target.value }))}
                       className="bg-[var(--bg-elevated)] px-4 py-3 text-xs tracking-widest"
                       placeholder="必填配置项"
                     />
                   }
                 />
               ))}
              </div>
           </PlatformPanel>

          {rerankEnabled ? (
            <PlatformPanel className="relative p-6 md:p-10">
               <PlatformSectionTitle
                 title="Rerank 配置"
                 icon={<ShieldCheck size={24} strokeWidth={2} className="text-[var(--warning)]" />}
                 subtitle="// 仅在启用重排序后生效"
               />

               <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                 <p className="text-xs font-medium text-[var(--text-muted)]">
                   使用当前填写的 endpoint、token 和 model 发起一次最小重排探测。
                 </p>
                 <PlatformButton
                   type="button"
                   tone="default"
                   onClick={() => testConnection("rerank")}
                   disabled={testingTarget !== null}
                   className="self-start whitespace-nowrap px-5 py-2 text-[11px] tracking-wider"
                 >
                   {testingTarget === "rerank" ? "测试中..." : "测试链接"}
                 </PlatformButton>
               </div>

               {testStatus.rerank ? (
                 <div className={`mb-6 text-xs font-bold ${TEST_STATUS_CLASS[testStatus.rerank.tone]}`}>
                   {testStatus.rerank.message}
                 </div>
               ) : null}

               <div className="space-y-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)]">
                 {rerankConfigs.map((c) => (
                   <PlatformControlCard
                     key={c.key}
                     label={c.label}
                     description={c.description}
                     accent="warning"
                     layout="inline"
                     control={
                       <PlatformInput
                         type={c.key === 'rerank.api_key' ? 'password' : 'text'}
                         value={values[c.key] ?? c.defaultValue ?? ''}
                         onChange={e => setValues(v => ({ ...v, [c.key]: e.target.value }))}
                         className="bg-[var(--bg-elevated)] px-4 py-3 text-xs tracking-widest"
                         placeholder="按实际部署填写"
                       />
                     }
                   />
                 ))}
               </div>
            </PlatformPanel>
          ) : null}

          {/* Global Footer Save Bar */}
          <PlatformPanel className="sticky bottom-8 z-30">
             <PlatformUtilityBar
               className="p-6"
               leading={
                 <div className="flex items-center gap-3">
                   <AlertTriangle size={20} className="text-[var(--warning)]" />
                   <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                     注意：保存后会立即作用到所有租户节点。
                   </span>
                 </div>
               }
               trailing={
                 <>
                   {saved && (
                     <span className="flex items-center font-sans text-[10px] font-bold uppercase tracking-widest text-[var(--success)] animate-pulse">
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
