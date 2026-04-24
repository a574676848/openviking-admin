# API 参考手册 (API Reference)

所有 API 端点均以 `/api` 为全局前缀（由 `main.ts` 中 `app.setGlobalPrefix('api')` 设置）。

## 认证方式

| 方式 | 适用端点 | 说明 |
|------|----------|------|
| 无认证 | 公开端点 | 登录、SSO 回调、租户认证检查 |
| `Authorization: Bearer <token>` | 大部分端点 | JWT Token，2 小时过期 |
| `?key=<mcp_api_key>` | MCP SSE/Message | MCP 专用 API Key 认证 |

## 角色体系

| 角色 | 权限范围 |
|------|----------|
| `super_admin` | 平台全局管理，可切换视角模拟租户管理员 |
| `tenant_admin` | 租户内管理员，可管理租户用户和配置 |
| `tenant_operator` | 租户操作员，可执行知识库和导入操作 |
| `tenant_viewer` | 租户只读用户，仅可查看和检索 |

---

## Auth 认证模块

### POST /api/auth/login

本地账号登录。

**请求体**:
```json
{
  "username": "admin",
  "password": "admin123",
  "tenantCode": "default"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `username` | string | 是 | 用户名 |
| `password` | string | 是 | 密码 |
| `tenantCode` | string | 否 | 租户标识，非超管必须提供 |

**响应**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "role": "super_admin",
    "tenantId": null,
    "scope": "platform"
  }
}
```

**错误码**:
- `401` — 用户名或密码错误
- `403` — 非超管未提供 tenantCode

---

### GET /api/auth/sso/redirect/:tenantId/:type

发起 SSO 认证重定向。

| 参数 | 类型 | 说明 |
|------|------|------|
| `tenantId` | string (path) | 租户 ID |
| `type` | string (path) | SSO 类型: `feishu` / `dingtalk` / `oidc` / `ldap` |

**响应**: 302 重定向到对应 SSO Provider 的认证页面。

---

### GET /api/auth/sso/callback/:tenantId/:type

SSO 认证回调处理。

| 参数 | 类型 | 说明 |
|------|------|------|
| `tenantId` | string (path) | 租户 ID |
| `type` | string (path) | SSO 类型 |
| `code` | string (query) | SSO Provider 返回的授权码 |

**响应**: 302 重定向到 `/login?sso_ticket=<ticket>` 或 `/login?error=<msg>`。

---

### POST /api/auth/sso/exchange

用一次性 SSO Ticket 交换 JWT Token。

**请求体**:
```json
{
  "ticket": "sso_ticket_string"
}
```

**响应**: 与 `/auth/login` 相同格式。Ticket 60 秒过期且一次性使用。

---

### POST /api/auth/switch-role

超管视角切换，模拟为指定租户管理员。

**认证**: JWT + `super_admin` 角色

**请求体**:
```json
{
  "tenantId": "target_tenant_id"
}
```

**响应**: 返回新的 JWT Token，`scope` 变为 `tenant`，`isAdminSwitch: true`。

---

### GET /api/auth/me

获取当前登录用户信息。

**认证**: JWT

**响应**:
```json
{
  "id": "uuid",
  "username": "admin",
  "role": "super_admin",
  "tenantId": null
}
```

---

## Tenants 租户模块

> 所有租户端点需要 `super_admin` 角色。

### GET /api/tenants

获取所有租户列表。

**响应**: 租户对象数组。

### GET /api/tenants/:id

获取指定租户详情。

### POST /api/tenants

创建租户。

**请求体**:
```json
{
  "tenantId": "acme",
  "displayName": "ACME Corp",
  "isolationLevel": "medium",
  "quota": { "maxDocs": 1000, "maxVectors": 100000 }
}
```

### PATCH /api/tenants/:id

更新租户信息。

### DELETE /api/tenants/:id

删除租户。

### GET /api/tenants/check-auth/:code

**公开端点**。检查指定租户可用的 SSO 认证方式。

**响应**:
```json
{
  "oidc": true,
  "feishu": false
}
```

---

## Users 用户模块

