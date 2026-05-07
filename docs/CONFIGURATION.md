# 配置参考

本文详细说明所有环境变量和系统配置项。

---

## 环境变量

### 后端 (`apps/server/.env`)

| 变量              | 类型    | 默认值                               | 必填 | 说明                                                                                      |
| ----------------- | ------- | ------------------------------------ | ---- | ----------------------------------------------------------------------------------------- |
| `DB_HOST`         | string  | `localhost`                          | 是   | PostgreSQL 主机地址                                                                       |
| `DB_PORT`         | number  | `5432`                               | 是   | PostgreSQL 端口                                                                           |
| `DB_USER`         | string  | `postgres`                           | 是   | PostgreSQL 用户名                                                                         |
| `DB_PASS`         | string  | —                                    | 是   | PostgreSQL 密码                                                                           |
| `DB_NAME`         | string  | `openviking_admin`                   | 是   | 数据库名称                                                                                |
| `JWT_SECRET`      | string  | `ov-admin-secret-change-in-prod`     | 是   | JWT 签名密钥，生产环境必须修改                                                            |
| `ENCRYPTION_KEY`  | string  | `ov-default-key-32-chars-length-!!!` | 否   | AES-256-CBC 加密密钥，用于保护集成凭证。不足 32 字节自动填充                              |
| `OV_BASE_URL`     | string  | —                                    | 否   | OpenViking 引擎地址，仅在数据库默认 OV 配置缺失时作为回退                                 |
| `OV_API_KEY`      | string  | —                                    | 否   | OpenViking API 密钥，仅在数据库默认 OV 配置缺失时作为回退                                 |
| `OV_ACCOUNT`      | string  | `default`                            | 否   | OpenViking 默认账户，仅在数据库默认 OV 配置缺失时作为回退                                 |
| `OV_USER`         | string  | —                                    | 否   | OpenViking 默认用户标识，使用 root key 调租户资源接口时必须配置                            |
| `RERANK_ENDPOINT` | string  | —                                    | 否   | 推荐填写完整 Rerank 地址，例如 `http://host:port/v1/rerank`，仅在数据库默认 OV 配置缺失时作为回退 |
| `RERANK_API_KEY`  | string  | —                                    | 否   | OpenAI 兼容 Rerank Bearer Token，仅在数据库默认 OV 配置缺失时作为回退                     |
| `RERANK_MODEL`    | string  | —                                    | 否   | Rerank 模型名称，仅在数据库默认 OV 配置缺失时作为回退                                     |
| `FRONTEND_URL`    | string  | `http://localhost:6002`              | 是   | 前端地址，用于 CORS 白名单                                                                |
| `PORT`            | number  | `6001`                               | 否   | 后端监听端口                                                                              |
| `NODE_ENV`        | string  | `development`                        | 否   | 运行环境: `development` / `production`                                                    |
| `WEBDAV_ACCESS_LOG_VERBOSE` | boolean | `false`                     | 否   | 是否输出所有 WebDAV 请求的脱敏明细日志；默认只在 WebDAV 请求失败时输出 `http.request.webdav` 事件 |
| `DB_SYNCHRONIZE`  | boolean | `false`                              | 否   | 是否允许 TypeORM 自动同步表结构。默认关闭；生产环境若设置为 `true` 会在启动期直接拒绝启动 |
| `LOCAL_IMPORT_UPLOAD_DIR` | string | `./storage/import-uploads` | 生产必填 | 本地文档上传暂存目录；Admin Worker 会读取该目录下的受控上传文件并转传 OpenViking `temp_upload` |
| `LOCAL_IMPORT_KEEP_FILES_AFTER_DONE` | boolean | `false` | 否 | 本地导入成功后是否保留暂存文件 |

开发环境启动策略：

- 当 `NODE_ENV=development` 时，Nest 启动会自动探测数据库状态；对于空库或已有 migration 历史的数据库，会自动执行未落库的 TypeORM migration。
- 当 `NODE_ENV=development` 且数据库里已经存在业务表、但 `migrations` 历史缺失时，会跳过自动迁移并输出警告，避免初始化 migration 与现存表结构撞表。
- 当 `NODE_ENV=production` 时，不会自动执行 migration，仍要求先显式执行迁移再启动服务。
- `DB_SYNCHRONIZE` 与 migration 是两套机制；常规开发应优先依赖 migration，不建议把自动同步表结构作为默认方案。

历史库基线对齐：

- 如果数据库里已经存在业务表，但 `migrations` 历史缺失或不完整，可执行 `pnpm --filter server migration:baseline`。
- 该命令会按当前库中的表与字段状态补登记 migration 记录，只写入 `migrations` 表，不会重放初始化建表 SQL。
- 基线对齐完成后，再执行 `pnpm --filter server migration:show` 或 `pnpm --filter server migration:run` 验证剩余 migration 状态。

### 前端 (`apps/web/.env.local`)

| 变量                   | 类型   | 默认值                  | 必填 | 说明          |
| ---------------------- | ------ | ----------------------- | ---- | ------------- |
| `BACKEND_URL`          | string | `http://localhost:6001` | 是   | 后端 API 地址 |
| `NEXT_PUBLIC_APP_NAME` | string | `OpenViking Admin`      | 否   | 应用显示名称  |

---

## 系统配置 (`system_configs` 表)

通过 `SettingsService` 管理，支持数据库默认配置和租户级覆盖。默认 OV 配置优先读取 `DEFAULT_OV_CONFIG`，缺失或字段为空时读取环境变量补齐，最后兼容旧版分散配置键。

