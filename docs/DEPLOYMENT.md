# 部署指南

本指南只保留当前仓库已经落地并验证过的生产部署资产，不再展示过期示例。

## 部署资产

- 根目录 `Dockerfile.server`：后端生产镜像
- 根目录 `Dockerfile.web`：前端生产镜像
- 根目录 `docker-compose.yml`：单机生产编排基线
- `.github/workflows/ci.yml`：install、typecheck、lint、test、docs/env check
- `scripts/check-env-example.mjs`：校验后端 `.env.example` 是否覆盖关键变量

## 生产前置条件

| 组件 | 要求 |
|------|------|
| Node.js / pnpm | 本地构建或非容器部署时需要 |
| PostgreSQL 14+ | 必须启用 `uuid-ossp` |
| OpenViking | 必须可访问 `/health` |
| 反向代理 | 推荐 Nginx / Ingress，负责 TLS 与外网入口 |

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

FRONTEND_URL=https://admin.example.com
PORT=6001
NODE_ENV=production
DB_SYNCHRONIZE=false

CAPABILITY_RATE_LIMIT_STORE_DRIVER=redis
CAPABILITY_RATE_LIMIT_REDIS_URL=redis://redis:6379/0
```

生产启动时，后端会直接阻断以下危险配置：

- `DB_SYNCHRONIZE=true`
- `JWT_SECRET` 缺失、长度不足或仍是占位值
- `ENCRYPTION_KEY` 缺失、长度不足或仍是占位值
- `FRONTEND_URL` 仍是 `localhost / 127.0.0.1 / example.com`
- `OV_BASE_URL / OV_API_KEY` 仍是占位值

## 数据库准备

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
- [ ] `DB_SYNCHRONIZE=false`，且已执行 `pnpm migration:run`
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
