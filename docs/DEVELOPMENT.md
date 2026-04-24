# 💻 开发者指南 (Contributor Guide)

感谢你关注 `OpenViking Admin`！本指南将帮助你快速搭建开发环境并参与社区贡献。

---

## 1. 技术栈要求

| 层级 | 技术 | 版本 |
|------|------|------|
| **Backend** | NestJS, TypeORM, Passport | NestJS 11+ |
| **Frontend** | Next.js (App Router), TailwindCSS, Shadcn UI | Next.js 16, React 19 |
| **Storage** | PostgreSQL | 14+ (需 uuid-ossp 扩展) |
| **包管理** | pnpm | 8+ (monorepo 必需) |
| **向量引擎** | OpenViking | 独立部署 |

---

## 2. 项目结构

本项目采用 pnpm monorepo 结构：

```
openviking-knowdge/
├── apps/
│   ├── server/          # NestJS 后端 (端口 6001)
│   │   ├── src/
│   │   │   ├── auth/          # 认证模块 (JWT + SSO)
│   │   │   ├── users/         # 用户管理
│   │   │   ├── tenant/        # 租户管理 (三级隔离)
│   │   │   ├── knowledge-base/ # 知识库管理
│   │   │   ├── knowledge-tree/ # 知识树/图谱
│   │   │   ├── import-task/   # 导入任务 (后台 Worker)
│   │   │   ├── search/        # 语义检索 (向量 + Rerank)
│   │   │   ├── system/        # 系统监控
│   │   │   ├── settings/      # 系统配置
│   │   │   ├── audit/         # 审计日志
│   │   │   ├── mcp/           # MCP 协议
│   │   │   ├── common/        # 全局基础设施 (守卫/拦截器/加密)
│   │   │   └── migrations/    # 数据库迁移
│   │   ├── test/              # E2E 测试
│   │   └── seed-admin.js      # 初始管理员种子脚本
│   └── web/             # Next.js 前端 (端口 6002)
│       ├── app/               # App Router 路由
│       │   ├── platform/      # 超管平台
│       │   └── console/       # 租户工作台
│       ├── components/        # 共享组件
│       └── lib/               # 工具库 (API 客户端、Session)
├── docs/                # 项目文档
└── package.json         # 根 workspace 配置
```

---

## 3. 本地开发流程

### 3.1 环境准备

```bash
# 克隆项目
git clone https://github.com/a574676848/openviking-admin.git
cd openviking-admin

# 安装依赖
pnpm install
```

### 3.2 数据库准备

```sql
-- 创建数据库
CREATE DATABASE openviking_admin;

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 赋予 Schema 创建权限 (MEDIUM 隔离等级需要)
GRANT CREATE ON DATABASE openviking_admin TO postgres;
```

### 3.3 配置注入

```bash
cd apps/server
cp .env.example .env
# 编辑 .env 填写实际值
```

关键配置项：
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` — 数据库连接
- `JWT_SECRET` — JWT 签名密钥 (生产环境必须修改)
- `OV_BASE_URL`, `OV_API_KEY` — OpenViking 引擎地址和密钥
- `FRONTEND_URL` — 前端地址 (CORS 白名单)

### 3.4 数据库迁移

```bash
cd apps/server
pnpm typeorm migration:run -d src/data-source.ts
```

### 3.5 初始管理员账号

```bash
cd apps/server
node seed-admin.js
```

> **注意**: `seed-admin.js` 中硬编码了数据库连接参数，使用前需修改为实际值。

默认账号: `admin` / `admin123`

### 3.6 启动开发服务

```bash
# 在项目根目录同时启动前后端
pnpm dev
```

或分别启动：

```bash
# 后端 (端口 6001)
cd apps/server && pnpm start:dev

