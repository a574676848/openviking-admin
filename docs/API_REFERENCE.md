# API 参考

所有 HTTP 接口统一挂载在 `/api/v1` 前缀下。示例默认服务地址为 `http://localhost:6001/api/v1`。

## 通用约定

### 认证方式

| 方式                                              | 适用接口                   | 说明                       |
| ------------------------------------------------- | -------------------------- | -------------------------- |
| 无认证                                            | 登录、公开探测接口         | 不包含用户身份             |
| `Authorization: Bearer <jwt>`                     | 控制台、管理 API、换证接口 | 用户登录态                 |
| `Authorization: Bearer <capability_access_token>` | Capability HTTP 接口       | 已登录用户换取的能力 token |
| `Authorization: Bearer <session_key>`             | 短会话能力调用             | 适合临时 Agent 会话        |
| `Authorization: Bearer <ov-sk-...>`               | Capability HTTP 接口、MCP  | 兼容 API key 方式          |
| `x-capability-key: <ov-sk-...>`                   | Capability HTTP 接口       | 推荐的 API key header      |

### 请求追踪

所有能力、换证和 MCP 调用都支持 `x-request-id`。服务端会在响应中返回 `traceId`，用于关联服务端日志、审计日志和 OpenViking 下游请求。

### 成功响应

```json
{
  "data": {},
  "meta": {
    "requestId": "client-or-server-generated"
  },
  "traceId": "uuid",
  "error": null
}
```

### 错误响应

```json
{
  "data": null,
  "meta": {
    "requestId": "client-or-server-generated",
    "timestamp": "2026-04-25T13:00:00.000Z",
    "path": "/api/v1/knowledge/search"
  },
  "traceId": "uuid",
  "error": {
    "code": "CAPABILITY_INVALID_INPUT",
    "message": "参数错误",
    "statusCode": 400
  }
}
```

### 角色体系

| 角色              | 权限范围                                 |
| ----------------- | ---------------------------------------- |
| `super_admin`     | 平台全局管理，可切换视角模拟租户管理员   |
| `tenant_admin`    | 租户内管理员，可管理租户用户和配置       |
| `tenant_operator` | 租户操作员，可执行知识库、导入和资源操作 |
| `tenant_viewer`   | 租户只读用户，可查看和检索授权资源       |

## 认证接口

### POST /api/v1/auth/login

本地账号登录。`super_admin` 带 `tenantCode` 登录时会签发租户视角 token，后续控制台请求按该租户的隔离级别路由；不带 `tenantCode` 时保持平台视角。

请求体：

```json
{
  "username": "admin",
  "password": "default@123",
  "tenantCode": "default"
}
```

响应：

```json
{
  "data": {
    "accessToken": "jwt",
    "refreshToken": "jwt",
    "expiresInSeconds": 7200,
    "refreshExpiresInSeconds": 604800,
    "user": {
      "id": "uuid",
      "username": "admin",
      "role": "tenant_admin",
      "tenantId": "uuid",
      "hasCustomOvConfig": true
    }
  },
  "traceId": "uuid",
  "error": null
}
```

### GET /api/v1/auth/sso/redirect/:tenantId/:type

发起企业 SSO 认证重定向。

| 参数       | 位置 | 说明                                   |
| ---------- | ---- | -------------------------------------- |
| `tenantId` | path | 租户 ID                                |
| `type`     | path | `feishu`、`dingtalk`、`oidc` 或 `ldap` |

### GET /api/v1/auth/sso/callback/:tenantId/:type

SSO Provider 回调入口。认证成功后重定向到前端并携带一次性 ticket。

### POST /api/v1/auth/sso/exchange

使用一次性 SSO ticket 换取 `accessToken` 和 `refreshToken`。

```json
{
  "ticket": "sso-ticket"
}
```

### POST /api/v1/auth/refresh

使用 refresh token 刷新登录态。

```json
{
  "refreshToken": "jwt"
}
```

### GET /api/v1/auth/whoami

返回当前用户、租户和角色上下文。

### GET /api/v1/auth/me

