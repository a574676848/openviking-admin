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

一键安装或更新：

```bash
node scripts/install-ova-cli.mjs
```

Windows PowerShell：

```powershell
.\scripts\install-ova-cli.ps1
```

该脚本会执行全局安装或更新 `@openviking-admin/ova-cli`，随后自动运行：

```bash
ova bootstrap --path <repo>
```

也就是一次完成：

- 用户级 `setup`：写入 MCP 配置、安装全局 Skill。
- 仓库级 `init`：生成 capability 快照、落盘本地 Skill、向 `AGENTS.md` / `CLAUDE.md` 注入 OpenViking 调用规则。

如果只想安装 CLI 而不初始化环境，可直接使用 `npm install -g @openviking-admin/ova-cli`。

## 环境初始化

### `ova setup`

`setup` 负责用户级环境初始化，默认面向 `claude`、`cursor`、`codex` 三类客户端：

```bash
ova setup --server http://localhost:6001 --api-key <YOUR_API_KEY>
```

如果当前 profile 已有登录态，`setup` 也可以自动签发 MCP 所需凭证：

```bash
ova auth login --server http://localhost:6001 --username admin --password acme@123 --tenant-code acme
ova setup
```

默认会优先生成 API key；如果要改为短期 session key，可显式指定：

```bash
ova setup --credential session-key
```

`setup` 会写入：

- `~/.claude.json`
- `~/.cursor/mcp.json`
- `~/.codex/config.toml`
- `~/.claude/skills/openviking-admin/SKILL.md`
- `~/.cursor/skills/openviking-admin/SKILL.md`
- `~/.agents/skills/openviking-admin/SKILL.md`

### `ova init`

`init` 负责仓库级初始化：

```bash
ova init --path <repo>
```

它会在目标仓库生成或更新：

- `.openviking/capabilities.json`
- `.claude/skills/openviking-admin/SKILL.md`
- `.agents/skills/openviking-admin/SKILL.md`
- `AGENTS.md` 中的 OpenViking 注入块
- `CLAUDE.md` 中的 OpenViking 注入块

### `ova bootstrap`

`bootstrap` 会串联 `setup` 与 `init`，是推荐入口：

```bash
ova bootstrap --path <repo>
```

常见变体：

```bash
ova bootstrap --path <repo> --editor claude
ova bootstrap --path <repo> --skip-setup
ova bootstrap --path <repo> --skip-init
```

## 配置

交互式配置：

```bash
ova configure
```

直接写入 API Key：

```bash
ova configure \
  --server http://localhost:6001 \
  --api-key <YOUR_API_KEY>
```

保存 OAuth 授权地址并打开浏览器：

```bash
ova configure \
  --server http://localhost:6001 \
  --oauth-url "http://localhost:6001/api/v1/auth/sso/redirect/acme/oidc" \
  --open-browser
```

OAuth 授权沿用现有 SSO 机制：浏览器完成授权后，如果回跳地址包含 `sso_ticket`，可以在交互式配置中粘贴该 ticket，或单独执行 `ova auth sso --ticket <ticket>`。

`configure` 只负责 profile 和凭证准备；如果要连带写入 MCP / Skills / Prompt 注入，应使用 `setup` 或 `bootstrap`。

## 登录

账号密码登录：

```bash
ova auth login \
  --server http://localhost:6001 \
  --username admin \
  --password acme@123 \
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

状态文件采用多 profile 结构。当 `accessToken` 过期或接近过期时，CLI 会自动调用 `/api/v1/auth/refresh`。如果 `refreshToken` 也失效，需要重新登录。如果 profile 只配置了 API Key，CLI 会对 capability、knowledge、resources 等能力接口自动注入 `x-capability-key`。

## Profile 管理

Profile 用于隔离本地、测试、生产等环境。

```bash
ova auth login \
  --server http://localhost:6001 \
  --username admin \
  --password acme@123 \
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

选择导入目标知识库：

```bash
ova kb list
ova kb detail --id <kbId>
```

选择导入目标知识树节点：

```bash
ova tree list --kb <kbId>
ova tree detail --id <nodeId>
```

创建文档导入任务并查看进度：

```bash
ova documents import "https://example.com/product.pdf" --kb <kbId> --type url
ova documents import status --task <taskId> [--watch]
ova documents import list
ova documents import cancel --task <taskId>
ova documents import retry --task <taskId>
```

文档导入来源限定为 `local`、`url`、`manifest`。WebDAV 只用于外部客户端访问知识资源，不作为导入来源。

## 换证

查看服务端建议的凭证入口：

```bash
ova auth credential-options
```

签发 capability access token：

```bash
ova auth token-exchange --output json
ova auth token-exchange --save
ova auth token-exchange --ttl-seconds 3600 --output json
```

签发短期 session key：

```bash
ova auth session-exchange --output json
ova auth session-exchange --save
ova auth session-exchange --ttl-seconds 1800 --output json
```

签发 API key：

```bash
ova auth client-credentials --name ci-bot --output json
ova auth client-credentials --name ci-bot --save
ova auth client-credentials --name ci-bot --ttl-seconds 2592000 --output json
```

默认行为：

- 派生凭证默认只输出，不覆盖 JWT 登录态。
- 只有显式传入 `--save` 时，CLI 才会把派生凭证写入当前 profile。
- 保存后的 API Key 可作为后续能力命令的直接调用凭证。
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
ova configure [--server <url>] [--api-key <key>] [--oauth-url <url>] [--open-browser]
ova capabilities list
ova capabilities inspect --id <capability>
ova knowledge search --query <query> [--limit <n>] [--score-threshold <score>]
ova knowledge grep --pattern <pattern> [--uri <uri>] [--case-insensitive true]
ova resources list [--uri <uri>]
ova resources tree [--uri <uri>] [--depth <n>]
ova kb list
ova kb detail --id <kbId>
ova tree list --kb <kbId>
ova tree detail --id <nodeId>
ova documents import <url> --kb <kbId> [--type url|manifest|local] [--parent <nodeId>]
ova documents import status --task <taskId> [--watch]
ova documents import list
ova documents import cancel --task <taskId>
ova documents import retry --task <taskId>
ova config show
ova config set --server <url>
ova config use --profile <name>
ova doctor
```

说明：
- CLI 命令本身保持英文；错误解释、修复建议和 `ova doctor` 诊断结果默认使用中文输出，便于中文团队直接排障。
