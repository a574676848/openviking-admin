'use client';

import { apiClient } from "@/lib/apiClient";
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConsoleSelect } from "@/components/console/primitives";

interface KnowledgeBase { id: string; name: string; vikingUri: string; tenantId: string; }
interface ReindexResult { taskCount?: number; }

export default function ReindexPage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [customUri, setCustomUri] = useState('');
  const [selectedUri, setSelectedUri] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    apiClient.get("/knowledge-bases")
      .then(data => {
        setKbs(Array.isArray(data) ? data : []);
        setRunning(false);
      });
  }, []);

  const uri = selectedUri || customUri;

  const handleReindex = async () => {
    if (!uri.trim()) return;
    setRunning(true); 
    setResult(null);
    try {
      const data = await apiClient.post<ReindexResult>("/system/reindex", { uri: uri.trim(), force: true });
      toast.success(`索引重建指令已下发：${data.taskCount || 0} 个节点进入队列`);
      setResult({ ok: true, message: `重索引任务已提交，OpenViking 将在后台处理 (${data.taskCount || 0} 个节点)` });
    } catch (e: unknown) {
      setResult({ ok: false, message: e instanceof Error ? e.message : '重索引失败' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '760px' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <a href="/documents" style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textDecoration: 'none' }}>文档中心</a>
          <span style={{ color: 'var(--border)' }}>/</span>
          <span style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>重索引</span>
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>重索引管理</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>手动触发 OpenViking 对指定 URI 重新建立向量索引</p>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.75rem', marginBottom: '1.25rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1.25rem' }}>选择目标 URI</h3>

        {/* 从知识库选 */}
        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
          从已有知识库选择
        </label>
        <ConsoleSelect
          value={selectedUri}
          onChange={e => { setSelectedUri(e.target.value); setCustomUri(''); }}
          className="mb-5"
        >
          <option value="">— 请选择知识库 —</option>
          {kbs.map(kb => (
            <option key={kb.id} value={kb.vikingUri}>
              {kb.name}（{kb.vikingUri}）
            </option>
          ))}
        </ConsoleSelect>

        {/* 或手动输入 */}
        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
          或手动输入 URI
        </label>
        <input
          placeholder="viking://resources/your-kb/..."
          value={customUri}
          onChange={e => { setCustomUri(e.target.value); setSelectedUri(''); }}
          style={{
            width: '100%', padding: '0.6rem 0.75rem', marginBottom: '1.5rem',
            background: 'var(--bg-input)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.875rem',
            boxSizing: 'border-box', fontFamily: 'var(--font-stack-sans)',
          }}
        />

        {/* 当前选中 */}
        {uri && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontFamily: 'var(--font-stack-sans)', fontSize: '0.85rem', color: 'var(--brand)' }}>
            目标：{uri}
          </div>
        )}

        <button
          onClick={handleReindex}
          disabled={!uri.trim() || running}
          style={{
            background: running ? 'var(--bg-elevated)' : 'var(--brand)',
            color: running ? 'var(--text-muted)' : '#fff',
            border: 'none', borderRadius: '8px', padding: '0.65rem 1.5rem',
            cursor: uri && !running ? 'pointer' : 'not-allowed',
            fontSize: '0.875rem', fontWeight: 600,
            opacity: !uri || running ? 0.7 : 1,
          }}
        >
          {running ? '提交中…' : '🔄 触发重索引'}
        </button>
      </div>

      {/* 结果 */}
      {result && (
        <div style={{
          padding: '1rem 1.25rem', borderRadius: '10px',
          background: result.ok ? '#52c41a22' : '#ff4d4f22',
          border: `1px solid ${result.ok ? 'var(--success)' : 'var(--danger)'}`,
          color: result.ok ? 'var(--success)' : 'var(--danger)',
          fontSize: '0.875rem',
        }}>
          {result.ok ? '✓ ' : '✗ '}{result.message}
        </div>
      )}

      {/* 说明 */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1.25rem', marginTop: '1.25rem' }}>
        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>使用说明</h4>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <div>• 重索引会对指定 URI 下的所有文档重新生成向量嵌入，耗时视文档数量而定</div>
          <div>• 适用场景：更换 Embedding 模型后、文档大量更新后、向量索引损坏时</div>
          <div>• 重索引期间该知识库仍可查询（使用旧索引），完成后自动切换</div>
          <div>• 处理进度可在「<a href="/system" style={{ color: 'var(--brand)' }}>系统监控</a>」的队列状态中查看</div>
        </div>
      </div>
    </div>
  );
}