返回当前登录用户的会话上下文。租户用户会额外返回 `hasCustomOvConfig`，用于前端判断是否展示依赖租户自定义 OV 引擎的入口。

```json
{
  "data": {
    "id": "uuid",
    "username": "tenant.admin",
    "role": "tenant_admin",
    "tenantId": "uuid",
    "hasCustomOvConfig": true
  },
  "traceId": "uuid",
  "error": null
}
```

### GET /api/v1/auth/credential-options

返回当前用户可用的换证方式、推荐 TTL 和可选有效期列表。需要 JWT。

### POST /api/v1/auth/token/exchange

将 JWT 登录态交换为 capability access token。

请求体：

```json
{
  "ttlSeconds": 3600
}
```

响应：

```json
{
  "data": {
    "credentialType": "capability_access_token",
    "accessToken": "token",
    "expiresInSeconds": 7200
  },
  "meta": {
    "channel": "http",
    "flow": "token.exchange"
  },
  "traceId": "uuid",
  "error": null
}
```

### POST /api/v1/auth/session/exchange

将 JWT 登录态交换为短期 session key，常用于 MCP 或短会话 Agent。

请求体：

```json
{
  "ttlSeconds": 1800
}
```

### POST /api/v1/auth/client-credentials

签发可吊销 API key，适合 CLI、MCP 和自动化任务。

请求体：

```json
{
  "name": "ci-bot",
  "ttlSeconds": 2592000
}
```

响应：

```json
{
  "data": {
    "credentialType": "api_key",
    "apiKey": "ov-sk-...",
    "name": "ci-bot",
    "expiresInSeconds": 2592000,
    "expiresAt": "2026-05-28T00:00:00.000Z"
  },
  "traceId": "uuid",
  "error": null
}
```

### POST /api/v1/auth/switch-role

超管切换租户视角。需要 `super_admin`。

### GET /api/v1/auth/me

返回当前 JWT 用户信息。保留给控制台兼容使用。

## 能力平台接口

### GET /api/v1/capabilities

返回 capability catalog。

响应：

```json
{
  "data": [
    {
      "id": "knowledge.search",
      "version": "v1",
      "description": "在租户知识域内执行语义搜索",
      "minimumRole": "tenant_viewer",
      "http": {
        "method": "POST",
        "path": "/api/v1/knowledge/search"
      },
      "cli": {
        "command": "ova knowledge search"
      }
    }
  ],
  "traceId": "uuid",
  "error": null
}
```

### POST /api/v1/knowledge/search

在租户知识域内执行语义搜索。

请求体：

```json
{
  "query": "多租户隔离",
  "limit": 5,
  "scoreThreshold": 0.5
}
```

响应 `data`：

```json
{
  "items": [
    {
      "uri": "viking://resources/tenants/acme/doc-1",
      "title": "多租户白皮书",
      "abstract": "隔离策略说明",
      "score": 0.91
    }
  ]
}
```

### POST /api/v1/knowledge/grep

在租户知识域内执行文本匹配。

请求体：

```json
{
  "pattern": "tenant",
  "uri": "viking://resources/tenants/acme/",
  "caseInsensitive": true
}
```

### GET /api/v1/resources

列出租户授权范围内的资源。

查询参数：

| 参数  | 必填 | 说明          |
| ----- | ---- | ------------- |
| `uri` | 否   | 资源 URI 前缀 |

### GET /api/v1/resources/tree

返回租户资源树。

查询参数：

| 参数    | 必填 | 说明       |
| ------- | ---- | ---------- |
| `uri`   | 否   | 根资源 URI |
| `depth` | 否   | 树深度     |

响应 `data`：

```json
{
  "items": [],
  "renderedTree": "[DIR] docs\n  [FILE] README.md"
}
```

### 文档导入相关 capability

文档导入能力用于让 HTTP、CLI、MCP 和 Skill 在同一套契约下完成“选择目标知识库/知识树节点、创建导入任务、查看进度”。这些接口仍走 capability 鉴权，响应保持 `{ data, meta, traceId, error }` 信封。

