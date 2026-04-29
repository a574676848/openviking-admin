# 知识导入流水线

本文档详细说明如何将外部知识源导入到 OpenViking Admin 的知识库中。

![企业数字资产自动化加工流水线](<./images/企业数字资产自动化加工流水线.png>)

导入流水线负责把飞书、钉钉、Git 仓库、本地文件、URL 和 manifest 清单等来源转化为 OpenViking 可索引、可检索、可权限控制的知识资产。WebDAV 只用于外部客户端访问知识资源，不作为文档导入来源。

---

## 导入流水线架构

```
配置集成凭证或上传本地文件
    ↓
创建导入任务 (指定来源和目标)
    ↓
TaskWorker 后台轮询 pending 任务
    ↓
策略模式路由到对应 Integrator
    ↓
从来源拉取文档 (解析、清洗、分段)
    ↓
调用 OpenViking 引擎注入资源
    ↓
更新任务状态 (done/failed) + 记录节点/向量数量
```

---

## 1. 前置准备

### 1.1 选择知识库与知识树节点

文档导入需要先确定目标知识库，必要时再选择知识树节点作为挂载位置。HTTP、CLI、MCP 和 Skill 都通过同一组只读 capability 完成选择：

| Capability | 说明 |
| ---------- | ---- |
| `knowledgeBases.list` | 列出当前租户可导入的知识库 |
| `knowledgeBases.detail` | 查看知识库详情与默认导入根路径 |
| `knowledgeTree.list` | 列出指定知识库下的可导入节点 |
| `knowledgeTree.detail` | 查看知识树节点详情与 `vikingUri` |

CLI 示例：

```bash
ova kb list
ova kb detail --id <kbId>
ova tree list --kb <kbId>
ova tree detail --id <nodeId>
```

创建任务时，Admin 侧知识库和知识树仍保存租户内逻辑 URI（`viking://resources/{tenantId}/...`）；实际注入 OpenViking 时会转换为引擎租户命名空间（`viking://resources/tenants/{tenantId}/...`）。

### 1.2 创建知识库

```bash
POST /api/v1/knowledge-bases
{
  "name": "产品文档库",
  "description": "包含所有产品相关文档"
}
```

记录返回的 `id` (即 `kbId`)。

### 1.3 配置集成凭证

根据知识来源类型，创建对应的集成配置：

```bash
POST /api/v1/integrations
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
POST /api/v1/import-tasks
{
  "integrationId": "integration_uuid",
  "kbId": "knowledge_base_uuid",
  "sourceType": "feishu",
  "sourceUrl": "https://xxx.feishu.cn/docx/xxxxx"
}
```

### 注意事项

- 飞书应用需开启「云文档」权限
- 确保应用有目标文档的读取权限
- Worker 会先读取飞书文档标题和 `raw_content`，再通过 OpenViking `temp_upload` 注入，不向资源接口透传飞书 Token。平台文档使用 `wait=false`，避免 OpenViking 后台语义化队列较慢时把已接收的任务误判为失败。

---

## 3. 钉钉知识库导入

### 集成配置

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `dingtalk` | 钉钉类型 |
| `credentials.appId` | `ding_app_key` | 钉钉应用 Key |
| `credentials.appSecret` | `ding_app_secret` | 钉钉应用密钥 |
| `credentials.operatorId` | `union_id` | 有目标文档权限的钉钉用户 unionId |

### 创建导入任务

```bash
POST /api/v1/import-tasks
{
  "integrationId": "integration_uuid",
  "kbId": "knowledge_base_uuid",
  "sourceType": "dingtalk",
  "sourceUrl": "https://alidocs.dingtalk.com/i/nodes/xxxxx"
}
```

Worker 会先通过钉钉应用 Token 调用 `queryByUrl` 解析文档链接，再按 `operatorId` 读取文档块，生成 Markdown 临时文件后注入 OpenViking；OpenViking 资源接口只接收 `path` 或 `temp_file_id`，平台 Token 和自定义 `config` 不会透传给引擎。平台文档注入后可通过任务结果同步接口回查最终节点和向量统计。

---

## 4. 网页 URL 导入

网页提取使用 OpenViking 原生 URL 抓取能力，Worker 直接向 `/api/v1/resources` 传入 `path`、`to` 和 `wait`，不需要先在 Admin 侧下载网页再 `temp_upload`。

---

## 5. Git 仓库导入

### 集成配置

| 字段 | 值 | 说明 |
|------|-----|------|
| `type` | `github` 或 `gitlab` | Git 平台类型 |
| `credentials.token` | `ghp_xxx` 或 `glpat-xxx` | Personal Access Token |
| `credentials.username` | `admin` | 自托管 Git 服务的账号名，可选 |
| `config.branch` | `main` | 目标分支 |
| `config.path` | `/docs` | 文档目录 (可选) |

自托管 Git 服务如果选择 `github` 类型，Worker 会先使用标准 token URL，再按同一 host 追加 GitLab 兼容的 `oauth2:token`、`username:token`、`token` fallback，以覆盖私有 Git 服务的 HTTP 跳转和账号名校验差异。

### 创建导入任务

```bash
POST /api/v1/import-tasks
{
  "integrationId": "integration_uuid",
  "kbId": "knowledge_base_uuid",
  "sourceType": "git",
  "sourceUrl": "https://github.com/org/repo"
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

### 目标路径规则

- 控制台创建导入任务时不再要求手工填写 `targetUri`
- 服务端会基于知识库的 `vikingUri` 自动派生目标路径
- 当前默认规则为 `viking://resources/{tenantId}/{kbId}/imports/{sourceType}/`
- 如果知识库下已有知识树节点，控制台会额外提供“导入目标节点”选择；选中节点后会直接使用该节点的 `vikingUri` 作为导入目标
- 服务端会严格校验显式 `targetUri`：只允许当前知识库根目录或当前知识库下已有节点的 `vikingUri`，禁止写入其他租户的 OV 路径