> 需要 `super_admin` 或 `tenant_admin` 角色。

### GET /api/users

获取当前租户范围内的用户列表。

### POST /api/users

创建用户。内置提权检测：`tenant_admin` 不能创建 `super_admin`。

**请求体**:
```json
{
  "username": "newuser",
  "password": "password123",
  "role": "tenant_operator",
  "tenantId": "acme"
}
```

### PATCH /api/users/:id

更新用户信息。

### DELETE /api/users/:id

删除用户。

---

## Knowledge Bases 知识库模块

> 需要 JWT + TenantGuard。

### GET /api/knowledge-bases

获取当前租户的知识库列表。

### GET /api/knowledge-bases/:id

获取指定知识库详情。

### POST /api/knowledge-bases

创建知识库。自动注入当前租户 ID。

**请求体**:
```json
{
  "name": "产品文档库",
  "description": "包含所有产品相关文档"
}
```

### PATCH /api/knowledge-bases/:id

更新知识库信息。

### DELETE /api/knowledge-bases/:id

删除知识库。

---

## Knowledge Tree 知识树模块

> 需要 JWT + TenantGuard。

### GET /api/knowledge-tree?kbId=<uuid>

获取指定知识库下的所有节点。

### GET /api/knowledge-tree/graph?kbId=<uuid>

获取知识图谱可视化数据。

**响应**:
```json
{
  "nodes": [{ "id": "uuid", "name": "节点名", "group": 1 }],
  "links": [{ "source": "parent_id", "target": "child_id" }]
}
```

### POST /api/knowledge-tree

创建知识节点。

**请求体**:
```json
{
  "name": "章节名称",
  "kbId": "knowledge_base_uuid",
  "parentId": "parent_node_uuid_or_null",
  "acl": { "isPublic": true, "roles": ["tenant_admin"] }
}
```

### PATCH /api/knowledge-tree/:id

更新节点信息。

### DELETE /api/knowledge-tree/:id

删除节点（递归删除子节点）。

### PATCH /api/knowledge-tree/:id/move

移动节点到新的父节点下。

**请求体**:
```json
{
  "parentId": "new_parent_uuid_or_null",
  "sortOrder": 1
}
```

---

## Import Tasks 导入任务模块

> 需要 JWT + TenantGuard。

### GET /api/import-tasks

获取当前租户的导入任务列表。

### GET /api/import-tasks/:id

获取指定任务详情。

### POST /api/import-tasks

创建导入任务。

**请求体**:
```json
{
  "integrationId": "integration_uuid",
  "kbId": "knowledge_base_uuid",
  "sourceType": "git",
  "sourceUrl": "https://github.com/org/repo",
  "targetUri": "viking://resources/tenants/acme/kb/uuid"
}
```

| sourceType | 说明 |
|------------|------|
| `feishu` | 飞书文档 |
| `dingtalk` | 钉钉知识库 |
| `git` | GitHub/GitLab 仓库 |

### GET /api/import-tasks/:id/sync

同步任务执行结果（从 OpenViking 引擎拉取最新状态）。

---

## Search 检索模块

> 需要 JWT + TenantGuard。

### POST /api/search/find

语义检索（二阶段：向量召回 + Rerank）。

**请求体**:
```json
{
  "query": "如何配置多租户隔离",
  "topK": 10,
  "scoreThreshold": 0.5
}
```

**响应**:
```json
{
  "results": [
    {
      "uri": "viking://resources/...",
      "content": "匹配的文本片段...",
      "score": 0.89,
      "metadata": {}
    }
  ],
  "reranked": true,
  "latencyMs": 120
}
```

### POST /api/search/grep

正则表达式文本匹配。

**请求体**:
```json
{
  "pattern": "tenant.*isolation",
  "uri": "viking://resources/tenants/acme/..."
}
```

### GET /api/search/analysis

获取检索分析数据（无答案洞察）。

### GET /api/search/stats-deep

获取深度检索统计。

### GET /api/search/logs?limit=10

获取最近检索日志。

### POST /api/search/logs/:id/feedback