| Capability | Method | Path | 说明 |
| ---------- | ------ | ---- | ---- |
| `knowledgeBases.list` | `GET` | `/api/v1/knowledge-bases` | 列出当前租户可导入的知识库 |
| `knowledgeBases.detail` | `GET` | `/api/v1/knowledge-bases/:id` | 查看知识库详情与导入根路径 |
| `knowledgeTree.list` | `GET` | `/api/v1/knowledge-bases/:id/tree` | 列出知识库下可导入节点 |
| `knowledgeTree.detail` | `GET` | `/api/v1/knowledge-tree/:id` | 查看知识树节点详情与导入路径 |
| `documents.import.create` | `POST` | `/api/v1/import-tasks/documents` | 创建文档导入任务 |
| `documents.import.status` | `GET` | `/api/v1/import-tasks/:id` | 查看导入进度 |
| `documents.import.list` | `GET` | `/api/v1/import-tasks` | 列出导入任务 |
| `documents.import.cancel` | `POST` | `/api/v1/import-tasks/:id/cancel` | 取消排队中的导入任务 |
| `documents.import.retry` | `POST` | `/api/v1/import-tasks/:id/retry` | 重试失败或已取消任务 |
| `documents.import.events` | `GET` | `/api/v1/import-tasks/:id/events` | 查看进度事件快照 |

创建导入任务请求体：

```json
{
  "sourceType": "url",
  "knowledgeBaseId": "knowledge_base_uuid",
  "parentNodeId": "knowledge_node_uuid",
  "sourceUrl": "https://example.com/product.pdf"
}
```

Capability 与 CLI 导入入口的 `sourceType` 支持 `local`、`url`、`manifest`。飞书、钉钉、Git 等需要集成凭证的来源走导入任务 API 或控制台集成流程，并提供 `integrationId`。`parentNodeId` 可省略，省略时导入到知识库根路径。

## 可观测性接口

### GET /api/v1/observability/capabilities

返回 capability 平台当前进程内的观测快照。需要 JWT。

包含：

- capability 调用 counters。
- token exchange counters。
- capability 延迟 P95 / P99。
- rate limit 规则和活跃 bucket。
- 告警快照。

### GET /api/v1/observability/capabilities/correlation

返回 metrics、alerts、rate limit snapshot 与近期 capability audit 轨迹的关联视图。需要 JWT。

查询参数：

| 参数    | 必填 | 说明                            |
| ------- | ---- | ------------------------------- |
| `limit` | 否   | 返回最近审计轨迹条数，默认 `20` |

### GET /api/v1/observability/capabilities/prometheus

返回 Prometheus exposition 格式指标，供外部 Prometheus 抓取。

## 公共探针

### GET /api/v1/healthz

匿名存活探针，只返回服务进程是否存活，不暴露内部依赖细节。

### GET /api/v1/readyz

匿名就绪探针，检查数据库和 OpenViking 是否可用，适合容器编排或负载均衡探测。

## MCP

### GET /api/v1/mcp/sse

使用 API key 建立 MCP SSE 会话。

查询参数：

| 参数         | 说明                   |
| ------------ | ---------------------- |
| `key`        | API key，可选          |
| `sessionKey` | 短期 session key，可选 |

使用示例：

- `GET /api/v1/mcp/sse?key=<apiKey>`
- `GET /api/v1/mcp/sse?sessionKey=<session-key>`

### POST /api/v1/capability/keys

为当前租户内指定用户创建 capability API key。需要 JWT。

请求体：

```json
{
  "userId": "user-id",
  "name": "ci-bot",
  "ttlSeconds": 2592000
}
```

### GET /api/v1/capability/keys

查询当前租户下全部 capability API key。需要 JWT。

### DELETE /api/v1/capability/keys/:id

删除当前租户下指定 capability API key。需要 JWT。

### POST /api/v1/mcp/message

MCP JSON-RPC 消息接口。

查询参数：

| 参数           | 说明                       |
| -------------- | -------------------------- |
| `sessionId`    | SSE 建立后返回的会话 ID    |
| `sessionToken` | SSE 建立后返回的会话 token |
| `key`          | API key，可选              |
| `sessionKey`   | 短期 session key，可选     |

