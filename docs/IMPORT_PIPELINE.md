# 知识导入流水线 (Import Pipeline Guide)

本文档详细说明如何将外部知识源导入到 OpenViking Admin 的知识库中。

---

## 导入流水线架构

```
配置集成凭证 (飞书/钉钉/Git)
    ↓
创建导入任务 (指定来源和目标)
    ↓
TaskWorker 后台轮询 pending 任务
    ↓
策略模式路由到对应 Integrator
    ↓
从来源拉取文档 (解析、清洗、分段)
    ↓
调用 OpenViking 引擎 /api/v1/resources 注入
    ↓
更新任务状态 (done/failed) + 记录节点/向量数量
```

---

## 1. 前置准备

### 1.1 创建知识库

```bash
POST /api/knowledge-bases
{
  "name": "产品文档库",
  "description": "包含所有产品相关文档"
}
```

记录返回的 `id` (即 `kbId`)。

### 1.2 配置集成凭证

根据知识来源类型，创建对应的集成配置：

```bash
POST /api/integrations
{
  "name": "飞书企业文档",
  "type": "feishu",
  "credentials": {
    "appId": "cli_xxxxxxxx",
    "appSecret": "your_app_secret"
  },
  "active": true
}
```

记录返回的 `id` (即 `integrationId`)。

---

## 2. 飞书文档导入

### 集成配置

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `feishu` | 飞书类型 |
| `credentials.appId` | `cli_xxxxxxxx` | 飞书应用 ID |
| `credentials.appSecret` | `secret_xxx` | 飞书应用密钥 |

### 创建导入任务

```bash
POST /api/import-tasks
{
  "integrationId": "integration_uuid",
  "kbId": "knowledge_base_uuid",
  "sourceType": "url",
  "sourceUrl": "https://xxx.feishu.cn/docx/xxxxx",
  "targetUri": "viking://resources/tenants/acme/kb/uuid/docs/product"
}
```

### 注意事项

- 飞书应用需开启「云文档」权限
- 确保应用有目标文档的读取权限
- 当前飞书 Provider 的 `app_access_token` 为 mock 实现，生产环境需完善

---

## 3. 钉钉知识库导入

### 集成配置

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `dingtalk` | 钉钉类型 |
| `credentials.appId` | `ding_app_key` | 钉钉应用 Key |
| `credentials.appSecret` | `ding_app_secret` | 钉钉应用密钥 |

### 创建导入任务

```bash
POST /api/import-tasks
{
  "integrationId": "integration_uuid",
  "kbId": "knowledge_base_uuid",
  "sourceType": "url",
  "sourceUrl": "https://alidocs.dingtalk.com/i/nodes/xxxxx",
  "targetUri": "viking://resources/tenants/acme/kb/uuid/docs/product"
}
```

---

## 4. Git 仓库导入

### 集成配置

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `github` 或 `gitlab` | Git 平台类型 |
| `credentials.token` | `ghp_xxx` 或 `glpat-xxx` | Personal Access Token |
| `config.branch` | `main` | 目标分支 |
| `config.path` | `/docs` | 文档目录 (可选) |

### 创建导入任务

```bash
POST /api/import-tasks
{
  "integrationId": "integration_uuid",
  "kbId": "knowledge_base_uuid",
  "sourceType": "git",
  "sourceUrl": "https://github.com/org/repo",
  "targetUri": "viking://resources/tenants/acme/kb/uuid/docs/code"
}
```

### 支持的文件格式

- Markdown (`.md`, `.mdx`)
- 纯文本 (`.txt`)
- 代码文件 (`.py`, `.js`, `.ts`, `.go`, `.java` 等)

### 处理流程

1. 克隆仓库到临时目录
2. 扫描目标路径下的支持文件
3. 解析文件内容，按文件分段
4. 调用 OV 引擎注入文档
5. 清理临时目录

---

## 5. 任务状态监控

### 查看任务列表

```bash
GET /api/import-tasks
```

### 查看任务详情

```bash
GET /api/import-tasks/:id
```

**响应示例**:
```json
{
  "id": "task_uuid",
  "status": "done",
  "sourceType": "git",
  "sourceUrl": "https://github.com/org/repo",
  "nodeCount": 42,
  "vectorCount": 1280,
  "errorMsg": null,
  "createdAt": "2024-01-15T08:30:00.000Z",
  "updatedAt": "2024-01-15T08:35:00.000Z"
}
```

### 同步任务结果

```bash
GET /api/import-tasks/:id/sync
```

手动从 OpenViking 引擎拉取最新状态，更新 `nodeCount` 和 `vectorCount`。

### 状态流转

```
pending → running → done
                  → failed (errorMsg 记录原因)
```

---

## 6. 后台 Worker

`TaskWorkerService` 在 `ImportTaskModule` 初始化时自动启动：

- **轮询间隔**: 定时检查 `pending` 状态的任务
- **并发处理**: 同时处理多个任务
- **错误处理**: 任务失败时记录 `errorMsg`，状态设为 `failed`
- **模块销毁时**: Worker 停止

---

## 7. 配额管理

创建知识库时会校验租户配额：

| 配额字段 | 说明 |
|----------|------|
| `maxDocs` | 最大文档数量 |
| `maxVectors` | 最大向量数量 |

如果超出配额，创建操作会被拒绝。租户配额在创建/更新租户时设置。

---

## 8. 故障排查

| 问题 | 可能原因 | 解决 |
|------|----------|------|
| 任务一直处于 pending | TaskWorker 未启动 | 检查后端日志，确认 Worker 运行状态 |
| 任务失败: OV connection failed | OpenViking 引擎不可达 | 检查 `OV_BASE_URL` 和 `OV_API_KEY` |
| 任务失败: invalid credentials | 集成凭证错误 | 检查 appId/appSecret/token 是否正确 |
| 导入后节点数为 0 | 来源无有效文档 | 确认来源路径下有支持格式的文件 |