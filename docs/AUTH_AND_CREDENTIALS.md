# 认证与凭证

OpenViking Admin 将用户登录态、能力调用凭证和机器凭证分层管理。客户端应根据调用方式选择最小可用凭证，而不是长期复用用户密码或 JWT。

## 凭证类型

| 凭证 | 获取方式 | 适用入口 | 说明 |
|------|------|------|------|
| JWT access token | `/api/v1/auth/login`、`/api/v1/auth/sso/exchange` | Web、HTTP、CLI 登录态 | 用户身份凭证，默认短期有效 |
| JWT refresh token | `/api/v1/auth/login`、`/api/v1/auth/sso/exchange` | Web、CLI | 仅用于 `/api/v1/auth/refresh`，不直接调用 capability |
| Capability access token | `/api/v1/auth/token/exchange` | HTTP、Skill、服务集成 | 面向能力调用的短中期 token |
| Session key | `/api/v1/auth/session/exchange` | MCP、短会话 Agent | 更短生命周期，适合会话型连接 |
| API key | `/api/v1/capability/keys` 或 `/api/v1/auth/client-credentials` | CLI、MCP、自动化任务 | 可吊销机器凭证，适合长期配置 |

## 推荐链路

### Web 控制台或企业 SSO

```text
SSO Provider / 本地登录
  -> accessToken + refreshToken
  -> 浏览器调用业务接口
  -> 只有需要能力调用时才换取能力凭证
```

### CLI

```text
ova auth login
  -> 在 profile 中缓存 accessToken + refreshToken
  -> 调用能力前自动刷新登录态
  -> 按需换取 token / session key / API key
```

### HTTP 集成

```text
登录或 SSO 换证
  -> POST /api/v1/auth/token/exchange
  -> call /api/v1/knowledge/* or /api/v1/resources*
```

### MCP 客户端

```text
登录态或 CLI profile
  -> 签发 API key 或 session key
  -> 配置 /api/v1/mcp/sse?key=... 或 /api/v1/mcp/sse?sessionKey=...
```

### Skill 或 Agent

```text
Agent 运行环境
  -> 如果存在 ova profile，优先使用 CLI
  -> 否则使用 capability access token 或 API key 走 HTTP
  -> 保留 traceId
```

## 换证接口

### GET /api/v1/auth/credential-options

返回当前用户可用的换证方式、推荐入口、默认 TTL 以及允许的有效期选项。

### POST /api/v1/auth/token/exchange

需要 JWT。签发 capability access token，可通过 `ttlSeconds` 从服务端给出的预设列表中选择有效期。

### POST /api/v1/auth/session/exchange

需要 JWT。签发短期 session key，可通过 `ttlSeconds` 从服务端给出的预设列表中选择有效期。

### POST /api/v1/capability/keys

需要 JWT。凭证中心为当前租户内指定用户签发可吊销 API key，可通过 `ttlSeconds` 选择 7 天、30 天、90 天、180 天或长期有效。

请求体：

```json
{
  "userId": "user-id",
  "name": "ci-bot",
  "ttlSeconds": 2592000
}
```

### GET /api/v1/capability/keys

需要 JWT。返回当前租户内全部 API key，凭证会携带绑定用户 ID。

### DELETE /api/v1/capability/keys/:id

需要 JWT。吊销当前租户内指定 API key。

### POST /api/v1/auth/client-credentials

需要 JWT。为当前登录用户签发可吊销 API key，可通过 `ttlSeconds` 选择 7 天、30 天、90 天、180 天或长期有效。

请求体：

```json
{
  "name": "ci-bot",
  "ttlSeconds": 2592000
}
```

## 生命周期

| 凭证 | 默认 TTL | 生命周期建议 |
|------|------|------|
| JWT access token | 2 小时 | 自动刷新，不长期持久化到不可信环境 |
| JWT refresh token | 7 天 | 只存在浏览器安全存储或 CLI profile |
| Capability access token | 2 小时 | 可选 30 分钟、1 小时、2 小时、8 小时、24 小时，默认 2 小时 |
| Session key | 30 分钟 | 可选 15 分钟、30 分钟、1 小时、8 小时，默认 30 分钟 |
| API key | 30 天 | 可选 7 天、30 天、90 天、180 天、长期有效，默认 30 天 |

## 权限边界

- Capability 调用必须具备租户上下文。
- 超管如果没有切换到租户视角，不能直接调用租户 capability。
- 高风险 capability 通过 `minimumRole` 声明最低角色。
- 访问租户范围外 URI 时，服务端返回显式拒绝。
- API key 与用户和租户绑定，不能跨租户使用。
- 凭证中心的 API key 列表、创建和吊销接口使用 `/api/v1/capability/keys`，MCP 路径仅保留 SSE 与 JSON-RPC 协议入口。

## 客户端存储建议

| 客户端 | 建议 |
|------|------|
| Web | 使用浏览器会话存储或更安全的服务端 session 模式 |
| CLI | 使用 `~/.openviking/ova/auth.json` profile，后续可替换为系统 keychain |
| MCP Desktop | 使用桌面客户端配置文件保存 API key，优先使用可吊销 key |
| CI | 使用环境变量或 secret manager 注入 API key |
| Skill | 不在 Skill 文件中硬编码凭证，由宿主环境注入 |
