# 部署指南 (Deployment Guide)

本指南覆盖从本地开发到生产部署的完整流程。

## 前置依赖

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | v20+ | 运行时环境 |
| pnpm | v8+ | 包管理器（monorepo 必需） |
| PostgreSQL | v14+ | 数据库，需启用 `uuid-ossp` 扩展 |
| OpenViking | 最新版 | 向量检索引擎（独立部署） |

---

## 1. 本地开发部署

### 1.1 克隆与安装

```bash
git clone https://github.com/a574676848/openviking-admin.git
cd openviking-admin
pnpm install
```

### 1.2 数据库准备

```sql
-- 创建数据库
CREATE DATABASE openviking_admin;

-- 连接到数据库后启用扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 确保用户拥有 CREATE SCHEMA 权限（MEDIUM 隔离等级需要）
GRANT CREATE ON DATABASE openviking_admin TO postgres;
```

### 1.3 后端配置

```bash
cd apps/server
cp .env.example .env
```

编辑 `.env` 文件，填写实际值：

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=your_secure_password
DB_NAME=openviking_admin

JWT_SECRET=your_random_jwt_secret_at_least_32_chars

OV_BASE_URL=http://localhost:1933
OV_API_KEY=your_openviking_api_key
OV_ACCOUNT=default
OV_USER=admin

FRONTEND_URL=http://localhost:6002
PORT=6001
NODE_ENV=development
```

### 1.4 初始管理员账号

```bash
cd apps/server
node seed-admin.js
```

> **注意**: `seed-admin.js` 中硬编码了数据库连接参数，生产使用前需修改为实际值。

默认账号: `admin` / `admin123`

### 1.5 前端配置

```bash
cd apps/web
```

编辑 `.env.local`：

```env
BACKEND_URL=http://localhost:6001
NEXT_PUBLIC_APP_NAME=OpenViking Admin
```

### 1.6 启动开发服务

```bash
# 在项目根目录
pnpm dev
```

或分别启动：

```bash
# 后端 (端口 6001)
cd apps/server && pnpm start:dev

# 前端 (端口 6002)
cd apps/web && pnpm dev
```

前端通过 `next.config.ts` 中的 rewrite 规则自动代理 `/api/*` 请求到后端。

---

## 2. 生产部署

### 2.1 后端构建

```bash
cd apps/server
pnpm build
pnpm start:prod
```

### 2.2 前端构建

```bash
cd apps/web
pnpm build
pnpm start
```

### 2.3 Docker 部署（推荐）

> 项目暂未提供 Dockerfile，以下为建议方案。

**后端 Dockerfile** (`apps/server/Dockerfile`):

```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
RUN pnpm install --frozen-lockfile --filter=server
COPY apps/server/ ./apps/server/
RUN pnpm build --filter=server
EXPOSE 6001
CMD ["pnpm", "start:prod", "--filter=server"]
```

**前端 Dockerfile** (`apps/web/Dockerfile`):

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile --filter=web
COPY apps/web/ ./apps/web/
RUN pnpm build --filter=web

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/web/.next/standalone ./apps/web/
EXPOSE 6002
CMD ["node", "apps/web/server.js"]
```

**docker-compose.yml** (项目根目录):

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: openviking_admin
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASS}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  server:
    build: ./apps/server
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: postgres
      DB_PASS: ${DB_PASS}
      DB_NAME: openviking_admin
      JWT_SECRET: ${JWT_SECRET}
      OV_BASE_URL: ${OV_BASE_URL}
      OV_API_KEY: ${OV_API_KEY}
      FRONTEND_URL: http://localhost:6002
      PORT: 6001
      NODE_ENV: production
    depends_on:
      - postgres
    ports:
      - "6001:6001"

  web:
    build: ./apps/web
    environment:
      BACKEND_URL: http://server:6001
      NEXT_PUBLIC_APP_NAME: OpenViking Admin
    depends_on:
      - server
    ports:
      - "6002:6002"

volumes:
  pgdata:
```

### 2.4 环境变量安全

- **JWT_SECRET**: 生产环境必须使用至少 32 字符的随机字符串，严禁使用默认值
- **ENCRYPTION_KEY**: 用于 AES-256-CBC 加密集成凭证，必须使用 32 字节密钥
- **OV_API_KEY**: OpenViking 引擎的 API 密钥，切勿泄露
- 所有 `.env` 文件必须加入 `.gitignore`，仅提交 `.env.example`

---

## 3. 数据库迁移

项目使用 TypeORM 迁移系统，包含 3 个初始迁移：

```bash
cd apps/server

# 查看迁移状态
pnpm typeorm migration:show

# 执行所有待执行迁移
pnpm typeorm migration:run -d src/data-source.ts

# 回滚最近一次迁移
pnpm typeorm migration:revert -d src/data-source.ts
```

| 迁移 | 说明 |
|------|------|
| `InitSchema` | 创建核心表 (users, knowledge_bases, import_tasks, search_logs, audit_logs) + 初始管理员 |
| `AddMissingTables` | 创建 tenants, knowledge_nodes, system_configs 表 |
| `FixSchemaInconsistencies` | 添加 SSO 字段、隔离等级字段、修复列类型 |

> **注意**: `integrations` 和 `user_mcp_keys` 表目前依赖 TypeORM `synchronize: true` 自动建表，生产环境建议补充正式迁移。

---

## 4. 反向代理配置

### Nginx 示例

```nginx
server {
    listen 80;
    server_name openviking.example.com;

    # 前端
    location / {
        proxy_pass http://127.0.0.1:6002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://127.0.0.1:6001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # MCP SSE 需要长连接支持
    location /api/mcp/sse {
        proxy_pass http://127.0.0.1:6001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

---

## 5. 健康检查

```bash
curl http://localhost:6001/api/system/health
```

预期响应：
```json
{
  "ok": true,
  "openviking": { "status": "connected" },
  "dbPool": { "total": 10, "idle": 8, "active": 2 }
}
```