# @openviking-admin/ova-cli

`ova` 是 OpenViking Admin 能力平台的官方命令行 adapter。

它面向开发者、CI、运维终端和本地 Agent 运行环境。CLI 调用 OpenViking Admin 公开 HTTP API，不在本地复制服务端授权规则或业务规则。

## 安装

在 npm 公网发布后，可直接安装：

```bash
npm install -g @openviking-admin/ova-cli
```

安装完成后，推荐立刻执行用户级初始化：

```bash
ova setup --server http://localhost:6001 --api-key <YOUR_API_KEY>
```

确认安装版本：

```bash
ova --version
ova -v
ova --help
ova -h
```

CLI 会在普通文本命令执行时按天检查一次 npm 最新版本；发现新版本后只输出提示和更新命令，不会自动升级，也不会影响 `--output json|jsonl` 的机器可读输出。如需临时关闭检查：

```bash
OVA_CLI_UPDATE_CHECK=0 ova doctor
```

仓库提供可重复执行的一键安装脚本，重复运行会更新全局 `ova`：

```bash
node scripts/install-ova-cli.mjs
```

Windows PowerShell 可直接执行：

```powershell
.\scripts\install-ova-cli.ps1
```

脚本会在安装完成后直接执行：

```bash
ova bootstrap --path <repo>
```

也就是一次完成 MCP、Skills 和仓库 prompt 注入。
MCP 配置按固定 server 名 `ova_mcp` 增量写入；重复执行只刷新同名配置，不会删除其他 MCP server 或 Codex 的 `[projects.*]` 配置。

如果是首次发布 scoped package，需要使用：

```bash
npm publish --access public
```

仓内开发：

```bash
npm run ova -- <group> <command> [options]
```

## 初始化命令

常用顶层命令：

```bash
ova --version
ova version
ova --help
ova help
ova doctor
```

用户级初始化：

```bash
ova setup
ova setup --credential session-key
```

仓库级初始化：

```bash
ova init --path <repo>
```

一键串联：

```bash
ova bootstrap --path <repo>
```

## 登录

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

配置 OAuth 授权地址并打开浏览器：

```bash
ova configure \
  --server http://localhost:6001 \
  --oauth-url "http://localhost:6001/api/v1/auth/sso/redirect/acme/oidc" \
  --open-browser
```

传入 `--open-browser` 后，CLI 会启动本机临时回调服务，默认地址为 `http://127.0.0.1:63637/callback`。服务端回跳 `sso_ticket` 后，CLI 会自动换取 JWT 并保存到当前 profile。授权地址既可以使用企业 SSO 入口，也可以使用 OpenViking Admin 自身账号授权入口：

```bash
ova configure \
  --server http://localhost:6001 \
  --oauth-url "http://localhost:6001/api/v1/auth/sso/authorize?tenantCode=acme" \
  --open-browser \
  --env debug
```

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

## Profile 管理

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

`--env <name>` 是 `--profile <name>` 的别名，适合在 debug、test、prod 等服务环境之间切换：

```bash
ova configure --env debug --server http://localhost:6001 --api-key <DEBUG_KEY>
ova configure --env prod --server https://admin.example.com --api-key <PROD_KEY>
ova config use --env debug
ova doctor --env prod
```

Profile 状态文件：

```text
~/.ova_cli/auth.json
```

CLI 会按 profile 保存 `accessToken`、`refreshToken`、过期时间和可选的派生 capability 凭证。登录 token 过期前会自动刷新。如果 profile 只保存了 API Key，能力接口会自动使用 `x-capability-key` 调用。

如果 profile 已经有登录态，`ova setup` 可以自动签发 API key 或 session key 供 MCP 使用。

## 能力调用

```bash
ova capabilities list
ova capabilities inspect --id knowledge.search
ova knowledge search --query "多租户隔离" --limit 5
ova knowledge grep --pattern "tenant" --uri "viking://resources/tenants/acme/"
ova resources list --uri "viking://resources/tenants/acme/"
ova resources tree --uri "viking://resources/tenants/acme/" --depth 2
ova documents extract guide --scenario api --output json
```

## 换证

```bash
ova auth credential-options
ova auth token-exchange --output json
ova auth session-exchange --output json
ova auth client-credentials --name ci-bot --save
```

派生凭证默认只输出；只有显式传入 `--save` 时，才会持久化到当前 profile。

## 输出

```bash
ova knowledge search --query "权限边界" --output text
ova knowledge search --query "权限边界" --output json
ova knowledge search --query "权限边界" --output jsonl
```

脚本建议使用 `json`，Agent 或日志管道建议使用 `jsonl`。

## 诊断命令

```bash
ova doctor
ova doctor --output json
ova doctor --output jsonl
```

`doctor` 会检查 profile 状态、token 过期时间、`/api/capabilities` 可达性，以及有凭证时的 `/api/auth/whoami`。

## 开发

```bash
npm --workspace @openviking-admin/ova-cli run test
npm --workspace @openviking-admin/ova-cli run build
npm --workspace @openviking-admin/ova-cli pack
```

## 发布

发布前建议先确认当前账号拥有 `@openviking-admin` scope 的发布权限：

```bash
npm login
npm whoami
npm access ls-packages
```

在当前目录发布：

```bash
npm version patch --no-git-tag-version
npm publish --access public
```

由于 `package.json` 已声明 `publishConfig.access=public`，直接执行 `npm publish` 也会按公开包处理；发布 scoped 公共包时仍建议显式使用 `--access public`。

完整用户文档见 `docs/CLI_GUIDE.md`。