# 前端 (端口 6002)
cd apps/web && pnpm dev
```

前端通过 `next.config.ts` 中的 rewrite 规则自动代理 `/api/*` 请求到后端，无需单独配置跨域。

---

## 4. 代码规范 (Coding Standards)

### 4.1 架构约束

- **洋葱架构**: Domain 层必须纯净，不依赖 Infrastructure 层
- **Repository 模式**: 所有涉及业务数据的 Repository 必须实现 `Scope.REQUEST` 作用域
- **租户审计**: 所有修改操作必须通过 `AuditService` 进行记录
- **类型安全**: 严禁使用 `any`，所有业务 DTO 必须进行完整性定义

### 4.2 命名规范

- 文件名: kebab-case (`tenant.guard.ts`)
- 类名: PascalCase (`TenantGuard`)
- 方法名: camelCase (`findAllByTenantId()`)
- 常量: UPPER_SNAKE_CASE (`TENANT_CACHE_TTL`)

### 4.3 提交规范 (Commit Convention)

我们遵循 Conventional Commits 规范：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

| type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: add rerank strategy to search pipeline` |
| `fix` | Bug 修复 | `fix: correct tenant-id extraction logic in guard` |
| `docs` | 文档变更 | `docs: update deployment guide with Docker instructions` |
| `style` | 代码格式 (不影响功能) | `style: apply prettier formatting to auth module` |
| `refactor` | 重构 (非功能新增/修复) | `refactor: extract SSO provider interface` |
| `test` | 测试相关 | `test: add unit tests for AuthService login` |
| `chore` | 构建/工具变更 | `chore: update pnpm-lock.yaml` |

---

## 5. 调试技巧

### 5.1 后端调试

- NestJS 开发模式自动重启: `pnpm start:dev`
- 查看 Passport 注册策略: 启动时控制台输出
- 查看租户隔离: 检查 `TenantGuard` 日志中的 `search_path` 设置

### 5.2 前端调试

- Next.js 开发模式提供热重载: `pnpm dev`
- 浏览器 Network 面板查看 `/api/*` 代理请求
- 检查 `sessionStorage` 中的 token 状态

### 5.3 数据库调试

```bash
# 连接数据库
psql -h localhost -U postgres -d openviking_admin

# 查看迁移状态
# 通过 TypeORM 或手动查询 migration 表

# 查看租户 Schema
SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%';
```

---

## 6. 测试

```bash
cd apps/server

pnpm test          # 单元测试
pnpm test:watch    # 监听模式
pnpm test:cov      # 覆盖率报告
pnpm test:e2e      # E2E 测试
```

详见 [测试指南](./TESTING.md)。

---

## 7. 文档

| 文档 | 说明 |
|------|------|
| [架构深度解析](./ARCHITECTURE.md) | 洋葱架构、动态寻址机制 |
| [多租户隔离战略](./TENANT_ISOLATION.md) | 三级隔离方案 |
| [API 参考手册](./API_REFERENCE.md) | 完整端点文档 |
| [配置参考](./CONFIGURATION.md) | 环境变量和系统配置 |
| [SSO 集成指南](./SSO_INTEGRATION.md) | 四种 SSO 配置步骤 |
| [MCP 协议手册](./MCP_GUIDE.md) | AI 客户端接入 |
| [部署指南](./DEPLOYMENT.md) | 本地开发到生产部署 |
| [数据库 Schema](./DATABASE_SCHEMA.md) | 表结构和关系图 |
| [安全策略](./SECURITY.md) | 威胁模型和最佳实践 |
| [检索配置指南](./SEARCH_CONFIGURATION.md) | 二阶段检索调优 |
| [知识导入流水线](./IMPORT_PIPELINE.md) | 集成导入步骤 |
| [测试指南](./TESTING.md) | 测试策略和示例 |
| [故障排查](./TROUBLESHOOTING.md) | 常见问题解决 |
| [前端 UI/UX 设计规范](./DESIGN.md) | 双色主题和交互系统 |

---

*OpenViking Admin 维护团队期待你的 PR！*