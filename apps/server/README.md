# OpenViking Admin Server

企业级私域 AI 知识管理平台后端服务，基于 NestJS 11 构建。

## 技术栈

- **框架**: NestJS 11 + TypeORM
- **数据库**: PostgreSQL 14+ (uuid-ossp 扩展)
- **认证**: Passport JWT + SSO (飞书/钉钉/OIDC/LDAP)
- **加密**: AES-256-CBC (集成凭证保护)
- **向量引擎**: OpenViking (语义检索 + Rerank)

## 模块结构

```
src/
├── main.ts                    # 入口 (端口 6001, 全局前缀 /api)
├── app.module.ts              # 根模块 (11 个业务模块 + 全局 Guard/Interceptor/Filter)
├── auth/                      # 认证模块 (JWT + SSO + 视角切换)
│   ├── sso/                   # SSO Provider 适配器
│   │   ├── sso-portal.service.ts    # 统一分发器
│   │   ├── sso-ticket.service.ts    # 一次性 Ticket 管理
│   │   ├── providers/               # 飞书/钉钉/OIDC/LDAP 四种 Provider
│   │   └── interfaces/              # SSO Provider 接口定义
│   ├── jwt.strategy.ts
│   └── jwt-auth.guard.ts
├── users/                     # 用户管理 (CRUD + 角色体系)
├── tenant/                    # 租户管理 (三级隔离 + Schema 初始化 + 集成配置)
│   ├── schema-initializer.service.ts  # DDL 自动克隆
│   ├── tenant-cache.service.ts        # 租户配置缓存
│   └── integration.service.ts         # 集成凭证管理 (加密存储 + 脱敏)
├── knowledge-base/            # 知识库管理 (配额校验)
├── knowledge-tree/            # 知识树/图谱 (ACL + 递归操作)
├── import-task/               # 导入任务 (后台 Worker + 策略模式)
│   └── task-worker.service.ts         # 定时轮询 Worker
│   └── integrators/                   # 飞书/钉钉/Git 策略
├── search/                    # 检索模块 (向量召回 + Rerank + ACL 过滤)
├── system/                    # 系统监控 (健康检查 + 仪表盘)
├── settings/                  # 系统配置 (key-value + 租户覆盖)
├── audit/                     # 审计日志 (分页查询 + 统计)
├── mcp/                       # MCP 协议 (SSE + JSON-RPC + 4 个工具)
├── common/                    # 全局基础设施
│   ├── tenant.guard.ts               # 租户数据路由守卫
│   ├── roles.guard.ts                # 角色权限守卫
│   ├── dynamic-datasource.service.ts # LARGE 租户动态连接池
│   ├── tenant-cleanup.interceptor.ts # 连接回收拦截器
│   ├── encryption.service.ts         # AES-256-CBC 加密
│   ├── ov-client.service.ts          # OpenViking HTTP 客户端
│   └── all-exceptions.filter.ts      # 全局异常过滤器
└── migrations/                # 数据库迁移 (3 个初始迁移)
```

## 快速开始

```bash
# 安装依赖
pnpm install

# 配置环境
cp .env.example .env
# 编辑 .env 填写数据库和 OV 引擎连接信息

# 创建初始管理员
node seed-admin.js

# 启动开发服务
pnpm start:dev
```

## 数据库迁移

```bash
# 执行迁移
pnpm typeorm migration:run -d src/data-source.ts

# 回滚迁移
pnpm typeorm migration:revert -d src/data-source.ts
```

## 测试

```bash
pnpm test          # 单元测试
pnpm test:e2e      # E2E 测试
pnpm test:cov      # 测试覆盖率
```

## 关键设计

- **Request-Scoped Repository**: 所有 Repository 使用 `Scope.REQUEST`，通过注入 `REQUEST` 对象实现租户级数据库路由
- **Cleanup Interceptor**: RxJS `finalize` 钩子确保 QueryRunner 在请求结束后释放
- **SSO Provider 适配器**: 统一接口 + JIT Provisioning，支持四种企业 SSO
- **二阶段检索**: 向量召回 (Stage 1) + BGE-Rerank (Stage 2)，ACL 前置过滤

## 详细文档

- [架构深度解析](../../docs/ARCHITECTURE.md)
- [多租户隔离战略](../../docs/TENANT_ISOLATION.md)
- [SSO 集成指南](../../docs/SSO_INTEGRATION.md)
- [MCP 协议手册](../../docs/MCP_GUIDE.md)
- [配置参考](../../docs/CONFIGURATION.md)
- [API 参考手册](../../docs/API_REFERENCE.md)