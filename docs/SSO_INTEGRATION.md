# SSO 集成指南

OpenViking Admin 支持四种企业 SSO 认证方式，采用 Provider 适配器模式统一管理。

---

## SSO 架构概览

```
用户点击 SSO 登录
    ↓
GET /api/auth/sso/redirect/:tenantId/:type
    ↓
SSOPortalService 路由到对应 Provider
    ↓
第三方认证页面（OAuth2 / LDAP Bind）
    ↓
GET /api/auth/sso/callback/:tenantId/:type?code=xxx
    ↓
SSOPortalService.authenticate() → 获取 SSOUser
    ↓
JIT Provisioning: 自动创建/更新本地用户（默认角色 tenant_viewer）
    ↓
SsoTicketService.create() → 生成一次性 ticket（60 秒过期）
    ↓
302 重定向到 /login?sso_ticket=xxx
    ↓
POST /api/auth/sso/exchange → 返回 JWT Token
```

---

## 1. 飞书 SSO

### 前置准备

1. 在飞书开放平台创建企业自建应用
2. 开启「网页授权」能力
3. 配置重定向 URL: `http://your-domain/api/auth/sso/callback/:tenantId/feishu`

### 集成配置

在 OpenViking Admin 中创建 `feishu` 类型集成：

```json
{
  "name": "飞书企业登录",
  "type": "feishu",
  "credentials": {
    "appId": "cli_xxxxxxxx",
    "appSecret": "your_app_secret"
  },
  "active": true
}
```

### 认证流程

- **重定向 URL**: `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id={appId}&redirect_uri={callbackUrl}`
- **Token 端点**: `POST https://open.feishu.cn/open-apis/authen/v1/access_token`
- **用户信息**: 从飞书 API 获取 `open_id`, `name`, `email`

### JIT Provisioning

首次登录自动创建用户：
- `username`: 飞书 `name` 字段
- `ssoId`: 飞书 `open_id`
- `provider`: `feishu`
- `role`: `tenant_viewer`（默认）

---

## 2. 钉钉 SSO

### 前置准备

1. 在钉钉开放平台创建企业内部应用
2. 开启「登录」能力
3. 配置回调 URL: `http://your-domain/api/auth/sso/callback/:tenantId/dingtalk`

### 集成配置

```json
{
  "name": "钉钉企业登录",
  "type": "dingtalk",
  "credentials": {
    "appId": "ding_app_key",
    "appSecret": "ding_app_secret"
  },
  "active": true
}
```

### 认证流程

- **Token 端点**: `GET https://oapi.dingtalk.com/gettoken?appkey={appId}&appsecret={appSecret}`
- **用户信息端点**: `POST https://oapi.dingtalk.com/topapi/v2/user/getuserinfo`
- **用户详情**: 通过 `userid` 获取姓名、邮箱等

---

## 3. OIDC / Keycloak SSO

### 前置准备

1. 在 Keycloak 中创建 Realm 和 Client
2. Client 配置:
   - Valid Redirect URIs: `http://your-domain/api/auth/sso/callback/:tenantId/oidc`
   - Web Origins: `http://your-domain`
   - Client Protocol: `openid-connect`

### 集成配置

```json
{
  "name": "Keycloak 企业登录",
  "type": "oidc",
  "credentials": {
    "issuer": "https://keycloak.example.com/realms/acme",
    "clientId": "openviking-client",
    "clientSecret": "your_client_secret"
  },
  "active": true
}
```

### 认证流程

- **授权端点**: `{issuer}/protocol/openid-connect/auth`
- **Token 端点**: `{issuer}/protocol/openid-connect/token`
- **UserInfo 端点**: `{issuer}/protocol/openid-connect/userinfo`
- **标准 OAuth2 authorization_code 流程**

### JIT Provisioning

- `username`: OIDC `preferred_username` 或 `name`
- `ssoId`: OIDC `sub` 字段
- `email`: OIDC `email` 字段

---

## 4. LDAP SSO

### 前置准备

1. 确保 LDAP 服务器可访问
2. 准备管理员绑定凭证（用于搜索用户 DN）

### 集成配置

```json
{
  "name": "LDAP 企业登录",
  "type": "ldap",
  "credentials": {
    "url": "ldap://ldap.example.com:389",
    "baseDN": "dc=example,dc=com",
    "bindDN": "cn=admin,dc=example,dc=com",
    "bindPassword": "admin_password"
  },
  "active": true
}
```

### 认证流程

LDAP 采用直接绑定验证（非 OAuth 流程）：

1. 使用 `bindDN` / `bindPassword` 建立管理员连接
2. 根据 `username` 搜索用户完整 DN
3. 使用用户 DN + `password` 重新 bind 验证
4. 验证成功后提取用户属性

> **注意**: LDAP Provider 当前为模拟实现，生产环境需安装 `ldapjs` 或 `activedirectory` 库并完善绑定逻辑。

---

## SSO Ticket 交换机制

SSO 回调成功后，系统生成一次性 ticket：

| 属性 | 值 | 说明 |
|------|-----|------|
| 存储方式 | 内存 Map | `Map<ticket, { payload, expiresAt }>` |
| 过期时间 | 60 秒 | `Date.now() + 60_000` |
| 一次性使用 | 是 | `consume()` 后立即删除 |
| 交换端点 | `POST /api/auth/sso/exchange` | 前端用 ticket 换取 JWT |

---

## 前端集成

登录页 (`/login`) 自动检测租户可用的 SSO 方式：

1. 用户输入租户标识后，调用 `GET /api/tenants/check-auth/:code`
2. 根据返回结果渲染对应的 SSO 登录按钮
3. 点击按钮跳转到 `GET /api/auth/sso/redirect/:tenantId/:type`
4. SSO 回调后页面接收 `sso_ticket` 参数
5. 自动调用 `POST /api/auth/sso/exchange` 完成登录

---

## 安全注意事项

- 所有 `credentials` 中的敏感字段使用 AES-256-CBC 加密存储
- 返回前端时自动脱敏（`appSecret`, `clientSecret`, `bindPassword` 显示为 `********`）
- SSO Ticket 60 秒过期且一次性使用，防止重放攻击
- JIT 创建的用户默认为 `tenant_viewer` 角色，需管理员手动提权
