# OpenViking Admin 后端服务

后端服务基于 NestJS 11 和 TypeORM 构建，提供租户管理、用户管理、知识管理、导入任务、检索、审计、SSO、MCP 和能力平台。

## 技术栈

| 类型 | 技术 |
|------|------|
| 运行时 | Node.js 20 |
| Framework | NestJS 11 |
| ORM | TypeORM |
| Database | PostgreSQL 14+ |
| 认证 | Passport JWT、企业 SSO、refresh token |
| 下游服务 | OpenViking |

## 模块结构

```text
src/
├── main.ts                    # 入口，默认端口 6001，全局前缀 /api
├── app.module.ts              # 根模块
├── auth/                      # 登录、SSO、JWT、refresh token、换证入口
├── users/                     # 用户管理
├── tenant/                    # 租户、隔离等级、集成配置
├── knowledge-base/            # 知识库管理
├── knowledge-tree/            # 知识树、ACL、资源 URI
├── import-task/               # 导入任务和后台 worker
├── search/                    # 检索、grep、统计和反馈
├── capabilities/              # 能力平台
├── mcp/                       # MCP SSE 与 JSON-RPC 适配层
├── system/                    # 健康检查、队列、仪表盘
├── settings/                  # 系统配置
├── audit/                     # 审计日志
├── common/                    # guard、filter、OpenViking client、加密等基础设施
└── migrations/                # 数据库迁移
```

## 本地运行

```bash
pnpm install
cp .env.example .env
pnpm typeorm migration:run -d src/data-source.ts
node seed-admin.js
pnpm start:dev
```

服务默认地址：`http://localhost:6001/api`。

## 常用命令

```bash
pnpm start:dev
pnpm test
pnpm test:e2e
pnpm test:cov
pnpm build
pnpm typeorm migration:run -d src/data-source.ts
pnpm typeorm migration:revert -d src/data-source.ts
```

## 能力平台

后端暴露四个首批 capability：

| 能力 | 接口 | 最低角色 |
|------|------|------|
| `knowledge.search` | `POST /api/knowledge/search` | `tenant_viewer` |
| `knowledge.grep` | `POST /api/knowledge/grep` | `tenant_viewer` |
| `resources.list` | `GET /api/resources` | `tenant_operator` |
| `resources.tree` | `GET /api/resources/tree` | `tenant_operator` |

能力发现：

```bash
curl "http://localhost:6001/api/capabilities"
```

仓内 CLI 调用：

```bash
npm run ova -- capabilities list
npm run ova -- knowledge search --query "多租户隔离"
```

## 关键接口

| 端点 | 说明 |
|------|------|
| `POST /api/auth/login` | 本地账号登录 |
| `POST /api/auth/sso/exchange` | SSO ticket 换 JWT |
| `POST /api/auth/refresh` | refresh token 换新登录态 |
| `GET /api/auth/credential-options` | 查看推荐换证入口 |
| `POST /api/auth/token/exchange` | JWT 换 capability access token |
| `POST /api/auth/session/exchange` | JWT 换 session key |
| `POST /api/auth/client-credentials` | JWT 签发 API key |
| `GET /api/capabilities` | capability catalog |
| `GET /api/observability/capabilities` | capability 观测快照 |
| `GET /api/observability/capabilities/prometheus` | Prometheus 指标导出 |
| `GET /api/mcp/sse` | MCP SSE 会话入口 |
| `POST /api/mcp/message` | MCP JSON-RPC 消息接口 |

## 详细文档

| 文档 | 说明 |
|------|------|
| [架构文档](../../docs/ARCHITECTURE.md) | 分层、模块和关键链路 |
| [API 参考](../../docs/API_REFERENCE.md) | HTTP 端点和错误语义 |
| [能力平台](../../docs/CAPABILITIES.md) | capability 契约和四入口映射 |
| [MCP 指南](../../docs/MCP_GUIDE.md) | MCP 客户端接入 |
| [CLI 指南](../../docs/CLI_GUIDE.md) | `ova` 使用方式 |
| [认证与凭证](../../docs/AUTH_AND_CREDENTIALS.md) | 登录、SSO、换证和凭证边界 |