---

## 6. 本地文件导入

本地导入通过 Admin 服务接收 `multipart/form-data`，将文件写入受控上传目录，再创建 `sourceType=local` 的导入任务。后台 Worker 会读取受控上传文件，先调用 OpenViking `/api/v1/resources/temp_upload` 获取 `temp_file_id`，再调用 `/api/v1/resources` 注入资源。

### 环境配置

```env
LOCAL_IMPORT_UPLOAD_DIR=/data/openviking/import-uploads
LOCAL_IMPORT_KEEP_FILES_AFTER_DONE=false
```

- `LOCAL_IMPORT_UPLOAD_DIR` 是 Admin 服务的上传暂存目录；生产环境必须显式配置。
- 上传接口生成的临时文件会写入 `LOCAL_IMPORT_UPLOAD_DIR/managed`，Worker 只读取该受控子目录下的文件。
- 本地文件统一转成 OpenViking `temp_file_id` 后再注入，不向 OpenViking 传递 `file://` 路径。
- 默认导入成功后会删除暂存文件；失败任务会保留文件，便于排查和重试。

### 创建导入任务

```bash
curl -X POST "$ADMIN_BASE_URL/api/v1/import-tasks/local-upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "kbId=knowledge_base_uuid" \
  -F "files=@./产品手册.md"
```

支持格式：

- PDF (`.pdf`)
- Markdown (`.md`, `.markdown`)
- Word (`.doc`, `.docx`)
- 纯文本 (`.txt`)
- ZIP (`.zip`，用于调用端先把本地目录打包后上传)

限制：

- 单次最多 10 个文件
- 单文件最大 25 MB
- `sourceType=local` 只能由上传接口生成，普通 `POST /api/v1/import-tasks` 不接受任意本地路径
- 裸 HTTP 如需导入本地目录，应先在调用端打成 `.zip`，再作为文件上传

### 通过 capability 或 CLI 创建文档导入

```bash
POST /api/v1/import-tasks/documents
{
  "sourceType": "url",
  "knowledgeBaseId": "knowledge_base_uuid",
  "parentNodeId": "knowledge_node_uuid",
  "sourceUrl": "https://example.com/product.pdf"
}
```

CLI 等价命令：

```bash
ova documents import "https://example.com/product.pdf" --kb <kbId> --parent <nodeId> --type url
```

Capability 与 CLI 导入入口面向不依赖平台集成凭证的来源，`sourceType` 支持 `local`、`url`、`manifest`。其中 `manifest` 用于批量导入清单，`local` 只通过 `/api/v1/import-tasks/local-upload` 的文件上传入口进入系统。飞书、钉钉、Git 等需要集成凭证的来源走导入任务 API 或控制台集成流程，并提供 `integrationId`。

---

## 7. 任务状态监控

### 查看任务列表

```bash
GET /api/v1/import-tasks
```

### 查看任务详情

```bash
GET /api/v1/import-tasks/:id
```

CLI：

```bash
ova documents import status --task <taskId>
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

### 查看进度事件

```bash
GET /api/v1/import-tasks/:id/events
```

响应中的 `events` 当前提供任务进度快照，便于 CLI、MCP 和 Skill 统一展示导入状态。

### 同步任务结果

```bash
GET /api/v1/import-tasks/:id/sync
```

手动从 OpenViking 引擎拉取最新状态，更新 `nodeCount` 和 `vectorCount`。`nodeCount` 会合并目标目录的直接子节点数与递归子节点数，`vectorCount` 来自向量统计接口。

### 状态流转

```
pending → running → done
                  → failed (errorMsg 记录原因)
```

---

## 8. 后台 Worker

`TaskWorkerService` 在 `ImportTaskModule` 初始化时自动启动：

- **轮询间隔**: 定时检查 `pending` 状态的任务
- **并发处理**: 同时处理多个任务
- **租户路由**: Worker 会按活跃租户逐个扫描任务；`SMALL` 读取公共库，`MEDIUM` 设置租户 schema，`LARGE` 连接独立库
- **集成凭证**: 处理飞书、钉钉、Git 等任务时，从任务所属租户的数据域读取并解密集成凭证
- **本地文件清理**: `sourceType=local` 的任务成功后默认删除暂存文件；失败任务保留原文件以支持重试
- **错误处理**: 任务失败时记录 `errorMsg`，状态设为 `failed`
- **模块销毁时**: Worker 停止

---

## 9. 配额管理

创建知识库时会校验租户配额：

| 配额字段 | 说明 |
|----------|------|
| `maxDocs` | 最大文档数量 |
| `maxVectors` | 最大向量数量 |

如果超出配额，创建操作会被拒绝。租户配额在创建/更新租户时设置。

---

## 10. 故障排查

| 问题 | 可能原因 | 解决 |
|------|----------|------|
| 任务一直处于 pending | TaskWorker 未启动 | 检查后端日志，确认 Worker 运行状态 |
| 任务失败: OV connection failed | OpenViking 引擎不可达 | 检查 `OV_BASE_URL` 和 `OV_API_KEY` |
| 任务失败: invalid credentials | 集成凭证错误 | 检查 appId/appSecret/token 是否正确 |
| 导入后节点数为 0 | 来源无有效文档 | 确认来源路径下有支持格式的文件 |
| 本地导入失败: 文件不可访问 | Admin 暂存文件已被清理或不在受控上传目录 | 重新上传文件，并确认 `LOCAL_IMPORT_UPLOAD_DIR` 可写 |