支持方法：

| 方法         | 说明                                 |
| ------------ | ------------------------------------ |
| `initialize` | 初始化 MCP 会话                      |
| `tools/list` | 返回 capability catalog 投影出的工具 |
| `tools/call` | 调用指定 capability                  |

## 租户接口

租户管理接口需要 `super_admin`，公开探测接口除外。

| Method   | Path                               | 说明                            |
| -------- | ---------------------------------- | ------------------------------- |
| `GET`    | `/api/v1/tenants`                  | 获取租户列表                    |
| `GET`    | `/api/v1/tenants/:id`              | 获取租户详情                    |
| `POST`   | `/api/v1/tenants`                  | 创建租户                        |
| `PATCH`  | `/api/v1/tenants/:id`              | 更新租户                        |
| `PATCH`  | `/api/v1/tenants/:id/status`       | 更新租户启用状态                |
| `DELETE` | `/api/v1/tenants/:id`              | 软删除租户                      |
| `GET`    | `/api/v1/tenants/check-auth/:code` | 公开接口，检查租户可用 SSO 方式 |

创建租户请求体：

```json
{
  "tenantId": "acme",
  "displayName": "ACME Corp",
  "isolationLevel": "medium",
  "quota": {
    "maxDocs": 1000,
    "maxVectors": 100000
  }
}
```

说明：

- `tenantId`（即命名空间 ID）要求全局唯一；服务端会先做冲突校验，数据库层也有唯一约束兜底。
- 创建成功后，系统会自动创建初始租户管理员：用户名固定为 `admin`，初始密码为 `{tenantId}@123`，角色为 `tenant_admin`。
- `status` 字段用于租户启用/禁用，推荐值为 `active` 或 `disabled`。
- 删除租户时采用软删除；已软删租户不会出现在默认查询结果中。

## 用户接口

需要 `super_admin` 或 `tenant_admin`。

| Method   | Path                | 说明         |
| -------- | ------------------- | ------------ |
| `GET`    | `/api/v1/users`     | 获取用户列表 |
| `POST`   | `/api/v1/users`     | 创建用户     |
| `PATCH`  | `/api/v1/users/:id` | 更新用户     |
| `DELETE` | `/api/v1/users/:id` | 删除用户     |

`tenant_admin` 不能创建或提升 `super_admin`。

## 知识库接口

需要 JWT 和租户上下文。

| Method   | Path                                  | 说明                       |
| -------- | ------------------------------------- | -------------------------- |
| `GET`    | `/api/v1/knowledge-bases`             | 获取当前租户知识库         |
| `GET`    | `/api/v1/knowledge-bases/:id`         | 获取知识库详情             |
| `GET`    | `/api/v1/knowledge-bases/:id/tree`    | 获取指定知识库下的知识树   |
| `POST`   | `/api/v1/knowledge-bases`             | 创建知识库                 |
| `PATCH`  | `/api/v1/knowledge-bases/:id`         | 更新知识库                 |
| `DELETE` | `/api/v1/knowledge-bases/:id`         | 删除知识库                 |

## 知识树接口

需要 JWT 和租户上下文。

| Method   | Path                              | 说明           |
| -------- | --------------------------------- | -------------- |
| `GET`    | `/api/v1/knowledge-tree`          | 获取知识树节点 |
| `GET`    | `/api/v1/knowledge-tree/graph`    | 获取知识图谱   |
| `GET`    | `/api/v1/knowledge-tree/:id`      | 获取知识节点详情 |
| `POST`   | `/api/v1/knowledge-tree`          | 创建知识节点   |
| `PATCH`  | `/api/v1/knowledge-tree/:id`      | 更新知识节点   |
| `DELETE` | `/api/v1/knowledge-tree/:id`      | 删除知识节点   |
| `PATCH`  | `/api/v1/knowledge-tree/:id/move` | 移动节点       |

知识树查询参数：

| 接口                           | 参数   | 说明          |
| ------------------------------ | ------ | ------------- |
| `/api/v1/knowledge-tree`       | `kbId` | 目标知识库 ID |
| `/api/v1/knowledge-tree/graph` | `kbId` | 目标知识库 ID |

