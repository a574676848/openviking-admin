# 部署指南

本指南只保留当前仓库已经落地并验证过的生产部署资产，不再展示过期示例。

## 部署资产

- 根目录 `Dockerfile.server`：后端生产镜像
- 根目录 `Dockerfile.web`：前端生产镜像
- 根目录 `docker-compose.yml`：单机生产编排基线
- `scripts/docker-db-migrate-init.ps1`：Windows PowerShell 环境下的一键建库、增量迁移与基础数据初始化脚本
- `scripts/docker-db-migrate-init.sh`：Linux / macOS 环境下的一键建库、增量迁移与基础数据初始化脚本
- `scripts/db-migrate.env.example`：数据库迁移脚本配置模板，真实配置应写入本地 ignored 文件或环境变量
- `.github/workflows/ci.yml`：install、typecheck、lint、test、docs/env check
- `scripts/check-env-example.mjs`：校验后端 `.env.example` 是否覆盖关键变量

生产镜像仅在构建期使用 `pnpm@8.15.9` 安装依赖和构建产物；容器运行期直接通过 `node` 启动已构建应用，不再依赖 Corepack 动态下载包管理器。

## 生产前置条件

| 组件           | 要求                                      |
| -------------- | ----------------------------------------- |
| Node.js / pnpm | 本地构建或非容器部署时需要                |
| PostgreSQL 14+ | 必须启用 `uuid-ossp`                      |
| OpenViking     | 必须可访问 `/health`                      |
| 反向代理       | 推荐 Nginx / Ingress，负责 TLS 与外网入口 |

## 关键环境变量

后端最少必须配置：

```env
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASS=replace_with_real_password
DB_NAME=openviking_admin

JWT_SECRET=replace_with_random_string_at_least_32_chars
ENCRYPTION_KEY=replace_with_random_string_at_least_32_chars

OV_BASE_URL=https://ov.example.internal
OV_API_KEY=replace_with_real_ov_api_key
OV_ACCOUNT=default
OV_USER=admin

FRONTEND_URL=https://admin.example.com
PORT=6001
NODE_ENV=production
DB_SYNCHRONIZE=false
LOCAL_IMPORT_UPLOAD_DIR=/data/openviking/import-uploads
LOCAL_IMPORT_KEEP_FILES_AFTER_DONE=false

CAPABILITY_RATE_LIMIT_STORE_DRIVER=redis
CAPABILITY_RATE_LIMIT_REDIS_URL=redis://redis:6379/0
```

生产启动时，后端会直接阻断以下危险配置：

- `DB_SYNCHRONIZE=true`
- `JWT_SECRET` 缺失、长度不足或仍是占位值
- `ENCRYPTION_KEY` 缺失、长度不足或仍是占位值
- `FRONTEND_URL` 仍是 `localhost / 127.0.0.1 / example.com`
- `OV_BASE_URL / OV_API_KEY` 仍是占位值
- `LOCAL_IMPORT_UPLOAD_DIR` 缺失、仍是占位路径或不是绝对路径

## 数据库准备

### Docker 一键初始化

已使用 Docker 部署时，推荐直接使用脚本完成建库、启用扩展、执行增量 migration 和基础账号兜底初始化。脚本不保存真实数据库地址、用户名和密码，敏感信息通过环境变量或本地 ignored 配置文件提供。

```powershell
$env:OPENVIKING_DB_HOST="postgres.example.internal"
$env:OPENVIKING_DB_USER="openviking_admin"
$env:OPENVIKING_DB_PASS="replace_with_real_password"
$env:OPENVIKING_DB_NAME="openviking_admin"
.\scripts\docker-db-migrate-init.ps1
```

Linux / macOS：

```bash
cp scripts/db-migrate.env.example scripts/db-migrate.local.env
vim scripts/db-migrate.local.env
chmod +x scripts/docker-db-migrate-init.sh
./scripts/docker-db-migrate-init.sh
```

`scripts/db-migrate.local.env` 和 `scripts/db-migrate.local.ps1` 已加入 `.gitignore`，不要提交真实连接信息。PowerShell 如需长期保存本机配置，可创建 `scripts/db-migrate.local.ps1`：

```powershell
$DbHost = "postgres.example.internal"
$DbUser = "openviking_admin"
$DbPassword = "replace_with_real_password"
$DbName = "openviking_admin"
```

脚本默认使用本机 `pnpm` 执行 `pnpm --filter server run migration:run`，避免 Docker 镜像构建拖慢初始化；重复执行时 TypeORM 只会执行尚未落库的 migration。若部署机没有 Node.js / pnpm，可设置 `OPENVIKING_MIGRATION_RUNNER=docker-image`，并在需要自动构建镜像时设置 `OPENVIKING_BUILD_SERVER_IMAGE=true`。

