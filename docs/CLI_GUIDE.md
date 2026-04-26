# OVA CLI 指南

`ova` 是 OpenViking Admin 的官方命令行入口。它是一个独立 CLI 包，用于在开发者机器、CI、运维终端和 Agent 宿主环境中调用能力平台。

CLI 只作为 adapter 存在：它调用公开 HTTP capability 接口，不在本地复制业务规则。

## 安装

仓内开发：

```bash
npm run ova -- <group> <command> [options]
```

全局安装：

```bash
npm install -g @openviking-admin/ova-cli
ova <group> <command> [options]
```

## 登录

账号密码登录：

```bash
ova auth login \
  --server http://localhost:6001 \
  --username admin \
  --password admin123 \
  --tenant-code acme
```

SSO ticket 登录：

```bash
ova auth sso --ticket <sso-ticket>
```

查看当前身份：

```bash
ova auth whoami
ova auth status
```

CLI 会把登录态保存到：

```text
~/.openviking/ova/auth.json
```

状态文件采用多 profile 结构。当 `accessToken` 过期或接近过期时，CLI 会自动调用 `/api/v1/auth/refresh`。如果 `refreshToken` 也失效，需要重新登录。

## Profile 管理

Profile 用于隔离本地、测试、生产等环境。

```bash
ova auth login \
  --server http://localhost:6001 \
  --username admin \
  --password admin123 \
  --tenant-code acme \
  --profile dev

ova config set --server https://prod.example.com --profile prod
ova config use --profile prod
ova config show
```

规则：

- `--profile <name>` 覆盖当前命令使用的 profile。
- `ova config use --profile <name>` 切换默认 profile。
- 未显式指定时使用状态文件里的 `currentProfile`。

## 能力发现

```bash
ova capabilities list
ova capabilities inspect --id knowledge.search
```

`capabilities list` 会读取 `/api/v1/capabilities`，因此 CLI 命令树和服务端 capability catalog 保持一致。

## 能力调用

语义搜索：

```bash
ova knowledge search --query "多租户隔离" --limit 5 --score-threshold 0.5
```

文本匹配：

```bash
ova knowledge grep \
  --pattern "tenant" \
  --uri "viking://resources/tenants/acme/" \
  --case-insensitive true
```

资源列表：

```bash
ova resources list --uri "viking://resources/tenants/acme/"
```

资源树：

```bash
ova resources tree --uri "viking://resources/tenants/acme/" --depth 2
```

## 换证

查看服务端建议的凭证入口：

```bash
ova auth credential-options
```

签发 capability access token：

```bash
ova auth token-exchange --output json
ova auth token-exchange --save
```

签发短期 session key：

```bash
ova auth session-exchange --output json
ova auth session-exchange --save
```

签发 API key：

```bash
ova auth client-credentials --name ci-bot --output json
ova auth client-credentials --name ci-bot --save
```

默认行为：

- 派生凭证默认只输出，不覆盖 JWT 登录态。
- 只有显式传入 `--save` 时，CLI 才会把派生凭证写入当前 profile。
- `logout` 只清理本地 profile，不删除服务端已签发的 API key。

## 输出模式

| 模式 | 参数 | 适用场景 |
|------|------|------|
| text | 默认 | 人类阅读 |
| json | `--output json` | 脚本解析、调试完整响应 |
| jsonl | `--output jsonl` | Agent、日志管道、批处理 |

示例：

```bash
ova knowledge search --query "权限边界" --output json
ova doctor --output jsonl
```

所有能力命令都会输出或保留 `traceId`，便于和服务端日志、审计日志、OpenViking 下游请求关联。

## 诊断命令

```bash
ova doctor
ova doctor --output json
ova doctor --output jsonl
```

`doctor` 检查：

- 当前 profile 是否存在本地凭证。
- JWT 和 refresh token 是否存在、是否过期。
- `/api/v1/capabilities` 是否可达。
- 已登录场景下 `/api/v1/auth/whoami` 是否可用。

## 命令参考

```text
ova auth login --server <url> --username <name> --password <password> --tenant-code <tenant>
ova auth sso --ticket <ticket>
ova auth whoami
ova auth status
ova auth credential-options
ova auth token-exchange [--save]
ova auth session-exchange [--save]
ova auth client-credentials --name <name> [--save]
ova auth logout
ova capabilities list
ova capabilities inspect --id <capability>
ova knowledge search --query <query> [--limit <n>] [--score-threshold <score>]
ova knowledge grep --pattern <pattern> [--uri <uri>] [--case-insensitive true]
ova resources list [--uri <uri>]
ova resources tree [--uri <uri>] [--depth <n>]
ova config show
ova config set --server <url>
ova config use --profile <name>
ova doctor
```

说明：
- CLI 命令本身保持英文；错误解释、修复建议和 `ova doctor` 诊断结果默认使用中文输出，便于中文团队直接排障。