| 配置键              | 类型        | 说明                                     | 作用范围 |
| ------------------- | ----------- | ---------------------------------------- | -------- |
| `DEFAULT_OV_CONFIG` | JSON string | 默认 OpenViking 连接配置，可整体加密存储 | 默认     |
| `ov.base_url`       | string      | 旧版 OpenViking 引擎地址，作为兼容回退   | 默认     |
| `ov.api_key`        | string      | 旧版 OpenViking API 密钥，作为兼容回退   | 默认     |
| `ov.account`        | string      | 旧版 OpenViking 账户名，作为兼容回退     | 默认     |
| `ov.user`           | string      | 旧版 OpenViking 用户标识，作为兼容回退   | 默认     |
| `rerank.endpoint`   | string      | OpenAI 兼容 Rerank Base URL，作为兼容回退 | 默认     |
| `rerank.api_key`    | string      | OpenAI 兼容 Rerank Bearer Token，作为兼容回退 | 默认  |
| `rerank.model`      | string      | Rerank 模型名称，作为兼容回退             | 默认     |

`DEFAULT_OV_CONFIG` 推荐结构：

```json
{
  "baseUrl": "http://ov-default.internal:1933",
  "apiKey": "default_key",
  "account": "default",
  "user": "admin",
  "rerankEndpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "rerankApiKey": "encrypted_rerank_key",
  "rerankModel": "qwen3-vl-rerank"
}
```

> `SettingsService.resolveOVConfig(tenantId)` 会先解析数据库默认配置，再用环境变量和旧版分散键补齐空字段，最后合并租户 `ovConfig`。租户自定义字段优先；租户未配置或字段为空时回退默认配置。租户 `ovConfig.apiKey` 与 `ovConfig.rerankApiKey` 在入库时加密，读取时会自动解密。

---

## 租户配置 (`tenants` 表)

### 核心字段约束

| 字段 | 说明 |
| ---- | ---- |
| `tenant_id` | 租户命名空间 ID，全局唯一，用于数据隔离与租户路由 |
| `status` | 租户启用状态，使用 `active` / `disabled` 表达是否可用 |
| `deleted_at` | 软删除时间；为空表示有效租户，非空表示该租户已被归档且默认查询不返回 |

### 隔离等级 (`isolation_level`)

| 值       | 说明              | 数据库行为                                              |
| -------- | ----------------- | ------------------------------------------------------- |
| `small`  | 字段级逻辑隔离    | 所有租户共享 `public` schema，通过 `tenant_id` 字段过滤 |
| `medium` | Schema 级物理隔离 | 业务表创建到 `tenant_{id}` schema，运行期通过 `SET search_path` 切换 |
| `large`  | 独立数据库隔离    | 业务表使用独立 `DataSource` 连接池，身份数据仍保留在公共控制平面 |

身份中心说明：

- `users`、登录密码、SSO 映射、角色归属统一保存在公共库，不会复制到租户 schema 或独立租户库。
- `medium` / `large` 隔离级别只影响知识库、知识树、导入任务、搜索日志、集成配置等业务数据。

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

| 字段         | 类型   | 说明             |
| ------------ | ------ | ---------------- |
| `maxDocs`    | number | 最大文档数量限制 |
| `maxVectors` | number | 最大向量数量限制 |

### 租户 OV 配置覆盖 (`ov_config`)

```json
{
  "baseUrl": "http://ov-acme.internal:1933",
  "apiKey": "tenant_specific_key",
  "account": "acme",
  "rerankEndpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "rerankApiKey": "tenant_rerank_key",
  "rerankModel": "qwen3-vl-rerank"
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
    "appSecret": "ding_app_secret",
    "operatorId": "union_id"
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
    "token": "ghp_xxxxxxxx",
    "username": "admin"
  },
  "config": {
    "branch": "main",
    "path": "/docs"
  }
}
```

`username` 主要用于自托管 Git 服务。`github.com` 保持 GitHub token URL；其他 Git host 会额外尝试 GitLab 兼容的同主机 fallback，避免私有服务跳转到 HTTP 或要求账号名时 clone 失败。

> 所有 `credentials` 中的敏感字段（`appSecret`, `clientSecret`, `bindPassword`, `token`, `password`）在存储时使用 AES-256-CBC 加密，返回前端时自动脱敏为 `********`。

---

## 加密配置

| 参数     | 值                         | 说明                           |
| -------- | -------------------------- | ------------------------------ |
| 算法     | AES-256-CBC                | 集成凭证加密                   |
| 密钥来源 | `ENCRYPTION_KEY` 环境变量  | 不足 32 字节自动 `padEnd` 填充 |
| 存储格式 | `<iv_hex>:<encrypted_hex>` | IV 与密文以冒号分隔            |
| 解密容错 | 返回原值                   | 兼容未加密的存量数据           |

---

## JWT 配置

| 参数         | 值                                             | 说明                   |
| ------------ | ---------------------------------------------- | ---------------------- |
| 算法         | HS256                                          | HMAC SHA-256           |
| 过期时间     | 2 小时                                         | Token 有效期           |
| 密钥来源     | `JWT_SECRET` 环境变量                          | 生产环境必须修改默认值 |
| Payload 字段 | `sub`, `username`, `role`, `tenantId`, `scope` | —                      |

---

## MCP SSE 配置

| 参数         | 值                                                 | 说明               |
| ------------ | -------------------------------------------------- | ------------------ |
| SSE 端点     | `/api/v1/mcp/sse?key=<api_key>`                    | 长连接建立         |
| Message 端点 | `/api/v1/mcp/message?sessionId=<id>&key=<api_key>` | JSON-RPC 请求      |
| API Key 格式 | `ov-sk-<random>`                                   | 自动生成           |
| Key 绑定     | userId + tenantId                                  | 强制注入租户 Scope |