脚本不会覆盖已有平台管理员。若平台 `admin` 不存在，会按初始化 migration 的默认值补建：

```text
username: admin
password: Admin@2026
```

首次登录后必须立即修改默认密码。

### 手工初始化

```sql
CREATE DATABASE openviking_admin;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
GRANT CREATE ON DATABASE openviking_admin TO postgres;
```

迁移执行：

```bash
cd apps/server
pnpm migration:run
```

生产环境禁止依赖 `TypeORM synchronize` 自动建表。

## Docker Compose 启动

根目录准备 `.env`，至少包含：

```env
DB_NAME=openviking_admin
DB_USER=postgres
DB_PASS=replace_with_real_password
JWT_SECRET=replace_with_random_string_at_least_32_chars
ENCRYPTION_KEY=replace_with_random_string_at_least_32_chars
OV_BASE_URL=https://ov.example.internal
OV_API_KEY=replace_with_real_ov_api_key
FRONTEND_URL=https://admin.example.com
BACKEND_URL=http://server:6001
LOCAL_IMPORT_UPLOAD_DIR=/data/openviking/import-uploads
WEBDAV_ACCESS_LOG_VERBOSE=false
CAPABILITY_RATE_LIMIT_STORE_DRIVER=redis
CAPABILITY_RATE_LIMIT_REDIS_URL=redis://redis:6379/0
```

启动：

```bash
docker compose --profile redis up -d --build
```

说明：

- `postgres` 默认始终启动
- `redis` 放在 `redis` profile 下，生产多实例部署时应启用
- `server` 会等待 `postgres` 健康后再启动
- `web` 镜像构建期不读取 `BACKEND_URL`；容器运行期由 Next Route Handler 将同源 `/api/*` 请求代理到 `BACKEND_URL`
- 排查 Obsidian、Remotely Save 等 WebDAV 客户端连接问题时，可临时设置 `WEBDAV_ACCESS_LOG_VERBOSE=true` 并重启 `server`，让成功和失败请求都输出脱敏明细日志

## 反向代理要求

### Nginx 最低要求

```nginx
server {
    listen 80;
    server_name admin.example.com;

    location / {
        proxy_pass http://127.0.0.1:6002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:6001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/v1/mcp/sse {
        proxy_pass http://127.0.0.1:6001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

## 部署 Checklist

- [ ] `JWT_SECRET` 已替换为 32+ 位随机字符串
- [ ] `ENCRYPTION_KEY` 已替换为 32+ 位随机字符串
- [ ] `FRONTEND_URL` 已改为真实生产域名，CORS 不再使用 localhost
- [ ] `DB_SYNCHRONIZE=false`，且已通过 `scripts/docker-db-migrate-init.ps1` / `scripts/docker-db-migrate-init.sh` 或 `pnpm migration:run` 完成迁移
- [ ] `LOCAL_IMPORT_UPLOAD_DIR` 已配置为 Admin 服务可写的绝对路径
- [ ] PostgreSQL 已开启持久化备份策略
- [ ] 应用日志已接入宿主机日志采集或容器日志平台
- [ ] OpenViking `OV_BASE_URL` / `OV_API_KEY` 已替换为真实生产配置
- [ ] 若为多实例部署，`CAPABILITY_RATE_LIMIT_STORE_DRIVER=redis` 已启用，并验证 Redis 持久化
- [ ] 反向代理已启用 TLS，并对 `/api/v1/mcp/sse` 放开长连接配置
- [ ] 管理员账号已重置默认密码

## 干净环境实装验证

完成部署后，至少执行一次以下验证：

1. 打开前端首页，确认静态资源与登录页可访问。
2. 使用管理员账号登录，确认浏览器对 `/api/v1/*` 的请求返回正常。
3. 执行 `pnpm --filter server run migration:show` 或查看迁移表，确认没有未执行迁移。
4. 先做匿名探针检查：

```bash
curl http://localhost:6001/api/v1/healthz
curl http://localhost:6001/api/v1/readyz
```

5. 再从应用侧验证受保护的诊断健康接口。
   `GET /api/v1/system/health` 仍是管理员诊断接口，应使用管理员 token 调用：

```bash
curl -H "Authorization: Bearer <admin-jwt>" \
  http://localhost:6001/api/v1/system/health
```

6. 若启用 Redis 限流存储，重启 `server` 容器后再次触发 capability 请求，确认限流 bucket 不会因单实例重启丢失。

## 常见问题

- 启动即报 `生产环境 JWT_SECRET 不安全`
  说明仍在使用占位值或长度不足。
- 启动即报 `生产环境 FRONTEND_URL 不能使用 localhost`
  说明 CORS 仍指向开发地址。
- 启动即报 `生产环境 OpenViking 连接配置仍是占位值`
  说明 `OV_BASE_URL / OV_API_KEY` 未替换。