## 导入任务接口

需要 JWT 和租户上下文。

| Method | Path                                  | 说明                       |
| ------ | ------------------------------------- | -------------------------- |
| `GET`  | `/api/v1/import-tasks`                | 获取导入任务列表           |
| `GET`  | `/api/v1/import-tasks/:id`            | 获取任务详情               |
| `POST` | `/api/v1/import-tasks`                | 创建导入任务               |
| `POST` | `/api/v1/import-tasks/documents`      | 创建文档导入任务并返回进度入口 |
| `POST` | `/api/v1/import-tasks/local-upload`   | 上传本地文件并创建导入任务 |
| `GET`  | `/api/v1/import-tasks/:id/events`     | 查看任务进度事件快照       |
| `GET`  | `/api/v1/import-tasks/:id/sync`       | 同步任务执行结果           |
| `POST` | `/api/v1/import-tasks/:id/retry`      | 重试失败或已取消的导入任务 |
| `POST` | `/api/v1/import-tasks/:id/cancel`     | 取消排队中的导入任务       |

导入来源：

| sourceType | 说明                           |
| ---------- | ------------------------------ |
| `feishu`   | 飞书文档                       |
| `dingtalk` | 钉钉文档                       |
| `git`      | GitHub 或 GitLab 仓库          |
| `url`      | 公开网页或 Wiki 页面           |
| `manifest` | 批量导入清单                   |
| `local`    | 通过受控上传目录暂存的本地文件 |

补充说明：

- `POST /api/v1/import-tasks` 至少需要 `kbId`、`sourceType` 与来源地址（`sourceUrl` 或 `sourceUrls`）
- `sourceType=feishu` / `sourceType=dingtalk` 必须提供 `integrationId`，Worker 会在 Admin 侧读取平台文档内容后通过 OpenViking `temp_upload` 注入
- `sourceType=git` 建议提供 `integrationId`，用于读取平台凭证、分支和路径配置
- `sourceType=local` 只能由 `/api/v1/import-tasks/local-upload` 生成，不能直接提交任意 `file://` 路径
- `/api/v1/import-tasks/local-upload` 使用 `multipart/form-data`，字段为 `kbId`、可选 `targetUri`，以及 `files`
- 控制台默认不再传 `targetUri`，服务端会按知识库 `vikingUri` 自动生成导入目标路径
- OpenViking 资源接口只接收 `path` 或 `temp_file_id`；平台 Token 不会作为 `config` 透传给 OpenViking
- WebDAV 不作为导入来源；外部客户端访问知识资源请使用 WebDAV 配置页或资源 capability

## 搜索接口

保留给控制台和历史搜索页面使用。Capability 搜索入口见 `/api/v1/knowledge/search`。

| Method | Path                               | 说明         |
| ------ | ---------------------------------- | ------------ |
| `POST` | `/api/v1/search/find`              | 语义检索     |
| `POST` | `/api/v1/search/grep`              | 文本匹配     |
| `GET`  | `/api/v1/search/analysis`          | 无答案基础分析 |
| `GET`  | `/api/v1/search/stats-deep`        | 深度检索统计 |
| `GET`  | `/api/v1/search/logs`              | 最近检索日志 |
| `POST` | `/api/v1/search/logs/:id/feedback` | 提交检索反馈 |

其中：
- `/api/v1/search/analysis` 返回 `total` 与 `noAnswerLogs`，用于缺口样本与补录闭环。
- `/api/v1/search/stats-deep` 返回命中率、高频问题、趋势等聚合统计。

## 系统接口

公开探针与管理员诊断接口分离。

| Method | Path                       | 说明                     |
| ------ | -------------------------- | ------------------------ |
| `GET`  | `/api/v1/healthz`          | 匿名存活探针             |
| `GET`  | `/api/v1/readyz`           | 匿名就绪探针             |
| `GET`  | `/api/v1/system/health`    | 受保护的系统诊断健康检查 |
| `GET`  | `/api/v1/system/queue`     | OpenViking 处理队列      |
| `GET`  | `/api/v1/system/stats`     | 系统统计                 |
| `GET`  | `/api/v1/system/dashboard` | 控制台仪表盘             |
| `POST` | `/api/v1/system/reindex`   | 触发重新索引             |

