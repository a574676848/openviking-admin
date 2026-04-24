# 🏗️ 深度架构解析 (Architecture Deep Dive)

本文旨在为开发者和架构师详细解读 `OpenViking Admin` 的底层设计哲学与核心实现机制。

---

## 1. 分层架构 (Onion Architecture)

项目严格遵循"洋葱架构"设计原则，确保核心业务逻辑（Domain）不依赖于外部基础设施（Infrastructure）。

```
┌─────────────────────────────────────────────────┐
│              Presentation Layer                  │
│  Controllers (auth/, users/, tenant/, ...)       │
│  DTOs, Guards, Interceptors, Filters             │
├─────────────────────────────────────────────────┤
│              Application Layer                   │
│  Services (auth.service.ts, search.service.ts)   │
│  业务编排、事务管理、审计记录                      │
├─────────────────────────────────────────────────┤
│              Domain Layer                        │
│  Entities (users/entities/, tenant/entities/)    │
│  Repository Interfaces (domain/repositories/)    │
├─────────────────────────────────────────────────┤
│              Infrastructure Layer                │
│  Repository Implementations                      │
│  (infrastructure/repositories/)                  │
│  OVClient, EncryptionService, DynamicDataSource  │
└─────────────────────────────────────────────────┘
```

- **Domain 层**: 定义业务实体（Entities）与仓储接口（Repository Interfaces），位于 `*/domain/repositories/*.interface.ts`
- **Infrastructure 层**: 实现具体的数据库访问、外部 API 调用（OV Client）及认证逻辑，位于 `*/infrastructure/repositories/*.ts`
- **Application 层**: 通过 NestJS Services 协调业务流转，位于 `*.service.ts`
- **Presentation 层**: Controller 接收 HTTP 请求，DTO 验证，Guard 授权

---

## 2. 核心黑科技：请求级动态寻址 (Request-Scoped Context)

这是系统的稳定性核心。我们通过 NestJS 的 `Scope.REQUEST` 实现了**仓储层的动态实例化**。

### 逻辑闭环

1. **拦截器注入**: `TenantGuard` (`common/tenant.guard.ts`) 识别租户身份，并将连接句柄挂载至 `Request`
2. **动态路由**: `Repository` 实例化时，通过构造函数注入 `REQUEST` 对象
3. **精准读写**: 通过 `get repo()` getter 方法，根据请求上下文动态选择主库、Schema 或独立租户库

### 关键代码路径

| 组件 | 文件路径 | 说明 |
|------|----------|------|
| TenantGuard | `common/tenant.guard.ts` | 租户身份识别 + 数据库路由 |
| DynamicDataSourceService | `common/dynamic-datasource.service.ts` | LARGE 租户动态连接池 |
| TenantCleanupInterceptor | `common/tenant-cleanup.interceptor.ts` | QueryRunner 生命周期管理 |
| Repository 实现 | `*/infrastructure/repositories/*.ts` | `Scope.REQUEST` 仓储实现 |

---

## 3. 资源自愈：连接回收机制 (Cleanup Interceptor)

为了防止多租户场景下的连接泄漏，系统通过 `TenantCleanupInterceptor` 利用 RxJS 的 `finalize` 钩子。无论业务执行成功还是抛出异常，均会强制执行 `QueryRunner.release()`，确保数据库连接池的健康。

**关键代码路径**: `common/tenant-cleanup.interceptor.ts`

---

## 4. 检索双轨制 (Dual-Stage Search)

- **Stage 1 (Vector)**: 利用 OpenViking 引擎执行语义召回 (`common/ov-client.service.ts`)
- **Stage 2 (Rerank)**: 引入二阶重排序模型，对召回片段进行深度语义验证

**关键代码路径**: `search/search.service.ts`

### ACL 前置过滤

检索前根据用户角色和知识节点 ACL 配置，过滤出用户可访问的 URI 列表，确保租户隔离。

---

## 5. SSO Provider 适配器模式

SSO 系统采用 Provider 适配器模式，由 `SSOPortalService` 作为统一分发器，根据 `IntegrationType` 路由到具体 Provider。

**关键代码路径**:

| 组件 | 文件路径 |
|------|----------|
| SSOPortalService | `auth/sso/sso-portal.service.ts` |
| SsoTicketService | `auth/sso/sso-ticket.service.ts` |
| 飞书 Provider | `auth/sso/providers/feishu-sso.provider.ts` |
| 钉钉 Provider | `auth/sso/providers/dingtalk-sso.provider.ts` |
| OIDC Provider | `auth/sso/providers/oidc-sso.provider.ts` |
| LDAP Provider | `auth/sso/providers/ldap.provider.ts` |

---

## 6. 导入任务策略模式

`ImportTaskModule` 使用策略模式处理不同来源的集成配置：

**关键代码路径**:

| 组件 | 文件路径 |
|------|----------|
| ImportTaskService | `import-task/import-task.service.ts` |
| TaskWorkerService | `import-task/task-worker.service.ts` |
| 飞书 Integrator | `import-task/integrators/feishu.integrator.ts` |
| 钉钉 Integrator | `import-task/integrators/dingtalk.integrator.ts` |
| Git Integrator | `import-task/integrators/git.integrator.ts` |

---

## 7. MCP 协议实现

MCP (Model Context Protocol) 通过 SSE 端点建立长连接，POST 端点接收 JSON-RPC 请求。

**关键代码路径**: `mcp/mcp.service.ts`, `mcp/mcp.controller.ts`

### 暴露工具

| 工具名 | 说明 |
|--------|------|
| `search_knowledge` | 带权限隔离的语义检索 |
| `grep_knowledge` | 正则表达式文本匹配 |
| `list_resources` | 浏览租户授权范围内的目录 |
| `tree_resources` | 生成知识资产树状视图 |

---

## 8. 全局异常处理

`AllExceptionsFilter` (`common/all-exceptions.filter.ts`) 捕获所有异常，统一返回 `{ statusCode, timestamp, path, message }` 格式。

---

> 下一步建议：阅读 [多租户隔离战略](./TENANT_ISOLATION.md) 了解物理隔离细节。