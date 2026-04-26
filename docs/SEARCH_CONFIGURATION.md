# 检索配置指南

OpenViking Admin 实现了二阶段语义检索系统。本文档详细说明各检索参数的含义、调优建议和配置方法。

![基于 MCP 与 Rerank 的高精准检索流](<./images/基于 MCP 与 Rerank 的高精准检索流.png>)

检索链路会先根据身份与 ACL 收敛可访问范围，再执行向量召回，并在需要时接入 Rerank 做二阶段排序。

---

## 检索架构

```
用户查询
    ↓
ACL 前置过滤 (基于知识节点 ACL 获取可访问 URI)
    ↓
Stage 1: 向量召回 (OpenViking /api/v1/search/find)
    ↓
Stage 2: BGE-Rerank 重排序 (可选)
    ↓
返回 Top K 结果 + 记录搜索日志
```

---

## Stage 1: 向量召回

### 参数说明

| 参数 | 类型 | 默认值 | 范围 | 说明 |
|------|------|--------|------|------|
| `query` | string | — | — | 用户搜索查询文本 |
| `topK` | number | `10` | 1-100 | 返回结果数量 |
| `scoreThreshold` | number | `0.5` | 0.0-1.0 | 最低相似度分数阈值 |
| `scope` | string | — | — | 搜索范围 URI 过滤 |

### 调优建议

**topK**:
- 日常使用: `10` (平衡精度和性能)
- 调试/分析: `20-50` (获取更多候选结果供 Rerank 筛选)
- 生产 API: 不建议超过 `50`，会增加 Rerank 延迟

**scoreThreshold**:
- 宽松模式: `0.3` (召回更多结果，但可能包含噪声)
- 默认模式: `0.5` (平衡精度和召回)
- 严格模式: `0.7` (仅返回高置信结果)
- 如果经常"查无结果"，建议降低到 `0.3-0.4`

### 性能指标

| 指标 | 典型值 | 说明 |
|------|--------|------|
| 向量召回延迟 | 50-200ms | 取决于 OV 引擎性能和向量库大小 |
| 结果数量 | 0-20 | 受 scoreThreshold 影响 |

---

## Stage 2: BGE-Rerank 重排序

### 启用/禁用

通过 `system_configs` 表控制：

```sql
-- 启用 Rerank
UPDATE system_configs SET value = 'true' WHERE key = 'rerank_enabled';

-- 禁用 Rerank
UPDATE system_configs SET value = 'false' WHERE key = 'rerank_enabled';
```

### 参数说明

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `rerank_endpoint` | string | — | Rerank 服务地址 (如 `http://rerank:8080/rerank`) |
| `rerank_enabled` | boolean | `false` | 是否启用二阶段重排序 |
| `rerank_timeout_ms` | number | `1500` | Rerank 请求超时时间 (毫秒) |

### Rerank 服务要求

- **模型**: BGE-Rerank (bge-reranker-base 或 bge-reranker-large)
- **接口**: 接受 `{ query, passages: [...] }` 格式请求，返回 `{ scores: [...] }`
- **超时**: 默认 1.5 秒，超时则降级为仅使用 Stage 1 结果

### 调优建议

**何时启用**:
- 对检索精度要求高的场景 (如客服问答、合规审查)
- 向量召回结果数量 > 10 时，Rerank 能有效筛选
- 有可用的 Rerank 服务且延迟可接受

**何时禁用**:
- 对延迟敏感的场景 (Rerank 增加 500-1500ms)
- 向量召回结果已足够精准
- Rerank 服务不可用

### 性能影响

| 场景 | 无 Rerank | 有 Rerank |
|------|-----------|-----------|
| 总延迟 | 50-200ms | 500-1700ms |
| 精度提升 | 基准 | +15-30% (取决于查询复杂度) |
| 超时降级 | — | 自动回退到 Stage 1 |

---

## ACL 前置过滤

检索前会根据用户的角色和知识节点的 ACL 配置，过滤出用户可访问的 URI 列表。

### ACL 结构

```json
{
  "isPublic": true,
  "roles": ["tenant_admin", "tenant_operator"],
  "users": ["user_uuid_1", "user_uuid_2"]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `isPublic` | boolean | 是否对所有租户用户可见 |
| `roles` | string[] | 允许访问的角色列表 |
| `users` | string[] | 允许访问的用户 ID 列表 |

### 过滤逻辑

1. 获取当前用户可访问的所有知识节点
2. 提取这些节点关联的 `viking_uri`
3. 在向量搜索时将这些 URI 作为 scope 过滤条件
4. 确保用户只能检索到自己有权限的知识

---

## 搜索分析

### 检索统计

通过 `GET /api/v1/search/stats-deep` 获取：
- 总检索次数
- 命中率 (有结果的比例)
- 平均延迟
- 平均分数

### 无答案洞察

通过 `GET /api/v1/search/analysis` 获取：
- 零结果查询列表 (长尾请求)
- 高频无答案查询 (需补充知识)
- 用户反馈为 `unhelpful` 的查询

### 反馈机制

对每次检索结果可以提交反馈：

```bash
POST /api/v1/search/logs/:id/feedback
{
  "feedback": "helpful",    // 或 "unhelpful"
  "note": "结果很精准"       // 可选备注
}
```

反馈数据用于分析检索质量和优化 Rerank 策略。

---

## 调试技巧

### 1. 使用 QA 沙盒

在 `/console/qa` 页面可以进行检索调试，查看每次召回的详细信息：
- 每个 Chunk 的 Score
- 所属文档库链路
- 分段序号
- 匹配词元高亮

### 2. 查看检索日志

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:6001/api/v1/search/logs?limit=20"
```

### 3. 测试 Rerank 效果

对比开启和关闭 Rerank 的检索结果差异：
1. 先禁用 Rerank，执行查询，记录结果
2. 启用 Rerank，执行相同查询，对比排序变化