租户视角只有在当前租户已启用自定义 OV 配置时，才允许访问 `/api/v1/system/health`、`/api/v1/system/stats` 与 `/api/v1/system/queue`；未启用时接口会直接拒绝，用于拦截手工访问或直接敲 URL 的绕过路径。

`/api/v1/system/dashboard` 在租户视角返回当前租户数据；在平台视角返回全平台数据，并按活跃租户解析有效 OV 配置。租户未配置 `ovConfig` 时使用 `DEFAULT_OV_CONFIG` 默认配置，平台视角会对相同 OV 连接去重后聚合健康状态和队列数据，并额外返回 `tenantCount`、`platformKbCount`、`tenantSearchTop`、`tenantKnowledgeBaseTop`。其中 `platformKbCount` 与 `tenantKnowledgeBaseTop` 会按租户隔离级别逐个统计，覆盖 `SMALL`/`MEDIUM`/`LARGE` 三种知识库存储路径。

## 配置接口

| Method  | Path               | 说明                                 |
| ------- | ------------------ | ------------------------------------ |
| `GET`   | `/api/v1/settings` | 获取系统配置，需要 JWT               |
| `PATCH` | `/api/v1/settings` | 批量更新系统配置，需要 `super_admin` |
| `POST`  | `/api/v1/settings/test-connection` | 测试 OV 引擎或 rerank 连接，需要 `super_admin` |

## 审计接口

需要 JWT 和租户上下文。

| Method | Path                       | 说明                                         |
| ------ | -------------------------- | -------------------------------------------- |
| `GET`  | `/api/v1/audit`            | 分页查询审计日志                             |
| `GET`  | `/api/v1/audit/stats`      | 审计统计                                     |
| `POST` | `/api/v1/audit/client-log` | Web 前端异常日志入口，供浏览器侧上报错误摘要 |

常用查询参数：

| 参数       | 说明               |
| ---------- | ------------------ |
| `page`     | 页码               |
| `pageSize` | 每页条数           |
| `action`   | 操作类型           |
| `username` | 用户名             |
| `dateFrom` | 起始日期，ISO 8601 |
| `dateTo`   | 结束日期，ISO 8601 |

## 集成配置接口

需要 JWT 和租户上下文。敏感字段返回前会自动脱敏。

| Method   | Path                       | 说明         |
| -------- | -------------------------- | ------------ |
| `GET`    | `/api/v1/integrations`     | 获取集成配置 |
| `POST`   | `/api/v1/integrations`     | 创建集成配置 |
| `PATCH`  | `/api/v1/integrations/:id` | 更新集成配置 |
| `DELETE` | `/api/v1/integrations/:id` | 删除集成配置 |

## 全局错误语义

| 状态码 | 说明                               |
| ------ | ---------------------------------- |
| `400`  | 请求参数错误                       |
| `401`  | 未认证、凭证无效或 token 过期      |
| `403`  | 权限不足、租户上下文缺失或越权 URI |
| `404`  | 资源或 capability 不存在           |
| `409`  | 资源冲突                           |
| `429`  | 触发 rate limit 或 quota           |
| `500`  | 服务内部错误或 OpenViking 下游异常 |

## 能力错误码

| 错误码                        | 说明                     |
| ----------------------------- | ------------------------ |
| `CAPABILITY_UNAUTHORIZED`     | 缺少有效凭证             |
| `CAPABILITY_FORBIDDEN`        | 权限不足或租户边界不匹配 |
| `CAPABILITY_NOT_FOUND`        | capability 不存在        |
| `CAPABILITY_INVALID_INPUT`    | 输入不符合 schema        |
| `CAPABILITY_RATE_LIMITED`     | 触发限流                 |
| `CAPABILITY_EXECUTION_FAILED` | 下游服务或执行异常       |