对检索结果提交反馈。

**请求体**:
```json
{
  "feedback": "helpful",
  "note": "结果很精准"
}
```

| feedback 值 | 说明 |
|-------------|------|
| `helpful` | 有帮助 |
| `unhelpful` | 无帮助 |

---

## System 系统模块

> 需要 JWT + TenantGuard。

### GET /api/system/health

系统健康检查。

**响应**:
```json
{
  "ok": true,
  "openviking": { "status": "connected" },
  "dbPool": { "total": 10, "idle": 8, "active": 2 }
}
```

### GET /api/system/queue

获取 OpenViking 处理队列状态。

### GET /api/system/stats

获取系统统计数据。

### GET /api/system/dashboard

获取仪表盘聚合数据（知识库数、任务数、检索数、命中率等）。

### POST /api/system/reindex

触发重新索引。

**请求体**:
```json
{
  "uri": "viking://resources/tenants/acme/kb/uuid"
}
```

---

## Settings 配置模块

### GET /api/settings

获取所有系统配置。需要 JWT 认证。

### PATCH /api/settings

批量更新系统配置。需要 `super_admin` 角色。

**请求体**:
```json
{
  "ov_base_url": "http://ov-server:1933",
  "rerank_endpoint": "http://rerank-server:8080/rerank"
}
```

---

## Audit 审计模块

> 需要 JWT + TenantGuard。

### GET /api/audit?page=1&pageSize=20&action=login&username=admin&dateFrom=2024-01-01&dateTo=2024-12-31

分页查询审计日志。

| 查询参数 | 类型 | 说明 |
|----------|------|------|
| `page` | string | 页码 |
| `pageSize` | string | 每页条数 |
| `action` | string | 操作类型过滤 |
| `username` | string | 用户名过滤 |
| `dateFrom` | string | 起始日期 (ISO 8601) |
| `dateTo` | string | 结束日期 (ISO 8601) |

### GET /api/audit/stats

获取审计操作类型统计。

---

## Integrations 集成模块

> 需要 JWT + TenantGuard。返回数据中敏感字段自动脱敏（显示 `********`）。

### GET /api/integrations

获取当前租户的集成配置列表。

### POST /api/integrations

创建集成配置。

**请求体**:
```json
{
  "name": "飞书文档",
  "type": "feishu",
  "credentials": {
    "appId": "cli_xxx",
    "appSecret": "secret_xxx"
  },
  "config": { "syncInterval": 3600 }
}
```

### PATCH /api/integrations/:id

更新集成配置。

### DELETE /api/integrations/:id

删除集成配置。

---

## MCP 协议模块

### SSE /api/mcp/sse?key=<mcp_api_key>

建立 MCP SSE 长连接。通过 `key` 查询参数认证。

### POST /api/mcp/message?sessionId=<id>&key=<mcp_api_key>

发送 JSON-RPC 2.0 请求。

**MCP 工具集**:

| 工具名 | 说明 |
|--------|------|
| `search_knowledge` | 带权限隔离的语义检索 |
| `grep_knowledge` | 正则表达式文本匹配 |
| `list_resources` | 浏览租户授权范围内的目录 |
| `tree_resources` | 生成知识资产树状视图 |

### POST /api/mcp/keys

创建 MCP API Key。需要 JWT 认证。

### GET /api/mcp/keys

获取当前用户的 MCP Key 列表。需要 JWT 认证。

### DELETE /api/mcp/keys/:id

删除 MCP Key。需要 JWT 认证。

---

## 全局错误响应格式

所有错误响应遵循统一格式：

```json
{
  "statusCode": 401,
  "timestamp": "2024-01-15T08:30:00.000Z",
  "path": "/api/auth/login",
  "message": "Invalid credentials"
}
```

| 状态码 | 说明 |
|--------|------|
| `400` | 请求参数错误 |
| `401` | 未认证或 Token 过期 |
| `403` | 权限不足（角色/租户不匹配） |
| `404` | 资源不存在 |
| `409` | 资源冲突（如用户名重复） |
| `500` | 服务器内部错误 |