# 架构文档

本文说明 OpenViking Admin 的系统分层、核心链路和能力平台的设计边界。

![OpenViking 企业 AI 知识中台架构全景图](<./images/OpenViking 企业 AI 知识中台架构全景图.png>)

这张图展示了系统从企业 SSO、Web 控制台、能力入口到 OpenViking 引擎和多租户存储的整体结构。下面的文字会进一步展开各层职责和依赖方向。

## 架构原则

项目遵循洋葱架构，依赖方向只能从外层指向内层：

```text
Presentation / Adapters
  -> Application
    -> Domain

Infrastructure
  -> Application / Domain interfaces
```

Domain 层不依赖 NestJS、TypeORM、HTTP、CLI、MCP、OpenViking SDK 或任何外部协议。Presentation 和 Infrastructure 都是可替换实现。

## 分层视图

```text
┌───────────────────────────────────────────────────────────────┐
│ Presentation / Adapters                                       │
│ HTTP Controllers, OVA CLI, MCP Controller, Skill templates     │
├───────────────────────────────────────────────────────────────┤
│ Application                                                   │
│ Auth, Tenant, Search orchestration, Capability services        │
├───────────────────────────────────────────────────────────────┤
│ Domain                                                        │
│ Entities, Repository interfaces, Capability contracts          │
├───────────────────────────────────────────────────────────────┤
│ Infrastructure                                                │
│ TypeORM repositories, OVClient, Credential store, Metrics      │
└───────────────────────────────────────────────────────────────┘
```

## 主要模块

| 模块 | 分层角色 | 说明 |
|------|------|------|
| `auth` | Presentation / Application | 登录、SSO、JWT、refresh token 和换证入口 |
| `tenant` | Domain / Infrastructure | 租户隔离、配置、数据路由和集成配置 |
| `users` | Domain / Application | 用户与角色管理 |
| `knowledge-base` | Domain / Application | 知识库管理 |
| `knowledge-tree` | Domain / Application | 知识树、ACL 和资源 URI |
| `import-task` | Application / Infrastructure | 多源导入任务与后台 worker |
| `search` | Application / Infrastructure | 语义检索、文本匹配和统计 |
| `capabilities` | Application / Adapter | capability catalog、执行、授权、换证、观测 |
| `mcp` | Presentation Adapter | MCP SSE 与 JSON-RPC 协议适配 |
| `common` | Infrastructure | OpenViking client、加密、全局 guard/filter/interceptor |

## 能力平台

能力平台将知识能力定义为稳定契约，再投影到多个入口。

```text
HTTP / CLI / MCP / Skill
  -> 能力契约
  -> CapabilityAuthorizationService
  -> CapabilityExecutionService
  -> KnowledgeCapabilityGateway
  -> OpenViking 下游服务
```

### 入口职责

| 入口 | 职责 |
|------|------|
| HTTP | 暴露 RESTful capability 接口 |
| CLI | 提供 `ova` 命令、profile、自动 refresh、结构化输出和诊断 |
| MCP | 将 capability catalog 投影为 `tools/list` 和 `tools/call` |
| Skill | 在 Agent 指令中选择 HTTP 或 CLI，不定义新协议 |

## 认证与换证链路

```text
Local login / SSO
  -> JWT access token + refresh token
  -> /api/v1/auth/token/exchange
  -> capability access token

Local login / SSO
  -> JWT access token + refresh token
  -> /api/v1/auth/session/exchange
  -> session key

JWT access token
  -> /api/v1/auth/client-credentials
  -> scoped API key
```

所有能力调用最终解析为统一 `Principal`，然后进入 `CapabilityAuthorizationService`。

## 多租户数据边界

租户隔离由身份、角色、URI scope 和数据路由共同保证：

1. `TenantGuard` 识别租户身份并注入请求上下文。
2. 身份数据（`users`、登录凭证、SSO 映射）固定存放在公共控制平面，不跟随租户 Schema 或独立库漂移。
3. 业务 Repository 通过请求上下文选择主库、Schema 或独立租户库。
4. Capability gateway 对租户外 URI 返回显式拒绝。
5. 下游 OpenViking 请求只使用服务端推导出的租户 scope。

## 请求级动态寻址

系统通过请求上下文和动态 datasource 支持不同隔离级别，但身份中心始终使用公共库。

| 组件 | 说明 |
|------|------|
| `TenantGuard` | 识别租户身份，准备数据路由上下文 |
| `DynamicDataSourceService` | 管理 Large 租户业务库连接池，不承载 `users` / `tenants` |
| `TenantCleanupInterceptor` | 请求结束后释放 QueryRunner |
| Repository implementations | 业务数据按租户路由；身份数据固定走公共库 |

## 可观测性

Capability 调用会产生以下字段：

| 字段 | 说明 |
|------|------|
| `traceId` | 服务端追踪 ID |
| `spanId` | 调用片段 ID |
| `requestId` | 客户端或服务端请求 ID |
| `tenantId` | 租户 ID |
| `userId` | 用户 ID |
| `channel` | `http`、`cli`、`mcp` 或 `skill` |
| `credentialType` | 当前凭证类型 |
| `capability` | capability id |

`GET /api/v1/observability/capabilities` 返回进程内快照，`GET /api/v1/observability/capabilities/prometheus` 预留 Prometheus 指标导出入口。多实例部署时，rate limit store 应替换为 Redis 或分布式 KV。

## 扩展新入口

新增入口时必须满足：

- 只依赖能力契约和 Application service。
- 不在 adapter 中复制授权规则、租户 scope 规则和下游访问逻辑。
- 保留统一响应、错误语义、traceId 和审计记录。
- 在 [能力平台](./CAPABILITIES.md) 和 [示例目录](../examples) 中补充接入说明。
