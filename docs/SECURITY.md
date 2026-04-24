# 安全策略 (Security Policy)

本文档描述 OpenViking Admin 的安全架构、威胁模型和最佳实践。

---

## 安全架构概览

### 认证层

| 机制 | 实现 | 说明 |
|------|------|------|
| 本地认证 | bcrypt + JWT (HS256) | 密码哈希存储，Token 2 小时过期 |
| SSO 认证 | OAuth2 / LDAP Bind | 飞书/钉钉/OIDC/LDAP 四种 Provider |
| SSO Ticket | 内存 Map, 60 秒过期 | 一次性使用，防止重放攻击 |
| MCP 认证 | API Key 查询参数 | `ov-sk-xxx` 格式，绑定用户和租户 |

### 授权层

| 机制 | 实现 | 说明 |
|------|------|------|
| 角色守卫 | `RolesGuard` | 基于 `@Roles()` 装饰器声明式授权 |
| 租户守卫 | `TenantGuard` | 根据隔离等级动态路由数据库连接 |
| ACL 过滤 | 知识节点 `acl` 字段 | 检索时前置过滤用户可访问的 URI |

### 数据保护层

| 机制 | 实现 | 说明 |
|------|------|------|
| 多租户隔离 | 三级隔离 (Small/Medium/Large) | 字段级 → Schema 级 → 独立数据库 |
| 凭证加密 | AES-256-CBC | 集成凭证加密存储，IV + 密文分离 |
| 敏感字段脱敏 | 返回前端自动替换为 `********` | `appSecret`, `clientSecret`, `bindPassword`, `token` |
| 连接回收 | `TenantCleanupInterceptor` | RxJS `finalize` 确保 QueryRunner 释放 |

---

## 威胁模型

### 1. 跨租户数据泄露

**威胁**: 租户 A 的用户访问租户 B 的数据。

**防御**:
- `TenantGuard` 在每个请求中根据用户身份创建独立的 `QueryRunner`
- MEDIUM 隔离通过 `SET search_path` 切换 Schema
- LARGE 隔离通过独立 `DataSource` 连接池
- MCP 调用强制注入租户 Scope (`viking://resources/tenants/{tenantId}/`)

### 2. 权限提升

**威胁**: 低权限用户提升为高权限角色。

**防御**:
- `RolesGuard` 全局注册，所有受保护端点声明所需角色
- Users CRUD 内置提权检测：`tenant_admin` 不能创建 `super_admin`
- JWT Payload 中的 `role` 字段由服务端签发，客户端不可篡改

### 3. 凭证泄露

**威胁**: 集成凭证 (飞书 appSecret, LDAP bindPassword) 被窃取。

**防御**:
- 所有 `credentials` JSONB 字段使用 AES-256-CBC 加密存储
- 返回前端时自动脱敏
- `ENCRYPTION_KEY` 环境变量不应提交版本控制

### 4. JWT Token 劫持

**威胁**: 攻击者截获 JWT Token 并冒充用户。

**防御**:
- Token 2 小时自动过期
- Token 存储在 `sessionStorage` (非 `localStorage`)，减少 XSS 持久化风险
- 401 响应自动清除 Token 并跳转登录

### 5. SSO 重放攻击

**威胁**: 攻击者截获 SSO Ticket 并重复使用。

**防御**:
- Ticket 60 秒过期
- 一次性使用，`consume()` 后立即从内存删除
- Ticket 通过 `crypto.randomUUID()` 生成，不可预测

---

## 安全最佳实践

### 生产环境必须执行

1. **修改 JWT_SECRET**: 使用至少 32 字符的随机字符串
   ```bash
   # 生成随机密钥
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **设置 ENCRYPTION_KEY**: 使用 32 字节 AES 密钥
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **修改 seed-admin.js**: 移除硬编码的数据库连接参数，使用环境变量

4. **HTTPS**: 生产环境必须启用 HTTPS，JWT Token 在 HTTP 下可被中间人截获

5. **CORS**: `FRONTEND_URL` 应设置为实际前端域名，不要使用 `*`

6. **数据库权限**: PostgreSQL 用户不应拥有 `SUPERUSER` 权限，仅需 `CREATE` 权限 (用于 Schema 初始化)

7. **日志脱敏**: 审计日志不应记录密码、Token、API Key 等敏感信息

### 建议执行

1. **Rate Limiting**: 对 `/api/auth/login` 端点添加速率限制，防止暴力破解
2. **CSRF 保护**: 如果使用 Cookie 存储 Token，需启用 CSRF 保护
3. **Content Security Policy**: 配置 CSP 头防止 XSS 攻击
4. **依赖审计**: 定期运行 `pnpm audit` 检查依赖漏洞
5. **MCP Key 轮换**: 定期轮换 MCP API Key，废弃不再使用的 Key

---

## 已知安全限制

| 限制 | 说明 | 缓解措施 |
|------|------|----------|
| SSO Ticket 内存存储 | 服务重启后 Ticket 丢失 | 60 秒过期，影响范围有限 |
| LDAP Provider 模拟实现 | 未使用真实 LDAP 库 | 生产环境需安装 `ldapjs` |
| 飞书 Provider 硬编码 Token | `app_access_token` 为 mock | 生产环境需实现完整 OAuth 流程 |
| TypeORM synchronize | integrations/user_mcp_keys 依赖自动建表 | 生产环境应关闭 synchronize，使用迁移 |
| seed-admin.js 硬编码连接串 | 包含明文数据库密码 | 仅用于开发环境，生产需修改 |

---

## 报告安全漏洞

如发现安全漏洞，请通过以下方式联系：

- 邮箱: devnexus.chat@gmail.com
- GitHub: [Issue Tracker](https://github.com/a574676848/openviking-admin/issues)

请勿在公开 Issue 中披露敏感安全信息。