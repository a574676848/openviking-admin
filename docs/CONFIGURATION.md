# 配置参考 (Configuration Reference)

本文详细说明所有环境变量和系统配置项。

---

## 环境变量

### 后端 (`apps/server/.env`)

| 变量 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `DB_HOST` | string | `localhost` | 是 | PostgreSQL 主机地址 |
| `DB_PORT` | number | `5432` | 是 | PostgreSQL 端口 |
| `DB_USER` | string | `postgres` | 是 | PostgreSQL 用户名 |
| `DB_PASS` | string | — | 是 | PostgreSQL 密码 |
| `DB_NAME` | string | `openviking_admin` | 是 | 数据库名称 |
| `JWT_SECRET` | string | `ov-admin-secret-change-in-prod` | 是 | JWT 签名密钥，生产环境必须修改 |
| `ENCRYPTION_KEY` | string | `ov-default-key-32-chars-length-!!!` | 否 | AES-256-CBC 加密密钥，用于保护集成凭证。不足 32 字节自动填充 |
| `OV_BASE_URL` | string | `http://localhost:1933` | 是 | OpenViking 引擎地址 |
| `OV_API_KEY` | string | — | 是 | OpenViking API 密钥 |
| `OV_ACCOUNT` | string | `default` | 否 | OpenViking 默认账户 |
| `OV_USER` | string | `admin` | 否 | OpenViking 默认用户 |
| `FRONTEND_URL` | string | `http://localhost:6002` | 是 | 前端地址，用于 CORS 白名单 |
| `PORT` | number | `6001` | 否 | 后端监听端口 |
| `NODE_ENV` | string | `development` | 否 | 运行环境: `development` / `production` |

### 前端 (`apps/web/.env.local`)

| 变量 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `BACKEND_URL` | string | `http://localhost:6001` | 是 | 后端 API 地址 |
| `NEXT_PUBLIC_APP_NAME` | string | `OpenViking Admin` | 否 | 应用显示名称 |

---

## 系统配置 (`system_configs` 表)

通过 `SettingsService` 管理，支持全局配置和租户级覆盖。

| 配置键 | 类型 | 说明 | 作用范围 |
|--------|------|------|----------|
| `ov_base_url` | string | OpenViking 引擎地址（可被租户 ovConfig 覆盖） | 全局 + 租户覆盖 |
| `ov_api_key` | string | OpenViking API 密钥 | 全局 |
| `ov_account` | string | OpenViking 账户名 | 全局 |
| `ov_user` | string | OpenViking 用户名 | 全局 |
| `rerank_endpoint` | string | BGE-Rerank 服务地址（如 `http://rerank:8080/rerank`） | 全局 |
| `rerank_enabled` | boolean | 是否启用二阶段重排序 | 全局 |
| `rerank_timeout_ms` | number | Rerank 请求超时时间（默认 1500ms） | 全局 |

> `SettingsService.resolveOVConfig(tenantId)` 会合并全局配置和租户 `ovConfig` 覆盖，租户级配置优先。

---

## 租户配置 (`tenants` 表)

### 隔离等级 (`isolation_level`)

| 值 | 说明 | 数据库行为 |
|----|------|------------|
| `small` | 字段级逻辑隔离 | 所有租户共享 `public` schema，通过 `tenant_id` 字段过滤 |
| `medium` | Schema 级物理隔离 | 创建 `tenant_{id}` schema，`SET search_path` 切换 |
| `large` | 独立数据库隔离 | 动态创建独立 `DataSource` 连接池 |

### 独立数据库配置 (`db_config`，仅 `large` 等级)

```json
{
  "host": "db-acme.example.com",
  "port": 5432,
  "user": "acme_admin",
  "password": "encrypted_password",
  "database": "openviking_acme"
}
```

### 租户配额 (`quota`)

```json
{
  "maxDocs": 1000,
  "maxVectors": 100000
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `maxDocs` | number | 最大文档数量限制 |
| `maxVectors` | number | 最大向量数量限制 |

### 租户 OV 配置覆盖 (`ov_config`)

```json
{
  "baseUrl": "http://ov-acme.internal:1933",
  "apiKey": "tenant_specific_key"
}
```

---

## 集成配置 (`integrations` 表)

### 飞书 (`type: feishu`)

```json
{
  "credentials": {
    "appId": "cli_xxxxxxxx",
    "appSecret": "secret_xxxxxxxx"
  },
  "config": {
    "syncInterval": 3600
  }
}
```

### 钉钉 (`type: dingtalk`)

```json
{
  "credentials": {
    "appId": "ding_app_key",
    "appSecret": "ding_app_secret"
  }
}
```

### OIDC / Keycloak (`type: oidc`)

```json
{
  "credentials": {
    "issuer": "https://keycloak.example.com/realms/acme",
    "clientId": "openviking-client",
    "clientSecret": "client_secret_value"
  }
}
```

### LDAP (`type: ldap`)

```json
{
  "credentials": {
    "url": "ldap://ldap.example.com:389",
    "baseDN": "dc=example,dc=com",
    "bindDN": "cn=admin,dc=example,dc=com",
    "bindPassword": "admin_password"
  }
}
```

### Git (`type: github` / `gitlab`)

```json
{
  "credentials": {
    "token": "ghp_xxxxxxxx"
  },
  "config": {
    "branch": "main",
    "path": "/docs"
  }
}
```

> 所有 `credentials` 中的敏感字段（`appSecret`, `clientSecret`, `bindPassword`, `token`, `password`）在存储时使用 AES-256-CBC 加密，返回前端时自动脱敏为 `********`。

---

## 加密配置

| 参数 | 值 | 说明 |
|------|-----|------|
| 算法 | AES-256-CBC | 集成凭证加密 |
| 密钥来源 | `ENCRYPTION_KEY` 环境变量 | 不足 32 字节自动 `padEnd` 填充 |
| 存储格式 | `<iv_hex>:<encrypted_hex>` | IV 与密文以冒号分隔 |
| 解密容错 | 返回原值 | 兼容未加密的存量数据 |

---

## JWT 配置

| 参数 | 值 | 说明 |
|------|-----|------|
| 算法 | HS256 | HMAC SHA-256 |
| 过期时间 | 2 小时 | Token 有效期 |
| 密钥来源 | `JWT_SECRET` 环境变量 | 生产环境必须修改默认值 |
| Payload 字段 | `sub`, `username`, `role`, `tenantId`, `scope` | — |

---

## MCP SSE 配置

| 参数 | 值 | 说明 |
|------|-----|------|
| SSE 端点 | `/api/mcp/sse?key=<api_key>` | 长连接建立 |
| Message 端点 | `/api/mcp/message?sessionId=<id>&key=<api_key>` | JSON-RPC 请求 |
| API Key 格式 | `ov-sk-<random>` | 自动生成 |
| Key 绑定 | userId + tenantId | 强制注入租户 Scope |